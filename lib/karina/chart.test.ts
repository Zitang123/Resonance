import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { renderWeekChart, CHART_WIDTH, CHART_HEIGHT } from './chart.ts';
import type { WeekCell } from './chart.ts';

const cells = (): WeekCell[] =>
  Array.from({ length: 168 }, (_, index) => ({
    day: Math.floor(index / 24),
    hour: index % 24,
    count: 0,
  }));
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function decode(png: Uint8Array) {
  assert.deepEqual(
    Array.from(png.subarray(0, 8)),
    [137, 80, 78, 71, 13, 10, 26, 10],
  );
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength),
    chunks: { type: string; bytes: Uint8Array }[] = [];
  let offset = 8;
  while (offset < png.length) {
    const length = view.getUint32(offset),
      type = new TextDecoder().decode(png.subarray(offset + 4, offset + 8)),
      bytes = png.subarray(offset + 8, offset + 8 + length);
    assert.equal(
      view.getUint32(offset + 8 + length),
      crc32(png.subarray(offset + 4, offset + 8 + length)),
      `${type} CRC`,
    );
    chunks.push({ type, bytes });
    offset += length + 12;
  }
  assert.equal(offset, png.length);
  assert.deepEqual(
    chunks.map((chunk) => chunk.type),
    ['IHDR', 'IDAT', 'IEND'],
  );
  const header = new DataView(
    chunks[0].bytes.buffer,
    chunks[0].bytes.byteOffset,
    chunks[0].bytes.byteLength,
  );
  const width = header.getUint32(0),
    height = header.getUint32(4);
  assert.deepEqual(Array.from(chunks[0].bytes.subarray(8)), [8, 2, 0, 0, 0]);
  const raw = inflateSync(chunks[1].bytes),
    stride = width * 3 + 1;
  assert.equal(raw.length, stride * height);
  for (let row = 0; row < height; row++) assert.equal(raw[row * stride], 0);
  const pixel = (x: number, y: number) =>
    Array.from(
      raw.subarray(y * stride + 1 + x * 3, y * stride + 1 + x * 3 + 3),
    );
  return { width, height, pixel, raw };
}

void test('PNG signature, dimensions, chunk checksums and decompressed RGB pixels are valid', () => {
  const input = cells();
  input[0].count = 10;
  input[1].count = 5;
  const png = renderWeekChart(input),
    decoded = decode(png);
  assert.equal(decoded.width, CHART_WIDTH);
  assert.equal(decoded.height, CHART_HEIGHT);
  assert.deepEqual(decoded.pixel(0, 0), [19, 20, 22]);
  assert.deepEqual(decoded.pixel(110, 122), [204, 135, 89]);
  assert.deepEqual(decoded.pixel(143, 122), [141, 130, 123]);
  assert.deepEqual(decoded.pixel(176, 122), [38, 39, 41]);
  assert.deepEqual(decoded.pixel(126, 122), [19, 20, 22]);
  assert.ok(png.byteLength < 50000);
});

void test('all-zero data uses neutral cell color everywhere and no colored activity legend', () => {
  const decoded = decode(renderWeekChart(cells()));
  for (let day = 0; day < 7; day++)
    for (let hour = 0; hour < 24; hour++)
      assert.deepEqual(
        decoded.pixel(110 + hour * 33, 122 + day * 25),
        [38, 39, 41],
      );
  assert.deepEqual(decoded.pixel(550, 312), [38, 39, 41]);
  assert.deepEqual(decoded.pixel(720, 318), [19, 20, 22]);
});

void test('cell coordinates control position independently of input ordering', () => {
  const input = cells();
  input[6 * 24 + 23].count = 4;
  assert.deepEqual(
    renderWeekChart(input),
    renderWeekChart([...input].reverse()),
  );
  const decoded = decode(renderWeekChart(input));
  assert.deepEqual(decoded.pixel(110 + 23 * 33, 122 + 6 * 25), [204, 135, 89]);
  assert.deepEqual(decoded.pixel(110, 122), [38, 39, 41]);
});

void test('render is deterministic, source label changes pixels, and source text draws inside the chart', () => {
  const input = cells();
  input[14].count = 5;
  const a = renderWeekChart(input, 'LAST.FM / EUROPE/LONDON');
  assert.deepEqual(a, renderWeekChart(input, 'LAST.FM / EUROPE/LONDON'));
  assert.notDeepEqual(a, renderWeekChart(input, 'LISTENBRAINZ / UTC'));
  const decoded = decode(a);
  assert.deepEqual(decoded.pixel(32, 369), [145, 147, 150]);
  assert.deepEqual(input[14], { day: 0, hour: 14, count: 5 });
});

void test('invalid shapes, duplicate coordinates, negative/noninteger counts and unsafe totals are rejected', () => {
  assert.throws(() => renderWeekChart([]), /168/);
  const duplicated = cells();
  duplicated[1] = duplicated[0];
  assert.throws(() => renderWeekChart(duplicated), /duplicate/);
  for (const invalid of [
    { day: -1 },
    { day: 7 },
    { hour: 24 },
    { hour: 1.5 },
    { count: -1 },
    { count: 1.5 },
    { count: NaN },
    { count: Infinity },
    { count: Number.MAX_SAFE_INTEGER + 1 },
  ]) {
    const input = cells();
    input[0] = { ...input[0], ...invalid };
    assert.throws(() => renderWeekChart(input), /day 0/);
  }
  const overflow = cells();
  overflow[0].count = Number.MAX_SAFE_INTEGER;
  overflow[1].count = 1;
  assert.throws(() => renderWeekChart(overflow), /total/);
  assert.throws(() => renderWeekChart(cells(), 'a\nlabel'), /source label/);
  assert.throws(
    () => renderWeekChart(cells(), 'a'.repeat(121)),
    /source label/,
  );
});
