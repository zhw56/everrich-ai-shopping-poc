import type { ComparisonRow } from '../comparison.js';
import { loadProducts, loadPromos } from '../data.js';
import { bundleById, summarizeProduct, summarizePromo } from '../engine/index.js';
import { comparisons, newId } from '../store.js';
import type { Tool } from '../types.js';
import { MOCK_NOTICE, sourcesFrom } from './_common.js';

type Item = { type: 'promo' | 'product' | 'bundle'; id: string };
const TYPES = ['promo', 'product', 'bundle'];

export const generateComparison: Tool<{ title?: string; items: Item[] }> = {
  definition: {
    name: 'generate_comparison',
    description:
      '把 2 到 4 個優惠活動、商品或商品＋優惠組合（bundle_id）產出成比較表，回傳比較表 id 與網址，讓用戶掃 QR code 帶走（例如帶去機場提貨或門市）。數字一律由系統從資料重新計算。',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        items: {
          type: 'array',
          minItems: 2,
          maxItems: 4,
          items: {
            type: 'object',
            properties: { type: { type: 'string', enum: TYPES }, id: { type: 'string' } },
            required: ['type', 'id'],
          },
        },
      },
      required: ['items'],
    },
  },
  async run(i, _ctx) {
    if (!Array.isArray(i.items) || i.items.length < 2) return { ok: false, error: 'NEED_AT_LEAST_2_ITEMS' };
    if (i.items.length > 4) return { ok: false, error: 'TOO_MANY_ITEMS' };
    if (i.items.some((item) => !item || !TYPES.includes(item.type) || typeof item.id !== 'string')) return { ok: false, error: 'INVALID_ITEMS' };
    if (new Set(i.items.map((item) => `${item.type}:${item.id}`)).size !== i.items.length) return { ok: false, error: 'DUPLICATE_ITEMS' };
    const promos = loadPromos();
    const products = loadProducts();
    const rows: ComparisonRow[] = [];
    const srcItems: { source_id?: string; source_url: string; name?: string }[] = [];
    for (const it of i.items ?? []) {
      if (it.type === 'promo') {
        const p = promos.find((x) => x.id === it.id);
        if (!p) return { ok: false, error: `ITEM_NOT_FOUND: ${it.id}` };
        rows.push({ type: 'promo', ...summarizePromo(p) });
        srcItems.push({ source_id: p.source_id, source_url: p.source_url, name: p.name });
      } else if (it.type === 'product') {
        const d = products.find((x) => x.id === it.id);
        if (!d) return { ok: false, error: `ITEM_NOT_FOUND: ${it.id}` };
        rows.push({ type: 'product', ...summarizeProduct(d) });
        srcItems.push({ source_id: d.source_id, source_url: d.source_url, name: d.name });
      } else {
        const b = bundleById(it.id);
        if (!b) return { ok: false, error: `ITEM_NOT_FOUND: ${it.id}` };
        rows.push({ type: 'bundle', ...b });
        srcItems.push({ source_id: b.source_id, source_url: b.source_url, name: b.promo.name });
      }
    }
    if (rows.length < 2) return { ok: false, error: 'NEED_AT_LEAST_2_ITEMS' };
    const id = newId('cmp');
    const sources = sourcesFrom(srcItems);
    comparisons.set(id, { id, title: typeof i.title === 'string' && i.title.trim() ? i.title.trim().slice(0, 120) : '購物比較表', created_at: new Date().toISOString(), rows, sources, notice: MOCK_NOTICE });
    return { ok: true, data: { id, url: `/compare/${id}`, row_count: rows.length }, sources };
  },
};
