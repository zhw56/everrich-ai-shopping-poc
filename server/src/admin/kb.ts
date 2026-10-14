import { readFileSync } from 'node:fs';
import { DATA_DIR, loadSources } from '../data.js';
import { NL } from '../util/atomic.js';
import { validateAndWrite } from './validateData.js';

/** T13：知識庫（data/kb.md）條目編輯；格式與 loadKb／validate.mjs 相同，寫回前跑資料檢查 */
export type KbItem = { id: string; title: string; source_id: string; source_url: string; last_checked: string; valid_to: string | null; mock: boolean; body: string };
type Result = { ok: true; items: KbItem[] } | { ok: false; error: string; errors: string[] };

const FILE = DATA_DIR + 'kb.md';
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
const isDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

export function parseKb(text = readFileSync(FILE, 'utf8')): { header: string; items: KbItem[] } {
  const parts = text.split(NL + '## ');
  const header = parts[0].trimEnd();
  const items = parts.slice(1).map((block) => {
    const lines = block.split(NL);
    const [id, ...rest] = lines[0].split('｜');
    const meta: Record<string, string> = {};
    const body: string[] = [];
    let inBody = false;
    for (const line of lines.slice(1)) {
      const m = line.match(/^- ([a-z_]+): (.*)$/);
      if (!inBody && m) meta[m[1]] = m[2].trim();
      else if (!inBody && !line.trim()) continue;
      else {
        inBody = true;
        body.push(line);
      }
    }
    return {
      id: id.trim(),
      title: rest.join('｜').trim(),
      source_id: meta.source_id ?? '',
      source_url: meta.source_url ?? '',
      last_checked: meta.last_checked ?? today(),
      valid_to: !meta.valid_to || meta.valid_to === 'null' ? null : meta.valid_to,
      mock: meta.mock === 'true',
      body: body.join(NL).trim(),
    };
  });
  return { header, items };
}

export function serializeKb(header: string, items: KbItem[]): string {
  const blocks = items.map((k) =>
    [
      `## ${k.id}｜${k.title}`,
      '',
      `- source_id: ${k.source_id}`,
      `- source_url: ${k.source_url}`,
      `- last_checked: ${k.last_checked}`,
      `- valid_to: ${k.valid_to ?? 'null'}`,
      '- verified: false',
      `- mock: ${k.mock}`,
      '',
      k.body.trim(),
    ].join(NL),
  );
  return [header, ...blocks].join(NL + NL) + NL;
}

export const listKb = () => parseKb().items;

function clean(input: any, base: Partial<KbItem>): KbItem | string[] {
  const src = loadSources().find((s) => s.id === String(input?.source_id ?? base.source_id ?? ''));
  const item: KbItem = {
    id: base.id ?? '',
    title: String(input?.title ?? base.title ?? '').replace(/[｜\r\n]/g, ' ').trim(),
    source_id: src?.id ?? '',
    source_url: src?.url ?? '',
    last_checked: String(input?.last_checked ?? base.last_checked ?? today()),
    valid_to: input?.valid_to === undefined ? base.valid_to ?? null : input.valid_to || null,
    mock: input?.mock === undefined ? !!base.mock : input.mock === true,
    body: String(input?.body ?? base.body ?? '').replace(/\r\n/g, NL).replace(/^## /gm, '').replace(/^- ([a-z_]+): /gm, '・$1：').trim(),
  };
  const e: string[] = [];
  if (!item.title || item.title.length > 80) e.push('標題必填，80 字內');
  if (!src) e.push('請選擇資料來源');
  if (!isDate(item.last_checked)) e.push('最後檢查日格式為 YYYY-MM-DD');
  if (item.valid_to && !isDate(item.valid_to)) e.push('有效期限格式為 YYYY-MM-DD');
  if (!item.body || item.body.length > 3000) e.push('內容必填，3000 字內');
  return e.length ? e : item;
}

function write(header: string, items: KbItem[]): Result {
  const r = validateAndWrite({ 'kb.md': serializeKb(header, items) });
  return r.ok ? { ok: true, items: listKb() } : r;
}

export function saveKb(id: string | null, input: unknown): Result {
  const { header, items } = parseKb();
  const idx = id ? items.findIndex((k) => k.id === id) : -1;
  if (id && idx < 0) return { ok: false, error: 'NOT_FOUND', errors: ['找不到這筆知識'] };
  const nums = items.map((k) => Number(k.id.replace(/^KB/, ''))).filter(Number.isFinite);
  const base = idx >= 0 ? items[idx] : { id: 'KB' + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(2, '0') };
  const r = clean(input, base);
  if (Array.isArray(r)) return { ok: false, error: 'INVALID', errors: r };
  if (idx >= 0) items[idx] = r;
  else items.push(r);
  return write(header, items);
}

export function deleteKb(id: string): Result {
  const { header, items } = parseKb();
  if (!items.some((k) => k.id === id)) return { ok: false, error: 'NOT_FOUND', errors: ['找不到這筆知識'] };
  return write(header, items.filter((k) => k.id !== id));
}
