import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DATA_DIR } from '../data.js';
import { writeAtomic } from '../util/atomic.js';

const VALIDATOR = DATA_DIR + 'validate.mjs';

/**
 * 把候選檔案放進 data/ 的暫存副本，跑 data/validate.mjs（資料關聯、展示情境、訂單金額一致性）。
 * 通過才寫回正式檔；失敗回傳驗證訊息，正式資料不變。
 */
export function validateAndWrite(files: Record<string, string>): { ok: true } | { ok: false; error: string; errors: string[] } {
  const dir = mkdtempSync(join(tmpdir(), 'everrich-data-'));
  try {
    cpSync(DATA_DIR, dir, { recursive: true, filter: (src) => !src.endsWith('.tmp') });
    for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text, 'utf8');
    execFileSync(process.execPath, [VALIDATOR, dir], { stdio: 'pipe', timeout: 15000 });
  } catch (e: any) {
    const out = String(e?.stderr ?? e?.message ?? '');
    const line = out.split(/\r?\n/).find((l) => /AssertionError|Error:/.test(l)) ?? out.split(/\r?\n/)[0] ?? '';
    const msg = line.replace(/^.*?(AssertionError \[[^\]]+\]|AssertionError|Error): ?/, '').trim() || '資料檢查失敗';
    return { ok: false, error: 'DATA_CHECK_FAILED', errors: [`資料檢查未通過：${msg}`] };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  for (const [name, text] of Object.entries(files)) writeAtomic(DATA_DIR + name, text);
  return { ok: true };
}
