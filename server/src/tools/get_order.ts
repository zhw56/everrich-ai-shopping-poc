import { asOfDate } from '../data.js';
import { explainOrder } from '../engine/index.js';
import type { Tool } from '../types.js';
import { MOCK_NOTICE, requireVerifiedUser, sourcesFrom } from './_common.js';

export const getOrder: Tool<{ order_no?: string }> = {
  definition: {
    name: 'get_order',
    description:
      '取得已驗證會員的訂單明細（免稅預購單或宅配網訂單）：商品、折扣、實付、提貨或配送資訊，並檢查滿額活動的適用金額與還差多少（排除分類不列入計算）。未指定訂單編號時取最近一筆。需要先完成身分驗證。',
    input_schema: {
      type: 'object',
      properties: { order_no: { type: 'string', description: '訂單編號，例如 PO-20261012-0583' } },
    },
  },
  async run(input, ctx) {
    const auth = requireVerifiedUser(ctx);
    if ('error' in auth) return auth.error;
    const result = explainOrder(auth.user, input.order_no, asOfDate());
    if (!result) return { ok: false, error: 'ORDER_NOT_FOUND', data: { order_nos: auth.user.orders.map((o) => o.order_no) } };
    return {
      ok: true,
      data: { ...result, notice: MOCK_NOTICE },
      sources: sourcesFrom(result.promo_check.map((p) => ({ source_url: p.source_url, name: p.promo_name }))),
    };
  },
};
