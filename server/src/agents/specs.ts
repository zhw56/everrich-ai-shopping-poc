export type AgentName = 'promo' | 'product' | 'order' | 'knowledge';

export type AgentSpec = {
  name: AgentName;
  label: string;
  /** 依 PRD「Agent 分工」表限定的工具 */
  tools: string[];
  /** 開始時送給前台的進度文字 */
  status: string;
  /** 分配工具額度時的上限（仍受每輪 6 次總上限限制） */
  max_calls: number;
  guide: string[];
};

export const AGENT_SPECS: Record<AgentName, AgentSpec> = {
  promo: {
    name: 'promo',
    label: '優惠專員',
    tools: ['query_promos', 'get_purchases', 'recommend_promos', 'search_official_web'],
    status: '優惠專員：正在計算最划算的優惠…',
    max_calls: 2,
    guide: [
      '直接呼叫 recommend_promos。用戶有說這次的預算或想買的分類時帶 manual_basket（amount、categories）；已驗證時它會自動讀取會員等級、出發日與點數，不需要先呼叫 get_purchases。',
      '用戶想寄到家或不出國時帶 channel: home；否則用 dutyfree。',
      '未驗證且沒有預算時，改用 query_promos 依條件列出優惠。',
    ],
  },
  product: {
    name: 'product',
    label: '商品專員',
    tools: ['query_products', 'recommend_products', 'get_promo_price', 'search_official_web'],
    status: '商品專員：正在挑選商品與優惠價…',
    max_calls: 3,
    guide: [
      '第一步呼叫 recommend_products；想買不同分類（例如威士忌和保養品）時 categories 一次帶齊，指定品牌時帶 brand，送禮對象或功效放 tags，預算是單件上限時帶 budget。',
      '第二步對推薦結果前 2 件商品各呼叫一次 get_promo_price（不指定 promo_id），兩件可以同時呼叫。',
    ],
  },
  order: {
    name: 'order',
    label: '訂單專員',
    tools: ['get_order', 'get_user_profile'],
    status: '訂單專員：正在查詢預購單與會員資料…',
    max_calls: 2,
    guide: ['訂單、提貨、折扣問題呼叫 get_order；會員等級、點數到期、航班與預購開放日呼叫 get_user_profile。'],
  },
  knowledge: {
    name: 'knowledge',
    label: '知識專員',
    tools: ['search_kb', 'search_official_web'],
    status: '知識專員：正在查詢活動、提貨與通關規定…',
    max_calls: 2,
    guide: [
      '預購與提貨、菸酒與行李免稅額度、液體、會員點數、宅配網等規定先用 search_kb。',
      '最新活動或週年慶直接用 search_official_web，只呼叫一次，查詢句要具體（例如：昇恆昌 週年慶 活動）。',
    ],
  },
};

export const AGENT_NAMES = Object.keys(AGENT_SPECS) as AgentName[];

/** 分配額度的優先順序：商品專員需要最多次（推薦＋2 次優惠價） */
const PRIORITY: AgentName[] = ['product', 'promo', 'knowledge', 'order'];

/** 每個專員至少 1 次，剩餘額度依優先順序補到各自上限；總額不足時後派的專員拿 0 次 */
export function allocateQuotas(agents: AgentName[], remaining: number): Map<AgentName, number> {
  const q = new Map<AgentName, number>(agents.map((a) => [a, 0]));
  let left = remaining;
  const order = [...agents].sort((a, b) => PRIORITY.indexOf(a) - PRIORITY.indexOf(b));
  for (const a of order) {
    if (left <= 0) break;
    q.set(a, 1);
    left--;
  }
  for (const a of order) {
    const extra = Math.min(left, AGENT_SPECS[a].max_calls - q.get(a)!);
    if (extra > 0 && q.get(a)! > 0) {
      q.set(a, q.get(a)! + extra);
      left -= extra;
    }
  }
  return q;
}
