#!/usr/bin/env python3
"""Dafterche character pipeline — one source render into the shipped companion art.

Source of truth
---------------
``assets/characters/qorqori/qorqori-master.png`` — high-resolution render of Qorqori,
drawn on a nearly flat cream field. Unlike the icon pipeline (nimble-squircle,
edge-to-edge), a character is a *cut-out*: it has to sit on paper, on the deep-ink
and night themes alike, so the field has to go.

The field is close to uniform but drifts slightly. To ensure clean separation
without eating the eye whites, leaving floor shadow, or keeping glowing rim halos:
  1. Character seeds identify the green clay body and dark facial features
     (eyebrows, eyes, mouth).
  2. An iterative flood fill walks in from the borders through non-character
     pixels, identifying the field background while keeping enclosed regions
     (such as eye whites) fully protected.
  3. A soft distance ramp is applied along the outer rim so the outline keeps
     an anti-aliased edge instead of a stair-step binary mask.
  4. The edge is de-fringed — ``C = (observed - (1-a)*field) / a`` — and any
     residual studio rim light / pale edge fringe is eliminated, ensuring zero
     glowing halos against dark themes.
  5. The truecolor RGBA format preserves the natural, tactile clay texture,
     subtle micro-porosity, and organic lighting gradients without color posterization.

The result ships as an optimized PNG, framed to FIGURE_HEIGHT (87.5%)
centered in a 512x512 square canvas.

Run it directly: ``python scripts/generate-character.py``.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance

ROOT = Path(__file__).resolve().parent.parent
CHAR_DIR = ROOT / "assets" / "characters" / "qorqori"
SOURCE = CHAR_DIR / "qorqori-master.png"
OUTPUT = CHAR_DIR / "qorqori.png"

WORK = 1024
MASTER = 512
FIGURE_HEIGHT = 0.875

ALPHA_LO = 7.0
ALPHA_HI = 24.0
DEFRINGE_MIN = 0.05


def _field_colour(rgb: np.ndarray) -> np.ndarray:
    """The field's own colour, taken from a strip around the edge."""
    strip = np.concatenate([
        rgb[:10].reshape(-1, 3), rgb[-10:].reshape(-1, 3),
        rgb[:, :10].reshape(-1, 3), rgb[:, -10:].reshape(-1, 3),
    ])
    return np.median(strip, axis=0)


def _figure_seed(rgb: np.ndarray) -> np.ndarray:
    """Pixels definitively belonging to the figure's body or facial features."""
    r, g, b = rgb[:, :, 0].astype(int), rgb[:, :, 1].astype(int), rgb[:, :, 2].astype(int)
    is_green = (g > r + 3) & (g > b + 3)
    is_dark = (r < 80) & (g < 80) & (b < 80)
    return is_green | is_dark


def _reached_from_border(non_char: np.ndarray) -> np.ndarray:
    """Which non-character pixels can be reached from the canvas borders."""
    height, width = non_char.shape
    seen = np.zeros((height, width), dtype=bool)
    stack: list[tuple[int, int]] = []

    for x in range(width):
        for y in (0, height - 1):
            if non_char[y, x] and not seen[y, x]:
                seen[y, x] = True
                stack.append((y, x))
    for y in range(height):
        for x in (0, width - 1):
            if non_char[y, x] and not seen[y, x]:
                seen[y, x] = True
                stack.append((y, x))

    while stack:
        y, x = stack.pop()
        if y > 0 and non_char[y - 1, x] and not seen[y - 1, x]:
            seen[y - 1, x] = True
            stack.append((y - 1, x))
        if y + 1 < height and non_char[y + 1, x] and not seen[y + 1, x]:
            seen[y + 1, x] = True
            stack.append((y + 1, x))
        if x > 0 and non_char[y, x - 1] and not seen[y, x - 1]:
            seen[y, x - 1] = True
            stack.append((y, x - 1))
        if x + 1 < width and non_char[y, x + 1] and not seen[y, x + 1]:
            seen[y, x + 1] = True
            stack.append((y, x + 1))

    return seen


def cut_out(rgb: np.ndarray) -> Image.Image:
    """The figure alone, on transparency, trimmed to its own bounding box."""
    field = _field_colour(rgb)
    distance = np.abs(rgb.astype(np.int16) - field).max(axis=2).astype(np.float32)

    is_char = _figure_seed(rgb)
    outside = _reached_from_border(~is_char)
    inside = ~outside

    # Soft boundary transition rim (outside dilated 4 steps & inside)
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

    ramp = np.clip((distance - ALPHA_LO) / (ALPHA_HI - ALPHA_LO), 0.0, 1.0)
    alpha = np.zeros(rgb.shape[:2], dtype=np.float32)
    alpha[inside & ~rim] = 1.0
    alpha[rim] = ramp[rim]

    # De-fringing: C = (observed - (1-a)*field) / a
    rgb_work = rgb.astype(np.float32)
    recoverable = (alpha > DEFRINGE_MIN) & (alpha < 0.99)
    opaque = np.maximum(alpha[..., None], DEFRINGE_MIN)
    unfringed = np.clip((rgb_work - (1.0 - opaque) * field) / opaque, 0, 255)
    rgb_work = np.where(recoverable[..., None], unfringed, rgb_work)

    # Suppress pale studio rim light along the silhouette:
    body_interior = inside & ~rim & is_char
    target_green = np.median(rgb_work[body_interior], axis=0)
    is_pale_rim = rim & (rgb_work[:, :, 1] > target_green[1])
    excess = np.clip((rgb_work[:, :, 1] - target_green[1]) / 40.0, 0.0, 0.8)[..., None]
    rgb_work = np.where(is_pale_rim[..., None], (1.0 - excess) * rgb_work + excess * target_green, rgb_work)

    # Clean any residual pale fringe on the outer edge
    is_pale = (rgb_work[:, :, 0] > 200) & (rgb_work[:, :, 1] > 200) & (rgb_work[:, :, 2] > 200) & rim
    alpha[is_pale] = 0.0

    out = np.concatenate([rgb_work, (alpha * 255.0)[..., None]], axis=2)
    rgba = Image.fromarray(out.round().astype(np.uint8), "RGBA")

    box = rgba.getchannel("A").point(lambda v: 255 if v > 6 else 0).getbbox()
    return rgba.crop(box) if box else rgba


def reframe(figure: Image.Image, master: int) -> Image.Image:
    """The trimmed figure, centred in the square canvas every size expects."""
    target = FIGURE_HEIGHT * master
    scale = target / figure.height
    width = max(1, round(figure.width * scale))
    resized = figure.resize((width, round(target)), Image.LANCZOS)

    # Subtle organic texture enhancement: fine-tune contrast and tactile clay feel
    enhancer = ImageEnhance.Sharpness(resized)
    sharpened = enhancer.enhance(1.15)
    sharpened.putalpha(resized.getchannel("A"))

    square = Image.new("RGBA", (master, master), (0, 0, 0, 0))
    square.paste(sharpened, ((master - width) // 2, (master - resized.height) // 2), sharpened)
    return square


def build() -> Image.Image:
    source = Image.open(SOURCE)
    if source.mode != "RGB":
        source = source.convert("RGB")
    arr = np.asarray(source)
    field = _field_colour(arr)
    diff = np.abs(arr.astype(np.int16) - field).max(axis=2)
    rows, cols = np.where(diff > 20)

    pad = 40
    y0 = max(0, rows.min() - pad)
    y1 = min(arr.shape[0], rows.max() + 1 + pad)
    x0 = max(0, cols.min() - pad)
    x1 = min(arr.shape[1], cols.max() + 1 + pad)

    cropped = arr[y0:y1, x0:x1]
    return reframe(cut_out(cropped), MASTER)


def main() -> int:
    if not SOURCE.exists():
        print(f"Missing source render: {SOURCE}", file=sys.stderr)
        return 1

    art = build()
    # Final pass on reframed silhouette edge to ensure zero pale rim pixels survive
    arr = np.array(art)
    alpha = arr[:, :, 3]
    h, w = alpha.shape
    is_clear = lambda x, y: x < 0 or y < 0 or x >= w or y >= h or alpha[y, x] < 8
    for y in range(h):
        for x in range(w):
            if alpha[y, x] < 250:
                continue
            on_edge = any((dx or dy) and is_clear(x + dx, y + dy) for dy in (-1, 0, 1) for dx in (-1, 0, 1))
            if on_edge:
                r, g, b = arr[y, x, :3]
                if r > 215 and g > 215 and b > 215:
                    arr[y, x, 3] = 0
    art = Image.fromarray(arr)
    art.save(OUTPUT, "PNG", optimize=True, compress_level=9)

    alpha = np.asarray(art.getchannel("A"))
    print(f"wrote {OUTPUT.relative_to(ROOT)}  {art.size[0]}x{art.size[1]}  {OUTPUT.stat().st_size / 1024:.1f} KB")
    print(f"  figure {(alpha > 0).sum()} px, of which {((alpha > 0) & (alpha < 255)).sum()} are a soft rim")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
