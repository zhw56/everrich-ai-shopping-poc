import { runTool } from '../tools/index.js';
import { getState } from './sessions.js';

/** 驗證成功後，若先前有待處理的問題，回傳讓前台自動送出的接續訊息 */
export async function verifyAndResume(sessionId: string, phone: string, otp: string) {
  const state = getState(sessionId);
  const r = await runTool('verify_identity', { phone, otp }, { session: state.session });
  const resume = r.ok && state.pending_question ? `已完成會員驗證，請繼續處理我剛才的問題：${state.pending_question}` : undefined;
  if (r.ok) state.pending_question = null;
  return { ok: r.ok, data: r.data, error: r.error, resume_message: resume };
}
