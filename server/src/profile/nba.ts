import { existsSync, readFileSync } from 'node:fs';
import { DATA_DIR } from '../data.js';
import { toJson, writeAtomic } from '../util/atomic.js';
import type { Profile } from './schema.js';
import { SEGMENTS, segmentsOf } from './segments.js';

/**
 * 下一步最佳行動（NBA）：規則式決策層，條件為客群標籤組合，依優先序排序（data/nba.json，後台可編輯）。
 * 參考零售業 NBA 作法：服務動作與商業動作一起排序；接觸頻率政策避免過度推銷；不滿意時先服務、不推銷。
 */
export type RuleType = 'service' | 'retention' | 'offer' | 'acquisition';
export type NbaRule = { id: string; title: string; type: RuleType; when_all: string[]; when_none: string[]; priority: number; say: string; enabled: boolean };
export type NbaPolicy = { max_offers_per_session: number; min_turns_between: number; suppress_segments: string[] };
export type NbaConfig = { policy: NbaPolicy; rules: NbaRule[] };
export type NbaAction = NbaRule & { score: number; reason: string };

export const NBA_FILE = DATA_DIR + 'nba.json';
export const RULE_TYPES: Record<RuleType, string> = { service: '服務關懷', retention: '會員經營', offer: '商品與優惠推薦', acquisition: '入會招攬' };

const r = (id: string, title: string, type: RuleType, when_all: string[], when_none: string[], priority: number, say: string): NbaRule => ({ id, title, type, when_all, when_none, priority, say, enabled: true });

export function defaultNba(): NbaConfig {
  return {
    policy: { max_offers_per_session: 2, min_turns_between: 2, suppress_segments: ['unhappy'] },
    rules: [
      r('care-unhappy', '不滿意關懷', 'service', ['unhappy'], [], 100, '如果需要，我可以幫你轉專人，或一起確認訂單哪裡有問題。'),
      r('liquor-allowance', '酒類入境額度提醒', 'service', ['liquor_buyer'], ['unhappy'], 95, '提醒一下，入境每人酒類免稅 1.5 公升，700ml 的酒大約兩瓶就到上限。'),
      r('points-expiring', '點數到期前提醒折抵', 'retention', ['points_expiring'], [], 90, '你有點數快到期了，可以先在宅配網或這趟購物用點數折抵，不要浪費。'),
      r('preorder-trip-soon', '近期出國提醒預購', 'offer', ['trip_soon'], ['unhappy'], 85, '出發前先在免稅購物網預購，出境當天到機場提貨就好，不用排隊挑貨。'),
      r('home-trip-far', '出發日還遠，先看宅配網', 'offer', ['trip_far'], ['unhappy'], 80, '離出發還有一段時間，預購要出發前 45 天才開放；急著用的話可以先看宅配網。'),
      r('join-member', '非會員入會禮', 'acquisition', ['non_member'], ['unhappy'], 78, '加入 RICHCLUB 會員不用門檻，入會就有 100 元優惠券，消費還能累積點數。'),
      r('beauty-week', '美妝客推品牌週', 'offer', ['beauty_lover'], ['unhappy', 'home_shopper'], 75, '美妝保養品牌週有指定品牌 88 折，買保養品可以一起比較。'),
      r('gift-souvenir', '送禮推伴手禮組合', 'offer', ['gift_shopper', 'souvenir'], ['unhappy'], 70, '送長輩的話，台灣茶和鳳梨酥禮盒很受歡迎，也有台灣品牌滿額折。'),
      r('luxury-card', '精品客推聯名卡', 'offer', ['luxury'], ['unhappy'], 65, '買精品的話，用昇恆昌聯名卡結帳免稅商品再 9 折起，可以一起算算看。'),
      r('family-allowance', '家庭出遊額度提醒', 'service', ['family_trip', 'liquor_buyer'], ['unhappy'], 60, '同行的每位大人各有自己的菸酒免稅額度，買酒時可以分開計算。'),
      r('home-delivery', '宅配族推宅配網優惠', 'offer', ['home_shopper'], ['unhappy'], 55, '寄到家的話，宅配網美妝香氛滿 3,000 折 300，也可以用點數折抵。'),
    ],
  };
}

const SEG_IDS = new Set(SEGMENTS.map((s) => s.id));

export function validateNba(x: unknown): string[] {
  const c = x as NbaConfig;
  const e: string[] = [];
  if (!c || typeof c !== 'object') return ['格式必須是物件'];
  const p = c.policy;
  if (!p || !Number.isInteger(p.max_offers_per_session) || p.max_offers_per_session < 0 || p.max_offers_per_session > 10) e.push('每段對話推薦上限必須是 0 到 10');
  if (!p || !Number.isInteger(p.min_turns_between) || p.min_turns_between < 0 || p.min_turns_between > 20) e.push('推薦間隔輪數必須是 0 到 20');
  if (!p || !Array.isArray(p.suppress_segments) || !p.suppress_segments.every((s) => SEG_IDS.has(s))) e.push('暫停推銷的客群無效');
  if (!Array.isArray(c.rules) || c.rules.length > 50) e.push('規則最多 50 條');
  const ids = new Set<string>();
  (c.rules ?? []).forEach((x, i) => {
    const at = `第 ${i + 1} 條規則`;
    if (typeof x.id !== 'string' || !/^[a-z0-9-]{2,40}$/.test(x.id)) e.push(`${at}代號只能用小寫英數與連字號`);
    else if (ids.has(x.id)) e.push(`${at}代號重複`);
    else ids.add(x.id);
    if (typeof x.title !== 'string' || !x.title.trim() || x.title.length > 40) e.push(`${at}名稱必填，40 字內`);
    if (!(x.type in RULE_TYPES)) e.push(`${at}類型無效`);
    if (!Array.isArray(x.when_all) || !x.when_all.length || !x.when_all.every((s) => SEG_IDS.has(s))) e.push(`${at}至少選一個符合條件的客群`);
    if (!Array.isArray(x.when_none) || !x.when_none.every((s) => SEG_IDS.has(s))) e.push(`${at}排除客群無效`);
    if (!Number.isInteger(x.priority) || x.priority < 1 || x.priority > 100) e.push(`${at}優先序必須是 1 到 100`);
    if (typeof x.say !== 'string' || !x.say.trim() || x.say.length > 120) e.push(`${at}建議說法必填，120 字內`);
    if (typeof x.enabled !== 'boolean') e.push(`${at}啟用必須是是或否`);
  });
  return e;
}

export function loadNba(): NbaConfig {
  try {
    if (!existsSync(NBA_FILE)) return defaultNba();
    const c = JSON.parse(readFileSync(NBA_FILE, 'utf8'));
    return validateNba(c).length ? defaultNba() : c;
  } catch {
    return defaultNba();
  }
}

export function saveNba(c: unknown): { ok: true; config: NbaConfig } | { ok: false; error: string; errors: string[] } {
  const e = validateNba(c);
  if (e.length) return { ok: false, error: 'INVALID_NBA', errors: e };
  writeAtomic(NBA_FILE, toJson(c));
  return { ok: true, config: c as NbaConfig };
}

/** 依客群算出所有符合的行動（後台顯示用） */
export function actionsFor(p: Profile, config = loadNba()): NbaAction[] {
  const segs = new Set(segmentsOf(p));
  const label = new Map(SEGMENTS.map((s) => [s.id, s.label]));
  return config.rules
    .filter((x) => x.enabled && x.when_all.every((s) => segs.has(s)) && !x.when_none.some((s) => segs.has(s)))
    .map((x) => ({ ...x, score: x.priority, reason: '符合：' + x.when_all.map((s) => label.get(s)).join('＋') }))
    .sort((a, b) => b.score - a.score);
}

/** 本輪可以在對話中帶一句的行動（套用接觸頻率政策）；服務關懷不受推銷上限限制 */
export function pickForConversation(p: Profile, turn: number, config = loadNba()): NbaAction | null {
  const segs = new Set(segmentsOf(p));
  const suppressed = config.policy.suppress_segments.some((s) => segs.has(s));
  const offersShown = p.offers_shown.filter((o) => !config.rules.find((r) => r.id === o.rule_id && r.type === 'service')).length;
  const last = p.offers_shown[p.offers_shown.length - 1];
  for (const a of actionsFor(p, config)) {
    if (p.offers_shown.some((o) => o.rule_id === a.id)) continue;
    if (a.type === 'service') return a;
    if (suppressed) continue;
    if (offersShown >= config.policy.max_offers_per_session) return null;
    if (last && turn - last.turn < config.policy.min_turns_between) return null;
    return a;
  }
  return null;
}
