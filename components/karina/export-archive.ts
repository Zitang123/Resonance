'use client';
import { api } from './use-archive';
import type { ListenRecord } from '@/lib/karina/types';
type FileSink = {
  write(data: string): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
};
export async function exportArchive() {
  const browser = window as typeof window & {
    showSaveFilePicker?: (
      options: unknown,
    ) => Promise<{ createWritable(): Promise<FileSink> }>;
  };
  let sink: FileSink | undefined;
  const chunks: string[] = [];
  if (browser.showSaveFilePicker) {
    try {
      const handle = await browser.showSaveFilePicker({
        suggestedName: 'resonance-history.json',
        types: [
          {
            description: 'Resonance history',
            accept: { 'application/json': ['.json'] },
          },
        ],
      });
      sink = await handle.createWritable();
    } catch (error) {
      // Embedded browsers can expose this API while prohibiting the native picker.
      if (!(error instanceof DOMException && error.name === 'SecurityError'))
        throw error;
    }
  }
  const write = async (text: string) => {
    if (sink) await sink.write(text);
    else chunks.push(text);
  };
  try {
    await write('{"format":"resonance-history-v1","records":[');
    let cursor = '',
      first = true;
    while (true) {
      const page = await api<{
        records: ListenRecord[];
        nextCursor: string | null;
      }>(`/api/karina/export?format=page&cursor=${encodeURIComponent(cursor)}`);
      if (page.records.length) {
        await write(
          (first ? '' : ',') +
            page.records.map((r) => JSON.stringify(r)).join(','),
        );
        first = false;
      }
      if (!page.nextCursor) break;
      if (page.nextCursor <= cursor)
        throw Error('The export cursor did not advance. Please retry.');
      cursor = page.nextCursor;
    }
    await write(']}');
    if (sink) await sink.close();
    else {
      const url = URL.createObjectURL(
        new Blob(chunks, { type: 'application/json' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = 'resonance-history.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
  } catch (error) {
    await sink?.abort();
    throw error;
  }
}
