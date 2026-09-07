/* oxlint-disable no-control-regex -- Reject or strip untrusted control characters at provider boundaries. */
import { deflateSync } from 'node:zlib';

export type WeekCell = { day: number; hour: number; count: number };
export const CHART_WIDTH = 960;
export const CHART_HEIGHT = 400;
const BACKGROUND = [19, 20, 22] as const;
const EMPTY = [38, 39, 41] as const;
const TEXT = [231, 226, 216] as const;
const MUTED = [145, 147, 150] as const;
const BLUE = [78, 124, 157] as const;
const COPPER = [204, 135, 89] as const;
type Color = readonly [number, number, number];

// A tiny original bitmap alphabet keeps PNG generation independent of fonts,
// image libraries, browser canvas and network resources. Each digit is a row.
const FONT: Record<string, number[]> = {
  A: [14, 17, 17, 31, 17, 17, 17],
  B: [30, 17, 17, 30, 17, 17, 30],
  C: [14, 17, 16, 16, 16, 17, 14],
  D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31],
  F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15],
  H: [17, 17, 17, 31, 17, 17, 17],
  I: [31, 4, 4, 4, 4, 4, 31],
  J: [7, 2, 2, 2, 18, 18, 12],
  K: [17, 18, 20, 24, 20, 18, 17],
  L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17],
  N: [17, 25, 21, 19, 17, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13],
  R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30],
  T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 21, 10],
  X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4],
  Z: [31, 1, 2, 4, 8, 16, 31],
  '0': [14, 17, 19, 21, 25, 17, 14],
  '1': [4, 12, 4, 4, 4, 4, 14],
  '2': [14, 17, 1, 2, 4, 8, 31],
  '3': [30, 1, 1, 14, 1, 1, 30],
  '4': [2, 6, 10, 18, 31, 2, 2],
  '5': [31, 16, 16, 30, 1, 1, 30],
  '6': [14, 16, 16, 30, 17, 17, 14],
  '7': [31, 1, 2, 4, 8, 8, 8],
  '8': [14, 17, 17, 14, 17, 17, 14],
  '9': [14, 17, 17, 15, 1, 1, 14],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 6, 6],
  ',': [0, 0, 0, 0, 6, 6, 4],
  ':': [0, 6, 6, 0, 6, 6, 0],
  '/': [1, 2, 2, 4, 8, 8, 16],
  '-': [0, 0, 0, 31, 0, 0, 0],
  '+': [0, 4, 4, 31, 4, 4, 0],
  '=': [0, 0, 31, 0, 31, 0, 0],
  '(': [2, 4, 8, 8, 8, 4, 2],
  ')': [8, 4, 2, 2, 2, 4, 8],
  '?': [14, 17, 1, 2, 4, 0, 4],
  _: [0, 0, 0, 0, 0, 0, 31],
  '|': [4, 4, 4, 4, 4, 4, 4],
};
function countColor(count: number, max: number): Color {
  if (!count || !max) return EMPTY;
  const weight = count / max;
  return [0, 1, 2].map((index) =>
    Math.round(BLUE[index] + (COPPER[index] - BLUE[index]) * weight),
  ) as unknown as Color;
}
function readableNumber(value: number): string {
  return value.toLocaleString('en-US');
}
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++)
    crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  return crc >>> 0;
});
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 255];
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type: string, payload: Uint8Array): Uint8Array {
  const output = new Uint8Array(payload.length + 12),
    view = new DataView(output.buffer);
  view.setUint32(0, payload.length);
  output.set(new TextEncoder().encode(type), 4);
  output.set(payload, 8);
  view.setUint32(
    payload.length + 8,
    crc32(output.subarray(4, payload.length + 8)),
  );
  return output;
}
function concat(parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(
    parts.reduce((length, part) => length + part.length, 0),
  );
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

/** Monday is day 0. Renders a source-labelled count heatmap; no artwork is fetched. */
export function renderWeekChart(
  cells168: WeekCell[],
  sourceLabel = 'LAST.FM / UTC',
): Uint8Array {
  if (!Array.isArray(cells168) || cells168.length !== 168)
    throw new Error('A weekly chart needs exactly 168 day/hour cells.');
  if (
    typeof sourceLabel !== 'string' ||
    sourceLabel.length > 120 ||
    /[\u0000-\u001F\u007F]/.test(sourceLabel)
  )
    throw new Error(
      'Chart source label must be at most 120 characters without control characters.',
    );
  const counts = Array<number>(168).fill(-1);
  let total = 0,
    max = 0,
    activeCells = 0;
  for (const cell of cells168) {
    if (
      !cell ||
      typeof cell !== 'object' ||
      !Number.isInteger(cell.day) ||
      cell.day < 0 ||
      cell.day > 6 ||
      !Number.isInteger(cell.hour) ||
      cell.hour < 0 ||
      cell.hour > 23 ||
      !Number.isSafeInteger(cell.count) ||
      cell.count < 0
    )
      throw new Error(
        'Chart cells need day 0–6, hour 0–23 and a nonnegative integer count.',
      );
    const index = cell.day * 24 + cell.hour;
    if (counts[index] !== -1)
      throw new Error('The weekly chart contains a duplicate day/hour cell.');
    counts[index] = cell.count;
    total += cell.count;
    max = Math.max(max, cell.count);
    if (cell.count > 0) activeCells++;
    if (!Number.isSafeInteger(total))
      throw new Error('The weekly chart total is too large.');
  }
  const pixels = new Uint8Array(CHART_WIDTH * CHART_HEIGHT * 3);
  function rectangle(
    x: number,
    y: number,
    width: number,
    height: number,
    color: Color,
  ): void {
    for (
      let py = Math.max(0, y);
      py < Math.min(CHART_HEIGHT, y + height);
      py++
    ) {
      for (
        let px = Math.max(0, x);
        px < Math.min(CHART_WIDTH, x + width);
        px++
      ) {
        const offset = (py * CHART_WIDTH + px) * 3;
        pixels[offset] = color[0];
        pixels[offset + 1] = color[1];
        pixels[offset + 2] = color[2];
      }
    }
  }
  function text(
    value: string,
    x: number,
    y: number,
    color: Color = TEXT,
    scale = 1,
  ): void {
    for (const character of value.toUpperCase()) {
      const bitmap = FONT[character] || FONT['?'];
      for (let row = 0; row < 7; row++)
        for (let column = 0; column < 5; column++)
          if (bitmap[row] & (1 << (4 - column)))
            rectangle(x + column * scale, y + row * scale, scale, scale, color);
      x += 6 * scale;
    }
  }
  rectangle(0, 0, CHART_WIDTH, CHART_HEIGHT, BACKGROUND);
  rectangle(32, 27, 5, 26, COPPER);
  text('WHEN YOU LISTEN', 49, 29, TEXT, 3);
  text('LISTEN COUNTS BY DAY AND HOUR', 49, 64, MUTED);
  text('KARINA', 852, 34, MUTED, 2);

  const gridX = 96,
    gridY = 112,
    cellWidth = 33,
    cellHeight = 25;
  for (const hour of [0, 6, 12, 18, 23])
    text(
      String(hour).padStart(2, '0'),
      gridX + hour * cellWidth + 3,
      89,
      MUTED,
      2,
    );
  const days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  for (let day = 0; day < 7; day++) {
    text(days[day], 42, gridY + day * cellHeight + 4, MUTED, 2);
    for (let hour = 0; hour < 24; hour++)
      rectangle(
        gridX + hour * cellWidth,
        gridY + day * cellHeight,
        cellWidth - 4,
        cellHeight - 4,
        countColor(counts[day * 24 + hour], max),
      );
  }
  text(`${readableNumber(total)} LISTENS`, 96, 305, TEXT, 2);
  text(`${activeCells} ACTIVE HOUR CELLS`, 96, 326, MUTED);
  if (max === 0) {
    rectangle(548, 307, 13, 13, EMPTY);
    text('0 / NO LISTENS IN THIS RANGE', 574, 310, MUTED);
  } else {
    rectangle(548, 307, 13, 13, EMPTY);
    text('0', 570, 310, MUTED);
    const gradientX = 602,
      gradientWidth = 164;
    for (let pixel = 0; pixel < gradientWidth; pixel++)
      rectangle(
        gradientX + pixel,
        307,
        1,
        13,
        countColor(1 + ((max - 1) * pixel) / (gradientWidth - 1), max),
      );
    text('1', gradientX, 326, MUTED);
    const maxLabel = readableNumber(max);
    text(
      maxLabel,
      gradientX + gradientWidth - maxLabel.length * 6 + 1,
      326,
      MUTED,
    );
    text('LISTENS', 781, 310, MUTED);
  }
  rectangle(32, 352, 896, 1, [44, 45, 46]);
  const label = sourceLabel
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .slice(0, 86);
  text(label || 'SOURCE NOT SPECIFIED', 32, 369, MUTED);
  text('SHADE = COUNT / MONDAY FIRST', 754, 369, MUTED);

  const rowBytes = CHART_WIDTH * 3,
    filtered = new Uint8Array((rowBytes + 1) * CHART_HEIGHT);
  for (let row = 0; row < CHART_HEIGHT; row++)
    filtered.set(
      pixels.subarray(row * rowBytes, (row + 1) * rowBytes),
      row * (rowBytes + 1) + 1,
    );
  const header = new Uint8Array(13),
    headerView = new DataView(header.buffer);
  headerView.setUint32(0, CHART_WIDTH);
  headerView.setUint32(4, CHART_HEIGHT);
  header[8] = 8;
  header[9] = 2; // RGB, 8-bit, non-interlaced; filter byte 0 per row.
  return concat([
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', new Uint8Array(deflateSync(filtered, { level: 9 }))),
    chunk('IEND', new Uint8Array()),
  ]);
}
