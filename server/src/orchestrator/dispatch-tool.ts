import type { ToolDefinition } from '../types.js';

/** 主控專用的派工工具：跨 2 個以上領域時把子任務平行交給專員，不屬於 13 個業務工具 */
export const dispatchToolDefinition: ToolDefinition = {
  name: 'dispatch_agents',
  description:
    '問題同時涉及 2 個以上領域（商品、優惠、訂單、規定或取貨）時，一次把子任務平行派給專員，最多 3 個。product＝商品專員（商品推薦與優惠價）、promo＝優惠專員（最划算的優惠）、order＝訂單專員（預購單、會員資料）、knowledge＝知識專員（預購提貨、菸酒額度、最新活動）。單一領域的問題不要使用，直接呼叫對應工具。回傳各專員結果；有商品與優惠時另回傳已算好結帳價的 combos。',
  input_schema: {
    type: 'object',
    properties: {
      tasks: {
        type: 'array',
        minItems: 2,
        maxItems: 3,
        items: {
          type: 'object',
          properties: {
            agent: { type: 'string', enum: ['promo', 'product', 'order', 'knowledge'] },
            task: { type: 'string', description: '交給專員的具體任務，一句話、60 字內，只寫用戶條件與要查什麼，例如：用戶想買一瓶威士忌和送媽媽的保養品，預算一萬，推薦商品並查優惠價' },
          },
          required: ['agent', 'task'],
        },
      },
    },
    required: ['tasks'],
  },
};

export const DISPATCH_TOOL_NAME = dispatchToolDefinition.name;
