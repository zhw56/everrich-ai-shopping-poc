import { summarizePurchases } from '../engine/index.js';
import type { Tool } from '../types.js';
import { MOCK_NOTICE, requireVerifiedUser } from './_common.js';

export const getPurchases: Tool<{ months?: number }> = {
  definition: {
    name: 'get_purchases',
    description: '取得已驗證會員近幾個月在免稅店與宅配網的消費金額、出國次數與常買分類，並附平均值摘要（每趟平均消費、各分類占比）。需要先完成身分驗證。',
    input_schema: {
      type: 'object',
      properties: { months: { type: 'integer', minimum: 1, maximum: 6, description: '要看的月數，預設 6' } },
    },
  },
  async run(input, ctx) {
    const auth = requireVerifiedUser(ctx);
    if ('error' in auth) return auth.error;
    const months = Math.min(6, Math.max(1, Math.round(input.months ?? 6)));
    const rows = auth.user.purchases.slice(-months);
    return { ok: true, data: { rows, summary: summarizePurchases(rows, months), mock: true, notice: MOCK_NOTICE } };
  },
};
