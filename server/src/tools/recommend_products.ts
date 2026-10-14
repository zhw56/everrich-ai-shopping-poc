import { CATEGORIES, loadProducts, normalizeCategories, type Channel } from '../data.js';
import { recommendProducts } from '../engine/index.js';
import type { Tool } from '../types.js';
import { MOCK_NOTICE, requireVerifiedUser, sourcesFrom } from './_common.js';

type Input = { budget?: number; brand?: string; categories?: string[]; tags?: string[]; channel?: Channel; prefer_favorite_brand?: boolean; top_n?: number };

export const recommendProductsTool: Tool<Input> = {
  definition: {
    name: 'recommend_products',
    description:
      '由推薦引擎依預算、分類、品牌、標籤（送禮對象、功效、口味）與通路計算推薦商品前幾名與理由要素。categories 給多個分類時（例如威士忌加保養品），每個分類至少推薦一件。prefer_favorite_brand 為 true 且會員已驗證時，優先推薦會員常買的品牌並排除已買過的那一件。沒有符合條件時會回傳最接近的商品。',
    input_schema: {
      type: 'object',
      properties: {
        budget: { type: 'integer', description: '單件預算上限（元）' },
        brand: { type: 'string', description: '限定品牌' },
        categories: { type: 'array', items: { type: 'string', enum: [...CATEGORIES] } },
        tags: { type: 'array', items: { type: 'string' }, description: '重視的特點，例如 送禮、送長輩、保濕、威士忌、台灣品牌' },
        channel: { type: 'string', enum: ['dutyfree', 'home'], description: '預設 dutyfree' },
        prefer_favorite_brand: { type: 'boolean' },
        top_n: { type: 'integer', minimum: 1, maximum: 5 },
      },
    },
  },
  async run(i, ctx) {
    let preferBrand: string | undefined;
    let exclude: string[] = [];
    if (i.prefer_favorite_brand) {
      const auth = requireVerifiedUser(ctx);
      if ('user' in auth) {
        const fav = loadProducts().find((p) => p.id === auth.user.favorite_product_id);
        if (fav) {
          preferBrand = fav.brand;
          exclude = [fav.id];
        }
      }
    }
    const result = recommendProducts({ budget: i.budget, brand: i.brand, categories: normalizeCategories(i.categories), tags: i.tags, channel: i.channel, prefer_brand: preferBrand, exclude_ids: exclude, top_n: i.top_n });
    const ids = new Set([...result.items.map((x) => x.product.id), ...result.nearest_when_empty.map((d) => d.id)]);
    return {
      ok: true,
      data: { ...result, notice: MOCK_NOTICE },
      sources: sourcesFrom(loadProducts().filter((p) => ids.has(p.id))),
    };
  },
};
