import { renameSync, writeFileSync } from 'node:fs';

/** 原子寫入：先寫暫存檔再 rename，避免讀到寫一半的檔案 */
export function writeAtomic(file: string, text: string) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, text, 'utf8');
  renameSync(tmp, file);
}

export const NL = String.fromCharCode(10);
export const toJson = (x: unknown) => JSON.stringify(x, null, 2) + NL;
