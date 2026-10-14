import { existsSync, readFileSync } from 'node:fs';
import { DATA_DIR } from '../data.js';
import { NL, toJson, writeAtomic } from '../util/atomic.js';

/** 情境設定（data/scenarios.json）：後台以表單維護，每輪組進系統提示詞的「情境設定」段落 */
export type Scenario = {
  id: string;
  name: string;
  enabled: boolean;
  examples: string[];
  need_verify: boolean;
  mode: 'single' | 'multi' | 'none';
  tools: string[];
  follow_up: string;
  answer_guide: string;
};

export const SCENARIOS_FILE = DATA_DIR + 'scenarios.json';
export const SCENARIO_TOOLS = [
  'request_verification', 'show_quick_replies', 'dispatch_agents',
  'get_user_profile', 'get_purchases', 'get_order', 'query_promos', 'recommend_promos', 'query_products', 'recommend_products',
  'get_promo_price', 'search_kb', 'search_official_web', 'generate_comparison', 'handoff_to_human',
];

const s = (id: string, name: string, need_verify: boolean, mode: Scenario['mode'], examples: string[], tools: string[], follow_up: string, answer_guide: string): Scenario => ({ id, name, enabled: true, examples, need_verify, mode, tools, follow_up, answer_guide });

export function defaultScenarios(): Scenario[] {
  return [
    s('S1', '一般商品與優惠查詢', false, 'single', ['預算 3,000 以內有什麼適合送長輩的伴手禮？', '現在免稅店有什麼優惠活動？'], ['query_products', 'query_promos'], '', '一句結論加商品或活動重點；沒說通路時用免稅店回答並提醒也可以宅配到家；沒有符合條件時列出最接近的商品並說明差異。'),
    s('S2', '個人化優惠推薦', true, 'single', ['這次出國怎麼買最划算？'], ['request_verification', 'recommend_promos'], '用戶不想驗證時，改問這次大概的預算與想買的分類。', '先摘要會員等級、常買分類與每趟平均消費，再說明前 3 個優惠各能折多少。'),
    s('S3', '出發日與點數到期時間差', true, 'single', ['我 12 月才出國，點數會不會先過期？現在的優惠到時候還能用嗎？'], ['request_verification', 'get_user_profile', 'recommend_promos'], '', '先說出發日、預購開放日與點數到期日，再說明哪些活動出發前就結束、點數可以先怎麼用。'),
    s('S4', '商品選購一問一答', false, 'single', ['想買香水送女朋友'], ['show_quick_replies', 'recommend_products', 'get_promo_price'], '條件不足時一次只問一題：預算、品牌或香調、送禮對象，最多 3 題；不為通路單獨追問。', '推薦 3 件商品，原價與優惠價分開寫。'),
    s('S5', '會員個人化選購', true, 'single', ['幫我看這次可以買什麼'], ['get_user_profile', 'show_quick_replies', 'recommend_products', 'get_promo_price'], '只追問預算。', '先說明會員等級、下一趟航班與常買品牌，再給推薦。'),
    s('S6', '預購單與訂單疑問', true, 'single', ['我的預購單怎麼沒有折 1,000？'], ['request_verification', 'get_order', 'search_kb'], '', '指出實付、已套用的折扣，以及滿額活動差多少、哪些商品不列入計算，附活動來源。'),
    s('S7', '出國購物一次規劃（商品＋優惠＋取貨）', true, 'multi', ['我下週五從桃園飛東京，想預購一瓶威士忌跟送媽媽的保養品，預算一萬，現在有什麼優惠？在哪裡取貨？'], ['dispatch_agents'], '不追問，直接派工。', '整合 3 組商品＋優惠組合與取貨方式，缺少的部分要註明；提醒酒類入境額度。'),
    s('S8', '規定與服務問答', false, 'single', ['入境可以帶幾瓶酒？', '提貨要帶什麼？'], ['search_kb', 'search_official_web'], '', '條列重點並附來源；知識庫與官網都查不到時轉真人。'),
    s('S9', '答不出／轉真人', false, 'single', ['我要客訴', '幫我轉真人'], ['handoff_to_human'], '', '說明已建立模擬工單與工單編號。'),
    s('S10', '超出範圍的問題', false, 'none', ['其他免稅店是不是比較便宜？'], [], '', '禮貌說明只提供昇恆昌相關資訊，並引導回優惠、商品、預購單等服務。'),
  ];
}

const isText = (v: unknown, max: number, allowEmpty = false) => typeof v === 'string' && v.length <= max && (allowEmpty || v.trim().length > 0);

export function validateScenarios(list: unknown): string[] {
  if (!Array.isArray(list)) return ['情境清單必須是陣列'];
  if (list.length > 30) return ['情境最多 30 個'];
  const e: string[] = [];
  const ids = new Set<string>();
  list.forEach((x: any, i) => {
    const at = `第 ${i + 1} 個情境`;
    if (!x || typeof x !== 'object') return void e.push(`${at}格式錯誤`);
    if (typeof x.id !== 'string' || !/^[A-Za-z0-9_-]{1,16}$/.test(x.id)) e.push(`${at}代號只能用英數字，16 字內`);
    else if (ids.has(x.id)) e.push(`${at}代號重複：${x.id}`);
    else ids.add(x.id);
    if (!isText(x.name, 30)) e.push(`${at}名稱必填，30 字內`);
    if (typeof x.enabled !== 'boolean' || typeof x.need_verify !== 'boolean') e.push(`${at}啟用／需驗證必須是是或否`);
    if (!['single', 'multi', 'none'].includes(x.mode)) e.push(`${at}模式無效`);
    if (!Array.isArray(x.examples) || x.examples.length > 5 || !x.examples.every((q: unknown) => isText(q, 200))) e.push(`${at}範例問句最多 5 則，每則 200 字內`);
    if (!Array.isArray(x.tools) || !x.tools.every((t: unknown) => typeof t === 'string' && SCENARIO_TOOLS.includes(t))) e.push(`${at}工具名稱無效`);
    if (!isText(x.follow_up, 300, true)) e.push(`${at}追問說明 300 字內`);
    if (!isText(x.answer_guide, 300, true)) e.push(`${at}回答方式 300 字內`);
  });
  return e;
}

export function loadScenarios(file = SCENARIOS_FILE): Scenario[] {
  try {
    if (!existsSync(file)) return defaultScenarios();
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    return validateScenarios(parsed).length ? defaultScenarios() : parsed;
  } catch {
    return defaultScenarios();
  }
}

export function saveScenarios(list: unknown, file = SCENARIOS_FILE): { ok: true; scenarios: Scenario[] } | { ok: false; error: string; errors: string[] } {
  const errors = validateScenarios(list);
  if (errors.length) return { ok: false, error: 'INVALID_SCENARIOS', errors };
  const clean = (list as Scenario[]).map((x) => ({
    id: x.id, name: x.name.trim(), enabled: x.enabled, examples: x.examples.map((q) => q.trim()), need_verify: x.need_verify,
    mode: x.mode, tools: [...new Set(x.tools)], follow_up: x.follow_up.trim(), answer_guide: x.answer_guide.trim(),
  }));
  writeAtomic(file, toJson(clean));
  return { ok: true, scenarios: clean };
}

const MODE: Record<Scenario['mode'], string> = { single: '主控直接處理', multi: '派工給專員', none: '不呼叫工具' };

/** 組成系統提示詞段落；位置在後台可編輯提示詞之後、目前狀態之前，固定規則仍優先 */
export function scenariosPrompt(list: Scenario[] = loadScenarios()): string {
  if (!list.length) return '';
  const lines = ['# 情境設定（後台維護；與固定規則衝突時以固定規則為準）'];
  for (const x of list) {
    if (!x.enabled) {
      lines.push(`- ${x.id} ${x.name}：已停用。遇到這類問題時說明目前不提供此服務，並提供轉真人客服。`);
      continue;
    }
    const parts = [
      x.examples.length ? `例如「${x.examples.join('」「')}」` : '',
      x.need_verify ? '需先驗證身分' : '不需驗證',
      MODE[x.mode],
      x.tools.length ? `建議工具：${x.tools.join('、')}` : '',
      x.follow_up ? `追問：${x.follow_up}` : '',
      x.answer_guide ? `回答：${x.answer_guide}` : '',
    ].filter(Boolean);
    lines.push(`- ${x.id} ${x.name}：${parts.join('；')}`);
  }
  return lines.join(NL);
}
