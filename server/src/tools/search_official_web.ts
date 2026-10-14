import Anthropic from '@anthropic-ai/sdk';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { config } from '../config.js';
import { DATA_DIR, loadSources } from '../data.js';
import { toJson, writeAtomic } from '../util/atomic.js';
import type { Source, Tool } from '../types.js';
import { buildAllowedDomains, filterCitations, searchDomains } from './websearch.js';

const SYSTEM = [
  '你是昇恆昌購物小幫手的查詢助理，只能根據搜尋到的昇恆昌官網（以及財政部關務署的通關規定頁）內容回答。',
  '搜尋範圍已限定在昇恆昌官網（everrich-group.com）與關務署核准頁面，「RICHCLUB」「RICH POINT」等名稱是昇恆昌自己的會員制度與點數。',
  '只寫出搜尋結果中有原文依據的內容；查不到具體數字時，直接說官網搜尋結果沒有列出，不要換算或推測。',
  '使用台灣繁體中文與全形標點，200 字以內。',
  '找不到答案就直接說找不到，不要推測價格、優惠或活動期限。',
].join('');

/**
 * 搜尋結果快取 24 小時（data/runtime/，不進 git）：同一問題重複搜尋（評測、展示彩排）不再花網頁搜尋費用。
 * 官網搜尋固定用 Claude 內建網頁搜尋，切換到 Inception 測試時也一樣，快取能省下大部分重複費用。
 */
const CACHE_FILE = DATA_DIR + 'runtime/search-cache.json';
const CACHE_TTL = 24 * 3600 * 1000;
type Cached = { at: number; result: unknown };
let memo: Record<string, Cached> | null = null;
function cacheGet(key: string): any {
  if (process.env.SEARCH_CACHE === '0') return null;
  try {
    memo ??= existsSync(CACHE_FILE) ? JSON.parse(readFileSync(CACHE_FILE, 'utf8')) : {};
  } catch {
    memo = {};
  }
  const hit = memo![key];
  return hit && Date.now() - hit.at < CACHE_TTL ? hit.result : null;
}
function cacheSet(key: string, result: unknown) {
  if (process.env.SEARCH_CACHE === '0') return;
  memo ??= {};
  for (const [k, v] of Object.entries(memo)) if (Date.now() - v.at >= CACHE_TTL) delete memo[k];
  memo[key] = { at: Date.now(), result };
  try {
    mkdirSync(DATA_DIR + 'runtime', { recursive: true });
    writeAtomic(CACHE_FILE, toJson(memo));
  } catch {
    /* 快取寫不進去不影響回答 */
  }
}

export const searchOfficialWeb: Tool<{ query: string }> = {
  definition: {
    name: 'search_official_web',
    description:
      '在昇恆昌官網整站（everrich-group.com）與關務署通關規定頁中搜尋最新活動、會員權益、門市、預購提貨與服務規定，回傳摘要與引用原文、網址。商品價格與優惠計算請用 query_products、query_promos 與 get_promo_price；知識庫查不到、資料過期、只答到問題的一部分，或要查最新活動時使用本工具。可能回傳 NO_ALLOWED_SOURCES，代表官方網站中查無可引用內容。',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: '要查詢的問題，使用繁體中文' } },
      required: ['query'],
    },
  },
  async run(i, ctx) {
    const allowed = buildAllowedDomains(ctx.fixtures?.sources ?? loadSources());
    if (!allowed.length) return { ok: false, error: 'NO_ENABLED_SOURCES' };
    const domains = searchDomains(allowed);
    const cacheKey = String(i.query ?? '').trim() + '|' + [...domains].sort().join(',');
    const useCache = !ctx.fixtures?.sources;
    const cached = useCache ? cacheGet(cacheKey) : null;
    if (cached) return { ...cached, data: { ...cached.data, cached: true } };
    const apiKey = config.anthropicApiKey;
    const model = config.modelAgent;
    if (!apiKey) return { ok: false, error: 'NO_API_KEY' };
    if (!model) return { ok: false, error: 'MODEL_NOT_CONFIGURED' };

    const client = new Anthropic({ apiKey });
    const res: any = await client.messages.create({
      model,
      max_tokens: 1000,
      system: SYSTEM,
      messages: [{ role: 'user', content: i.query }],
      tools: [
        {
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 3,
          allowed_domains: domains,
        },
      ],
    } as any);

    let answer = '';
    const citations: Source[] = [];
    for (const block of res.content ?? []) {
      if (block.type !== 'text') continue;
      answer += block.text;
      for (const c of block.citations ?? []) {
        if (c.type === 'web_search_result_location') citations.push({ title: c.title ?? '', url: c.url, cited_text: c.cited_text });
      }
    }
    const { accepted, rejected } = filterCitations(citations, allowed, { wholeSite: true });
    const searches = res.usage?.server_tool_use?.web_search_requests ?? 0;
    if (!accepted.length) {
      return { ok: false, error: 'NO_ALLOWED_SOURCES', data: { searches, rejected_count: rejected.length } };
    }
    const result = {
      ok: true as const,
      data: { answer: answer.trim(), searches, rejected_count: rejected.length, partial: rejected.length > 0 },
      sources: accepted,
    };
    if (useCache) cacheSet(cacheKey, result);
    return result;
  },
};
