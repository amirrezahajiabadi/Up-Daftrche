#!/usr/bin/env python3
"""Dafterche icon pipeline — turns the single source render into every shipped icon.

Source of truth
---------------
``assets/icons/master-logo.jpg`` (a 1024x1024 *photo-style* render of the new
mascot: a green felt squircle with eyes, brows, a gentle smile, a dark-green
front pocket and a folded terracotta note peeking out). It is really a PNG that
happens to carry a .jpg name, drawn on a cream field with a soft drop shadow.

The render is lit hard from the top-left, so its felt runs from a near-white
highlight down to a muddy shadow, and its edge is anti-aliased into the cream
field. Left alone, an edge-to-edge icon built from it reads as a washed-out tile
with a pale, almost white, top-left border. The pipeline therefore:

  1. crops the squircle to its own bounding box (never inside its corners, so the
     face and pocket are not over-zoomed and stay inside the central safe zone);
  2. refills everything outside the mark — cream, drop shadow and anti-aliased
     rim — by growing the adjacent felt inwards, so felt runs to every edge;
  3. compresses the felt's lighting into a tight range so nothing at the border
     reads as white while the felt keeps a little depth;
  4. lifts the colour's saturation off grey-sage and onto a clear green;
  5. removes the sensor-style grain with a median pass and restores edge
     definition with a gentle unsharp mask — this is what makes a 16px frame legible
     and what makes the PNGs small enough to ship.

Two masters come out of it:

  FULL-BLEED  the edge-to-edge felt square above;
  SQUIRCLE    the same square behind a smooth, anti-aliased squircle alpha mask
              (corner radius 22.37% of the side, the Apple/Android curvature).

Every raster icon is resampled from the native crop with Lanczos — never from a
already-upscaled copy — so small sizes stay sharp. Run it through
``node scripts/sync-icons.mjs`` (which calls this file and then fingerprints the
resulting URLs), or directly: ``python scripts/generate-icons.py``.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

CREAM = np.array([243, 239, 227])

# Squircle curvature, as a fraction of the icon side (Apple/Android continuous).
SQUIRCLE_RADIUS_RATIO = 0.2237

# Felt finishing. The source highlight is far brighter than the felt's own body;
# pulling the bright end down is what removes the "white edge". K_HIGH/K_LOW are
# how much of the lighting range survives above/below the felt's mid tone.
K_HIGH = 0.45
K_LOW = 0.75
SATURATION = 1.18
RIM_ERODE = 3          # px of pale anti-aliased rim refilled at the border
CLEAN_MEDIAN = 7       # grain-removal window — a median keeps edges, unlike a blur
UNSHARP = dict(radius=1.6, percent=70, threshold=3)
PALETTE_COLOURS = 256  # the flat icons ship as indexed PNGs: same look, a fraction of the bytes

# Android adaptive-icon geometry: 108dp canvas, 66dp guaranteed-safe centre.
ADAPTIVE_CANVAS_DP = 108
ADAPTIVE_SAFE_DP = 66
ANDROID_DENSITIES = {
    "mdpi": (48, 108),
    "hdpi": (72, 162),
    "xhdpi": (96, 216),
    "xxhdpi": (144, 324),
    "xxxhdpi": (192, 432),
}

# Windows picks the frame that matches the requested size; supplying the common
# in-between sizes stops it from rescaling a mismatched one.
ICO_SIZES = (16, 24, 32, 48, 64, 128, 256)

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / "assets" / "icons"
SOURCE = ICONS / "master-logo.jpg"


# ─────────────────────────────────────────────────────────────────────────────
# Source analysis
# ─────────────────────────────────────────────────────────────────────────────
def _body_mask(rgb: np.ndarray) -> np.ndarray:
    """The squircle itself: felt, the dark linework and the terracotta note."""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    cream = np.abs(rgb - CREAM).sum(axis=2) < 45
    felt = (g >= r) & (g >= b) & (rgb.sum(axis=2) > 210)
    dark = (0.299 * r + 0.587 * g + 0.114 * b) < 110
    note = (r >= g + 20) & (r >= b + 20)
    return (felt | dark | note) & ~cream


def _neighbours(arr: np.ndarray, dy: int, dx: int) -> np.ndarray:
    """``arr`` shifted by (dy, dx) with edge clamping — no wrap-around."""
    pad = ((1, 1), (1, 1)) + ((0, 0),) * (arr.ndim - 2)
    padded = np.pad(arr, pad, mode="edge")
    height, width = arr.shape[:2]
    return padded[1 + dy:1 + dy + height, 1 + dx:1 + dx + width]


def _erode(mask: np.ndarray, iterations: int) -> np.ndarray:
    out = mask.copy()
    for _ in range(iterations):
        shrunk = out.copy()
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            shrunk &= _neighbours(out, dy, dx)
        out = shrunk
    return out


def _border_background(background: np.ndarray) -> np.ndarray:
    """Background reachable from the frame edge — i.e. everything outside the mark.

    Interior light pixels (eye glints) are not connected to the border, so they
    are excluded and the mark's own highlights survive the refill.
    """
    reached = np.zeros_like(background)
    reached[0, :] = background[0, :]
    reached[-1, :] = background[-1, :]
    reached[:, 0] = background[:, 0]
    reached[:, -1] = background[:, -1]
    while True:
        grown = reached.copy()
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            grown |= _neighbours(reached, dy, dx)
        grown &= background
        if grown.sum() == reached.sum():
            return reached
        reached = grown


def _rounded_rect_mask(size: int, radius_ratio: float, supersample: int = 4) -> np.ndarray:
    """Anti-aliased squircle coverage in [0, 1] for a square of ``size`` px."""
    n = size * supersample
    r = radius_ratio * n
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float64)
    cx = np.clip(xx, r, n - r)
    cy = np.clip(yy, r, n - r)
    inside = (np.hypot(xx - cx, yy - cy) <= r).astype(np.float64)
    return inside.reshape(size, supersample, size, supersample).mean(axis=(1, 3))


def _circle_mask(size: int, supersample: int = 4) -> np.ndarray:
    n = size * supersample
    c = (n - 1) / 2
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float64)
    inside = (np.hypot(xx - c, yy - c) <= n / 2 - 0.5).astype(np.float64)
    return inside.reshape(size, supersample, size, supersample).mean(axis=(1, 3))


# ─────────────────────────────────────────────────────────────────────────────
# Edge-to-edge felt
# ─────────────────────────────────────────────────────────────────────────────
def _nearest_fill(rgb: np.ndarray, unknown: np.ndarray, iterations: int) -> np.ndarray:
    """Grow the known pixels into ``unknown`` by 8-neighbour averaging."""
    values = rgb.astype(np.float64).copy()
    known = ~unknown
    for _ in range(iterations):
        if known.all():
            break
        acc = np.zeros_like(values)
        count = np.zeros(values.shape[:2], dtype=np.float64)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dy == 0 and dx == 0:
                    continue
                shifted_known = _neighbours(known, dy, dx)
                acc += _neighbours(values, dy, dx) * shifted_known[..., None]
                count += shifted_known
        fresh = (~known) & (count > 0)
        if not fresh.any():
            break
        values[fresh] = acc[fresh] / count[fresh][:, None]
        known = known | fresh
    return values


def _extend_corners(crop: np.ndarray, unknown: np.ndarray) -> np.ndarray:
    """Fill everything outside the mark from the neighbouring felt, coarse-to-fine."""
    height, width = unknown.shape
    scale = 8
    small = max(8, width // scale)
    coarse_rgb = np.asarray(
        Image.fromarray(crop.astype(np.uint8)).resize((small, small), Image.LANCZOS),
        dtype=np.uint8,
    )
    coarse_unknown = np.asarray(
        Image.fromarray((unknown * 255).astype(np.uint8)).resize((small, small), Image.NEAREST),
    ) > 127
    coarse = _nearest_fill(coarse_rgb, coarse_unknown, iterations=small)

    seed = np.asarray(
        Image.fromarray(np.clip(coarse, 0, 255).astype(np.uint8)).resize(
            (width, height), Image.LANCZOS,
        ),
        dtype=np.float64,
    )
    filled = crop.astype(np.float64).copy()
    filled[unknown] = seed[unknown]
    filled = _nearest_fill(filled, unknown, iterations=6)

    # Relax the seams where growing fronts meet.
    softened = np.asarray(
        Image.fromarray(np.clip(filled, 0, 255).astype(np.uint8)).filter(
            ImageFilter.GaussianBlur(1.2),
        ),
        dtype=np.float64,
    )
    filled[unknown] = softened[unknown]
    return filled


def _smooth_field(lum: np.ndarray, radius: float) -> np.ndarray:
    """A heavily blurred copy of ``lum``: the local lighting, free of features."""
    return np.asarray(
        Image.fromarray(np.clip(lum, 0, 255).astype(np.uint8)).filter(
            ImageFilter.GaussianBlur(radius),
        ),
        dtype=np.float64,
    )


def _level_lighting(rgb: np.ndarray) -> np.ndarray:
    """Compress the felt's lighting range and lift its saturation.

    The gain is a smooth field, so it scales the whole tile consistently and the
    features keep their contrast instead of being flattened.
    """
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    side = rgb.shape[0]
    light = _smooth_field(lum, side * 0.12)

    felt = (g >= r - 4) & (g >= b) & (lum > 90)
    if felt.any():
        mid = float(np.median(light[felt]))
    else:
        mid = float(np.median(light))
    keep = np.where(light >= mid, K_HIGH, K_LOW)
    target = mid + (light - mid) * keep
    gain = np.clip(target / np.maximum(light, 1.0), 0.55, 1.6)[..., None]
    out = rgb * gain

    out_lum = 0.299 * out[..., 0] + 0.587 * out[..., 1] + 0.114 * out[..., 2]
    out = out_lum[..., None] + (out - out_lum[..., None]) * SATURATION
    return np.clip(out, 0, 255)


def _clean_felt(rgb: np.ndarray) -> np.ndarray:
    """Drop the render's grain and put a crisp edge back on the features.

    A median removes the speckle without smearing the linework, and the unsharp
    that follows restores the edges it must not touch. Together they are what
    make a 16px frame legible and what let these PNGs compress.
    """
    image = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8))
    image = image.filter(ImageFilter.MedianFilter(CLEAN_MEDIAN))
    return np.asarray(image.filter(ImageFilter.UnsharpMask(**UNSHARP)), dtype=np.float64)


# ─────────────────────────────────────────────────────────────────────────────
# Build the master
# ─────────────────────────────────────────────────────────────────────────────
def build_master() -> Image.Image:
    source = np.asarray(Image.open(SOURCE).convert("RGB"), dtype=np.uint8)
    height, width = source.shape[:2]

    body = _body_mask(source)
    ys, xs = np.where(body)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    side = max(x1 - x0 + 1, y1 - y0 + 1)
    cx, cy = (x0 + x1) / 2.0, (y0 + y1) / 2.0
    left = max(0, min(int(round(cx - side / 2.0)), width - side))
    top = max(0, min(int(round(cy - side / 2.0)), height - side))
    crop = source[top:top + side, left:left + side].copy()

    # Refill the cream field, the drop shadow AND the pale anti-aliased rim: the
    # mask is eroded first so the refill does not inherit the rim's highlight.
    body_crop = _erode(body[top:top + side, left:left + side], RIM_ERODE)
    unknown = _border_background(~body_crop)
    full_bleed = _extend_corners(crop, unknown)
    finished = _clean_felt(_level_lighting(full_bleed))

    master = Image.fromarray(np.clip(finished, 0, 255).astype(np.uint8))
    master.info.pop("icc_profile", None)
    return master


def feature_fraction(master: Image.Image) -> float:
    """Largest fraction of the master occupied by the face/pocket/note cluster."""
    rgb = np.asarray(master.convert("RGB"), dtype=np.int16)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    luminance = 0.299 * r + 0.587 * g + 0.114 * b
    note = (r >= g + 20) & (r >= b + 20)
    dark = luminance < 120
    side = master.size[0]
    interior = np.zeros(rgb.shape[:2], dtype=bool)
    inset = int(side * 0.10)
    interior[inset:side - inset, inset:side - inset] = True
    features = (dark | note) & interior
    ys, xs = np.where(features)
    span = max(xs.max() - xs.min() + 1, ys.max() - ys.min() + 1)
    return span / side


# ─────────────────────────────────────────────────────────────────────────────
# Emission
# ─────────────────────────────────────────────────────────────────────────────
def _resize(image: Image.Image, size: int) -> Image.Image:
    """Lanczos resample straight from the native master."""
    return image.resize((size, size), Image.LANCZOS)


def _sharpen(image: Image.Image, percent: int) -> Image.Image:
    return image.filter(ImageFilter.UnsharpMask(radius=0.6, percent=percent, threshold=2))


def _flatten(image: Image.Image) -> Image.Image:
    """Index a flat, opaque icon: identical on screen, far smaller on disk."""
    return image.convert("RGB").quantize(
        colors=PALETTE_COLOURS, method=Image.MEDIANCUT, dither=Image.Dither.NONE,
    )


def _with_alpha(image: Image.Image, alpha: np.ndarray, size: int) -> Image.Image:
    rgba = _resize(image.convert("RGB"), size).convert("RGBA")
    a = np.asarray(rgba).copy()
    a[..., 3] = np.clip(alpha * 255.0, 0, 255).astype(np.uint8)
    return Image.fromarray(a, "RGBA")


def build_cutout_squircle() -> Image.Image:
    """The genuine 3D squircle mascot cutout, halo-free on transparent canvas."""
    source = np.asarray(Image.open(SOURCE).convert("RGB"), dtype=np.uint8)
    strip = np.concatenate([
        source[:10].reshape(-1, 3), source[-10:].reshape(-1, 3),
        source[:, :10].reshape(-1, 3), source[:, -10:].reshape(-1, 3),
    ])
    field = np.median(strip, axis=0)

    r = source[:, :, 0].astype(int)
    g = source[:, :, 1].astype(int)
    b = source[:, :, 2].astype(int)
    is_green = (g > r + 3) & (g > b + 3)
    is_dark = (0.299 * r + 0.587 * g + 0.114 * b) < 110
    is_note = (r >= g + 20) & (r >= b + 20)
    is_mascot = is_green | is_dark | is_note

    height, width = is_mascot.shape
    outside = np.zeros((height, width), dtype=bool)
    stack = []
    for x in range(width):
        if not is_mascot[0, x]:
            outside[0, x] = True
            stack.append((0, x))
        if not is_mascot[height - 1, x]:
            outside[height - 1, x] = True
            stack.append((height - 1, x))
    for y in range(height):
        if not is_mascot[y, 0]:
            outside[y, 0] = True
            stack.append((y, 0))
        if not is_mascot[y, width - 1]:
            outside[y, width - 1] = True
            stack.append((y, width - 1))

    while stack:
        y, x = stack.pop()
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < height and 0 <= nx < width and not is_mascot[ny, nx] and not outside[ny, nx]:
                outside[ny, nx] = True
                stack.append((ny, nx))

    inside = ~outside

    rim = np.zeros_like(outside)
    curr = outside.copy()
    for _ in range(4):
        dilated = curr.copy()
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dx or dy:
                    dilated |= np.roll(np.roll(curr, dy, axis=0), dx, axis=1)
        rim |= (dilated & inside)
        curr = dilated

    distance = np.abs(source.astype(np.int16) - field).max(axis=2).astype(np.float32)
    alpha = np.zeros(source.shape[:2], dtype=np.float32)
    alpha[inside & ~rim] = 1.0
    ramp = np.clip((distance - 6.0) / (22.0 - 6.0), 0.0, 1.0)
    alpha[rim] = ramp[rim]

    rgb_work = source.astype(np.float32)
    recoverable = (alpha > 0.05) & (alpha < 0.99)
    opaque = np.maximum(alpha[..., None], 0.05)
    unfringed = np.clip((rgb_work - (1.0 - opaque) * field) / opaque, 0, 255)
    rgb_work = np.where(recoverable[..., None], unfringed, rgb_work)

    body_interior = inside & ~rim & is_green
    target_green = np.median(rgb_work[body_interior], axis=0)
    is_pale_rim = rim & (rgb_work[:, :, 1] > target_green[1])
    excess = np.clip((rgb_work[:, :, 1] - target_green[1]) / 35.0, 0.0, 0.75)[..., None]
    rgb_work = np.where(is_pale_rim[..., None], (1.0 - excess) * rgb_work + excess * target_green, rgb_work)

    is_pale = (rgb_work[:, :, 0] > 200) & (rgb_work[:, :, 1] > 200) & (rgb_work[:, :, 2] > 200) & rim
    alpha[is_pale] = 0.0

    out = np.concatenate([rgb_work, (alpha * 255.0)[..., None]], axis=2)
    rgba = Image.fromarray(out.round().astype(np.uint8), "RGBA")

    box = rgba.getchannel("A").point(lambda v: 255 if v > 6 else 0).getbbox()
    cropped = rgba.crop(box)

    size = 1024
    target_h = int(size * 0.94)
    scale = target_h / cropped.height
    w = max(1, round(cropped.width * scale))
    h = target_h
    resized = cropped.resize((w, h), Image.LANCZOS)

    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(resized, ((size - w) // 2, (size - h) // 2), resized)
    return canvas


def generate() -> list[Path]:
    master = build_master()
    squircle_cutout = build_cutout_squircle()
    feature = feature_fraction(master)
    written: list[Path] = []

    def save(image: Image.Image, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        image.save(path, optimize=True, compress_level=9)
        written.append(path)

    # Desktop/electron master and the transparent squircle master:
    electron = _resize(squircle_cutout, 1024)
    save(_sharpen(electron, 45), ICONS / "daftarche-electron.png")
    save(_resize(squircle_cutout, 512), ICONS / "daftarche-squircle.png")

    # Web/PWA "any" icons — transparent squircle cutout:
    save(_resize(squircle_cutout, 512), ICONS / "icon-512.png")
    save(_resize(squircle_cutout, 192), ICONS / "icon-192.png")

    # Maskable icons — full bleed, features inside the central safe zone:
    save(_flatten(_resize(master.convert("RGB"), 512)), ICONS / "icon-maskable-512.png")
    save(_flatten(_resize(master.convert("RGB"), 192)), ICONS / "icon-maskable-192.png")

    # iOS home-screen icon — full bleed, opaque:
    save(_flatten(_resize(master.convert("RGB"), 180)), ICONS / "apple-touch-icon.png")

    # Windows/desktop ICO: one frame per size, each resampled from the squircle cutout,
    # with transparent background so the mascot floats directly on the Windows desktop/taskbar!
    frames = []
    for size in ICO_SIZES:
        frame = _resize(squircle_cutout, size)
        frames.append(_sharpen(frame, 120) if size <= 48 else frame)
    base = max(frames, key=lambda f: f.size[0])
    base.save(
        ICONS / "daftarche.ico", format="ICO",
        sizes=[f.size for f in frames],
        append_images=[f for f in frames if f is not base],
    )
    written.append(ICONS / "daftarche.ico")

    # Android launcher set:
    safe_ratio = ADAPTIVE_SAFE_DP / ADAPTIVE_CANVAS_DP
    for density, (launcher, foreground) in ANDROID_DENSITIES.items():
        directory = ICONS / "android" / f"mipmap-{density}"

        save(_resize(squircle_cutout, launcher), directory / "ic_launcher.png")
        save(
            _with_alpha(master, _circle_mask(launcher), launcher),
            directory / "ic_launcher_round.png",
        )

        # Adaptive foreground: mark scaled so the face/pocket land inside 66dp.
        scale = (safe_ratio / feature) if feature else safe_ratio
        mark = max(8, int(round(foreground * scale)))
        canvas = Image.new("RGBA", (foreground, foreground), (0, 0, 0, 0))
        canvas.alpha_composite(
            _resize(squircle_cutout, mark),
            ((foreground - mark) // 2, (foreground - mark) // 2),
        )
        save(canvas, directory / "ic_launcher_foreground.png")

    return written


def main() -> int:
    if not SOURCE.exists():
        print(f"missing source render: {SOURCE}", file=sys.stderr)
        return 1
    paths = generate()
    total = 0
    for path in paths:
        size = path.stat().st_size
        total += size
        print(f"{size / 1024:8.1f} KB  {path.relative_to(ROOT).as_posix()}")
    print(f"{total / 1024:8.1f} KB  total across {len(paths)} files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
