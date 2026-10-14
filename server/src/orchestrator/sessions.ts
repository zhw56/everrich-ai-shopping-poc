import { createSession, type Session } from '../types.js';

export type Turn = { role: 'user' | 'assistant'; content: string };

export type ChatState = {
  session: Session;
  history: Turn[];
  /** 要求驗證時暫存的原始問題，驗證成功後接續處理 */
  pending_question: string | null;
  /** 連續答不出來的輪數（T8 S9），轉真人或答出來後歸零 */
  unanswered_streak?: number;
  /** T15：本段對話是否已說過展示資料聲明 */
  mock_disclosed?: boolean;
  /** T15：上一輪提供的快速回覆選項（讓「第一個」這類回答能被理解） */
  last_options?: string[];
};

const MAX_HISTORY = 12;
const states = new Map<string, ChatState>();

export function getState(id: string): ChatState {
  let s = states.get(id);
  if (!s) {
    s = { session: createSession(id), history: [], pending_question: null, unanswered_streak: 0 };
    states.set(id, s);
  }
  return s;
}

export function resetState(id: string) {
  states.delete(id);
}

/**
 * 保留使用者問題與最終回答；T15 起在回答後附一行簡短紀錄（本輪提供的選項、畫面顯示的項目），
 * 讓下一輪能理解「第一個」「剛剛那支」這類回覆，同時不放完整工具結果以節省 token。
 */
export function pushHistory(state: ChatState, user: string, assistant: string, note = '') {
  state.history.push({ role: 'user', content: user });
  const body = assistant || '（已在畫面顯示查詢結果）';
  state.history.push({ role: 'assistant', content: note ? `${body}\n\n（${note}）` : body });
  while (state.history.length > MAX_HISTORY) state.history.splice(0, 2);
}
