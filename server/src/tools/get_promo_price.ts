import { asOfDate, loadBundles, loadProducts } from '../data.js';
import { bundleOptions } from '../engine/index.js';
import type { Tool } from '../types.js';
import { MOCK_NOTICE, sourcesFrom } from './_common.js';

export const getPromoPrice: Tool<{ product_id: string; promo_id?: string; channel?: 'dutyfree' | 'home' }> = {
  definition: {
    name: 'get_promo_price',
    description:
      '查詢商品套用優惠後的結帳價（組合優惠價）與省下的金額。不指定 promo_id 時列出該商品所有可用的優惠，依結帳價由低到高排序；可用 channel 限定免稅店或宅配網。',
    input_schema: {
      type: 'object',
      properties: {
        product_id: { type: 'string' },
        promo_id: { type: 'string' },
        channel: { type: 'string', enum: ['dutyfree', 'home'] },
      },
      required: ['product_id'],
    },
  },
  async run(i, _ctx) {
    if (!loadProducts().some((d) => d.id === i.product_id)) return { ok: false, error: 'PRODUCT_NOT_FOUND' };
    const options = bundleOptions(i.product_id, asOfDate(), i.promo_id, i.channel);
    if (!options.length) {
      const available = loadBundles().filter((b) => b.product_id === i.product_id).map((b) => b.promo_id);
      return { ok: false, error: 'PROMO_PRICE_NOT_FOUND', data: { available_promo_ids: available } };
    }
    return {
      ok: true,
      data: { options, notice: MOCK_NOTICE + '組合優惠價由展示價格套用優惠規則計算，不可當成官方報價。' },
      sources: sourcesFrom(options.map((o) => ({ source_id: o.source_id, source_url: o.source_url, name: o.promo.name }))),
    };
  },
};
