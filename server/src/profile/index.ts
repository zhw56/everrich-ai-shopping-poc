import { loadSettings } from '../config/settings.js';
import { extractInto } from './extract.js';
import { pickForConversation, type NbaAction } from './nba.js';
import { ATTR_MAP, displayValue, type Profile } from './schema.js';
import { SEGMENT_LABEL, segmentsOf } from './segments.js';
import { ensureProfile, getProfile, saveProfile } from './store.js';

export { observeTool, syncSession } from './observe.js';
export { getProfile } from './store.js';

const NL = String.fromCharCode(10);
const pending = new Map<string, Promise<void>>();

export const profileEnabled = () => loadSettings().profile_enabled && process.env.PROFILE_EXTRACTION !== '0';

/** 對話開始時取得畫像（功能關閉時回 null） */
export function profileForTurn(sessionId: string): Profile | null {
  return profileEnabled() ? ensureProfile(sessionId) : null;
}

/**
 * 給主控模型的畫像段落：已知條件不要再問、依偏好調整推薦；
 * 符合接觸頻率政策時附上一句可順帶提的建議（下一步最佳行動）。
 */
export function profilePrompt(p: Profile | null): { text: string; offer: NbaAction | null } {
  if (!p) return { text: '', offer: null };
  const known = Object.entries(p.attributes)
    .filter(([, a]) => a.confidence >= 0.5)
    .map(([k, a]) => `- ${ATTR_MAP.get(k)?.label ?? k}：${displayValue(a.value)}${a.source === 'inferred' ? '（推測）' : ''}`);
  const segs = segmentsOf(p).map((s) => SEGMENT_LABEL.get(s)).filter(Boolean);
  const offer = pickForConversation(p, p.turns + 1);
  if (!known.length && !offer) return { text: '', offer: null };
  const lines = ['# 客戶畫像（後台資料，只用來個人化；不要對客戶提到「畫像」、不要逐條念出）'];
  if (known.length) lines.push(...known, '- 已知的條件不要再問；推薦時優先符合預算、偏好與排斥的品牌；標示（推測）的可以順口確認一次。');
  if (segs.length) lines.push(`- 客群：${segs.join('、')}`);
  if (offer) lines.push(offer.type === 'service' ? `# 服務關懷：回答後加一句「${offer.say}」` : `# 可以順帶一提（只有跟本輪問題相關時，在回答最後用一句話自然帶到，不要硬推）：${offer.say}`);
  return { text: lines.join(NL), offer };
}

/** 對話結束後：記錄推薦、非同步抽取畫像（不阻塞回覆） */
export function afterTurn(p: Profile | null, turn: { user: string; assistant: string; options: string[]; offer: NbaAction | null }) {
  if (!p) return;
  p.turns += 1;
  if (!p.first_question) p.first_question = turn.user.slice(0, 80);
  if (turn.offer) p.offers_shown.push({ rule_id: turn.offer.id, turn: p.turns, at: new Date().toISOString() });
  saveProfile(p);
  const prev = pending.get(p.session_id) ?? Promise.resolve();
  const job = prev
    .then(() => extractInto(p, turn))
    .then(() => saveProfile(p))
    .catch((e) => console.warn('畫像抽取失敗：', (e as Error).message));
  pending.set(p.session_id, job);
}

/** 測試與重播用：等待該對話的畫像抽取完成 */
export async function profileIdle(sessionId: string) {
  await pending.get(sessionId);
  return getProfile(sessionId);
}
