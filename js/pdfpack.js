/* ═══ PDF pack — the books' files in one ordinary .zip ═══
   The JSON backup (js/backup.js) leaves the PDF files out: they live in IndexedDB
   and can be large. This is the way those files travel — as a plain zip, so the
   person can also open it with any tool and find their PDFs inside.

   Only the "stored" method is written and read (no compression — a PDF is
   already compressed, and it keeps the code small enough to trust). Files are
   handled as Blobs, never joined into one big buffer, so a library of a few
   hundred megabytes does not have to fit in memory at once. Pure: it knows
   nothing about the DOM or IndexedDB. */

const SIG_LOCAL = 0x04034b50, SIG_CENTRAL = 0x02014b50, SIG_END = 0x06054b50;
const TEXT = new TextEncoder();

let table = null;
export function crc32(bytes, crc = 0) {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  }
  let c = ~crc >>> 0;
  for (let i = 0; i < bytes.length; i++) c = table[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

const u16 = n => [n & 255, (n >>> 8) & 255];
const u32 = n => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];

/* entries: [{ name, blob }] → Blob (a zip) */
export async function buildZip(entries) {
  const parts = [], central = [];
  let offset = 0;
  for (const { name, blob } of entries) {
    const nameBytes = TEXT.encode(name);
    const crc = crc32(new Uint8Array(await blob.arrayBuffer()));
    if (blob.size >= 0xffffffff) throw new Error('file too large for this pack');
    const local = new Uint8Array([
      ...u32(SIG_LOCAL), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21),
      ...u32(crc), ...u32(blob.size), ...u32(blob.size), ...u16(nameBytes.length), ...u16(0), ...nameBytes,
    ]);
    parts.push(local, blob);
    central.push(new Uint8Array([
      ...u32(SIG_CENTRAL), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21),
      ...u32(crc), ...u32(blob.size), ...u32(blob.size), ...u16(nameBytes.length), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...nameBytes,
    ]));
    offset += local.length + blob.size;
  }
  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array([
    ...u32(SIG_END), ...u16(0), ...u16(0), ...u16(entries.length), ...u16(entries.length),
    ...u32(centralSize), ...u32(offset), ...u16(0),
  ]);
  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}

/* A zip (as a Blob/File) → [{ name, blob }]. Only stored entries are read; anything
   else — a compressed entry, zip64, a damaged directory — throws, and the caller
   says «این فایل پک دفترچه نیست». */
export async function readZip(file) {
  const tailLen = Math.min(file.size, 66000);
  const tail = new Uint8Array(await file.slice(file.size - tailLen).arrayBuffer());
  let end = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 5 && tail[i + 3] === 6) { end = i; break; }
  }
  if (end < 0) throw new Error('not a zip');
  const dv = new DataView(tail.buffer, tail.byteOffset + end, 22);
  const count = dv.getUint16(10, true), cdSize = dv.getUint32(12, true), cdOff = dv.getUint32(16, true);
  if (cdOff === 0xffffffff || cdOff + cdSize > file.size) throw new Error('unsupported zip');
  const cd = new Uint8Array(await file.slice(cdOff, cdOff + cdSize).arrayBuffer());
  const cdv = new DataView(cd.buffer);
  const out = [];
  let p = 0;
  for (let i = 0; i < count; i++) {
    if (p + 46 > cd.length || cdv.getUint32(p, true) !== SIG_CENTRAL) throw new Error('bad directory');
    const method = cdv.getUint16(p + 10, true), size = cdv.getUint32(p + 24, true), csize = cdv.getUint32(p + 20, true);
    const nameLen = cdv.getUint16(p + 28, true), extraLen = cdv.getUint16(p + 30, true), commentLen = cdv.getUint16(p + 32, true);
    const localOff = cdv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(cd.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (method !== 0 || size !== csize || size === 0xffffffff) throw new Error('unsupported entry');
    const lh = new DataView(await file.slice(localOff, localOff + 30).arrayBuffer());
    if (lh.getUint32(0, true) !== SIG_LOCAL) throw new Error('bad entry');
    const start = localOff + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
    if (start + size > file.size) throw new Error('truncated');
    out.push({ name, blob: file.slice(start, start + size) });
  }
  return out;
}

/* Is this Blob a PDF? Every PDF opens with «%PDF-». */
export async function looksLikePdf(blob) {
  const head = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
  return head.length === 5 && String.fromCharCode(...head) === '%PDF-';
}
