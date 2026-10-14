import { asOfDate } from '../data.js';
import { tickets } from '../store.js';
import type { Tool } from '../types.js';

export const handoffToHuman: Tool<{ summary: string; reason?: string }> = {
  definition: {
    name: 'handoff_to_human',
    description: '轉接真人客服並建立工單，附上對話摘要。用於連續答不出來、用戶要求真人、或涉及客訴、退貨與退款。',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: '給客服人員的對話摘要，不含完整手機號碼與訂單以外的個資' },
        reason: { type: 'string', enum: ['unanswered', 'user_request', 'complaint_refund', 'other'] },
      },
      required: ['summary'],
    },
  },
  async run(i, ctx) {
    const ticketId = `MOCK-${asOfDate().split('-').join('')}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
    tickets.set(ticketId, { ticket_id: ticketId, session_id: ctx.session.id, summary: i.summary, reason: i.reason ?? 'other', created_at: new Date().toISOString() });
    return { ok: true, data: { ticket_id: ticketId, status: 'queued', mock: true, notice: '展示用模擬工單，未實際轉接。' } };
  },
};
