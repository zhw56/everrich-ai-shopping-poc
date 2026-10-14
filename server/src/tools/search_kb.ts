import { asOfDate, loadKb } from '../data.js';
import { daysBetween, isExpired } from '../engine/index.js';
import type { Tool } from '../types.js';

const STALE_DAYS = 30;

function bigrams(s: string): string[] {
  const chars = [...s.replace(/[ ，。？、！：；（）「」,.?!:;()]/g, '').toLowerCase()];
  const out: string[] = [];
  for (let i = 0; i < chars.length - 1; i++) out.push(chars[i] + chars[i + 1]);
  return out;
}

export const searchKb: Tool<{ query: string; top_k?: number }> = {
  definition: {
    name: 'search_kb',
    description:
      '在知識庫查詢規定與常見問題（預購與提貨、入境菸酒與行李免稅額度、液體、會員等級與點數、宅配網、門市據點、退換貨等）。結果標示 stale 為 true 時代表資料超過 30 天未更新或已過期，應改用 search_official_web 確認。',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        top_k: { type: 'integer', minimum: 1, maximum: 5, description: '預設 3' },
      },
      required: ['query'],
    },
  },
  async run(i, ctx) {
    const asOf = asOfDate();
    const grams = bigrams(i.query ?? '');
    const scored = (ctx.fixtures?.kb ?? loadKb())
      .map((kb) => {
        const title = kb.title.toLowerCase();
        const body = kb.body.toLowerCase();
        const score = grams.reduce((s, g) => s + (title.includes(g) ? 2 : body.includes(g) ? 1 : 0), 0);
        return { kb, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, i.top_k ?? 3);
    if (!scored.length) return { ok: false, error: 'KB_NO_MATCH' };
    const results = scored.map(({ kb, score }) => ({
      id: kb.id,
      title: kb.title,
      body: kb.body,
      score,
      source_url: kb.source_url,
      last_checked: kb.last_checked,
      valid_to: kb.valid_to,
      stale: !kb.last_checked || daysBetween(kb.last_checked, asOf) > STALE_DAYS || isExpired(kb.valid_to, asOf),
      mock: kb.mock,
      verified: kb.verified,
    }));
    return {
      ok: true,
      data: { results },
      sources: results.map((r) => ({ title: r.title, url: r.source_url })),
    };
  },
};
