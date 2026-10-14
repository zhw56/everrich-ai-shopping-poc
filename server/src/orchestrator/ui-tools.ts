import type { ToolDefinition } from '../types.js';

/** 主控專用的介面工具，只負責讓前台顯示元件，不屬於 13 個業務工具 */
export const uiToolDefinitions: ToolDefinition[] = [
  {
    name: 'request_verification',
    description: '在畫面顯示 RICHCLUB 會員驗證視窗（會員手機號碼與驗證碼）。需要會員資料但用戶尚未驗證時呼叫，呼叫後用一句話告知用戶完成驗證後會繼續，然後停止回答。',
    input_schema: {
      type: 'object',
      properties: { reason: { type: 'string', description: '需要驗證的原因，例如：查詢你的預購單' } },
    },
  },
  {
    name: 'show_quick_replies',
    description: '在畫面顯示 2 到 4 個快速回覆按鈕，用於追問條件（例如預算、送禮對象、出國帶走或寄到家）。',
    input_schema: {
      type: 'object',
      properties: {
        question: { type: 'string' },
        options: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 4 },
      },
      required: ['question', 'options'],
    },
  },
];

export const UI_TOOL_NAMES = uiToolDefinitions.map((t) => t.name);
