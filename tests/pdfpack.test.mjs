import test from 'node:test';
import assert from 'node:assert/strict';
import { crc32, buildZip, readZip, looksLikePdf } from '../js/pdfpack.js';

const pdf = (s) => new Blob([`%PDF-1.4\n${s}`], { type: 'application/pdf' });

test('crc32 matches the standard check value', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('a pack round-trips names and bytes', async () => {
  const zip = await buildZip([{ name: 'a.pdf', blob: pdf('one') }, { name: 'ب.pdf', blob: pdf('two two') }]);
  const back = await readZip(zip);
  assert.deepEqual(back.map(e => e.name), ['a.pdf', 'ب.pdf']);
  assert.equal(await back[0].blob.text(), '%PDF-1.4\none');
  assert.equal(await back[1].blob.text(), '%PDF-1.4\ntwo two');
});

test('an empty pack is readable and empty', async () => {
  assert.deepEqual(await readZip(await buildZip([])), []);
});

test('files that are not packs are refused', async () => {
  await assert.rejects(readZip(new Blob(['hello world, definitely not a zip file at all'])));
  await assert.rejects(readZip(new Blob([])));
});

test('a truncated pack is refused', async () => {
  const zip = await buildZip([{ name: 'a.pdf', blob: pdf('x'.repeat(100)) }]);
  await assert.rejects(readZip(zip.slice(0, zip.size - 10)));
});

test('looksLikePdf checks the header', async () => {
  assert.equal(await looksLikePdf(pdf('x')), true);
  assert.equal(await looksLikePdf(new Blob(['<html>'])), false);
  assert.equal(await looksLikePdf(new Blob([])), false);
});
