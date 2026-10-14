import { CATEGORIES, isListed, loadProducts, normalizeCategory, type Channel } from '../data.js';
import { priceIn, summarizeProduct } from '../engine/index.js';
import type { Tool } from '../types.js';
import { MOCK_NOTICE, sourcesFrom } from './_common.js';

type Input = { brand?: string; category?: string; min_price?: number; max_price?: number; tag?: string; channel?: Channel };

export const queryProducts: Tool<Input> = {
  definition: {
    name: 'query_products',
    description:
      '依品牌、分類、價格區間、標籤與通路篩選商品。免稅店（dutyfree）用免稅價，宅配網（home）用宅配價，宅配網沒有販售的商品（例如酒類）不會列出。price_kind 為 mock 的價格是展示假資料。',
    input_schema: {
      type: 'object',
      properties: {
        brand: { type: 'string', description: '例如 SK-II、CHANEL、KAVALAN' },
        category: { type: 'string', enum: [...CATEGORIES] },
        min_price: { type: 'integer' },
        max_price: { type: 'integer' },
        tag: { type: 'string', description: '標籤，例如 送禮、保濕、威士忌、送長輩、台灣品牌' },
        channel: { type: 'string', enum: ['dutyfree', 'home'], description: '預設 dutyfree' },
      },
    },
  },
  async run(i, _ctx) {
    const brand = i.brand?.toLowerCase();
    const channel: Channel = i.channel ?? 'dutyfree';
    const category = i.category ? normalizeCategory(i.category) ?? i.category : undefined;
    const list = loadProducts()
      .filter(isListed)
      .filter((p) => priceIn(p, channel) !== null)
      .filter((p) => !brand || p.brand.toLowerCase() === brand)
      .filter((p) => !category || p.category === category)
      .filter((p) => i.min_price == null || priceIn(p, channel)! >= i.min_price)
      .filter((p) => i.max_price == null || priceIn(p, channel)! <= i.max_price)
      .filter((p) => !i.tag || p.tags.includes(i.tag) || p.name.includes(i.tag))
      .sort((a, b) => priceIn(a, channel)! - priceIn(b, channel)!);
    return {
      ok: true,
      data: { channel, count: list.length, products: list.map((p) => summarizeProduct(p, channel)), notice: MOCK_NOTICE },
      sources: sourcesFrom(list),
    };
  },
};
