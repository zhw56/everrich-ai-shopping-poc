/**
 * T15 客戶畫像（只在後台使用，不顯示給客戶）。
 * 欄位採白名單：只收行銷與服務會用到的需求資訊；個資法第 6 條特種個資（醫療、基因、性生活、健康檢查、犯罪前科）
 * 以及宗教、政治、種族等敏感資訊一律不收。
 */
export type AttrSource = 'stated' | 'inferred' | 'system';
export type AttrValue = string | number | boolean | string[];
export type Attr = { value: AttrValue; source: AttrSource; confidence: number; evidence: string; at: string };

export type AttrDef = {
  key: string;
  label: string;
  type: 'bool' | 'number' | 'enum' | 'list' | 'text';
  options?: string[];
  hint: string;
};

export const ATTRS: AttrDef[] = [
  { key: 'is_member', label: '是否 RICHCLUB 會員', type: 'bool', hint: '客戶表明自己是或不是昇恆昌會員' },
  { key: 'customer_type', label: '旅客類型', type: 'enum', options: ['商務旅客', '家庭旅遊', '自由行', '學生', '銀髮族', '其他'], hint: '客戶提到的出國目的、身分或同行對象' },
  { key: 'budget_total', label: '這次購物預算（元）', type: 'number', hint: '這次購物的總預算上限' },
  { key: 'budget_item', label: '單件預算（元）', type: 'number', hint: '單一商品或禮物的預算上限；「不想花太多」等可推測為低預算，請給保守數字並標為推測' },
  { key: 'shopping_channel', label: '購物通路', type: 'enum', options: ['機場免稅店', '市區預購', '免稅購物網預購', '宅配到府', '不在意'], hint: '客戶想在哪裡買、出國帶走還是寄到家' },
  { key: 'trip_date', label: '出發日', type: 'text', hint: '客戶說的出發日期，盡量寫成 YYYY-MM-DD；只說「下週五」時照原話記' },
  { key: 'destination', label: '目的地', type: 'text', hint: '客戶說要去的城市或國家' },
  { key: 'departure_airport', label: '出境機場', type: 'enum', options: ['桃園第一航廈', '桃園第二航廈', '松山', '臺中', '高雄', '金門', '其他'], hint: '從哪個機場或航廈出境' },
  { key: 'party_size', label: '同行人數', type: 'number', hint: '一起出國的人數（影響每人菸酒免稅額度）' },
  { key: 'category_interest', label: '感興趣分類', type: 'list', hint: '例如 美妝保養、香水、酒類、精品配件、食品伴手禮' },
  { key: 'brand_preference', label: '偏好品牌', type: 'list', hint: '例如 SK-II、CHANEL、KAVALAN' },
  { key: 'brand_avoid', label: '排斥品牌', type: 'list', hint: '客戶說不喜歡或不要的品牌' },
  { key: 'gift_for', label: '送禮對象', type: 'list', hint: '例如 媽媽、另一半、長輩、同事、客戶' },
  { key: 'product_priorities', label: '重視的特點', type: 'list', hint: '例如 保濕、抗老、清新香調、單一麥芽、台灣品牌、好攜帶' },
  { key: 'price_sensitivity', label: '價格敏感度', type: 'enum', options: ['高', '中', '低'], hint: '從說法判斷對價格與折扣的在意程度' },
  { key: 'travel_frequency', label: '出國頻率', type: 'enum', options: ['每月', '每季', '一年一兩次', '很少'], hint: '客戶提到多久出國一次' },
  { key: 'pain_points', label: '困擾', type: 'list', hint: '例如 不知道哪個優惠划算、提貨排隊、點數快過期、怕酒超過額度' },
  { key: 'interested_products', label: '感興趣商品', type: 'list', hint: '提到想了解的商品或優惠名稱' },
  // 以下只由會員資料（系統）寫入
  { key: 'member_tier', label: '會員等級', type: 'text', hint: '會員資料' },
  { key: 'points_expire', label: '點數到期日', type: 'text', hint: '會員資料：有點數即將到期時的到期日' },
  { key: 'next_trip', label: '下一趟出發日', type: 'text', hint: '會員資料' },
  { key: 'favorite_product', label: '常買商品', type: 'text', hint: '會員資料' },
  { key: 'avg_spend', label: '每趟平均消費（元）', type: 'number', hint: '會員資料：近 6 個月免稅店每趟平均消費' },
];
export const ATTR_MAP = new Map(ATTRS.map((a) => [a.key, a]));
export const SYSTEM_ONLY = new Set(['member_tier', 'points_expire', 'next_trip', 'favorite_product', 'avg_spend']);

export const INTENT_STAGES = ['瀏覽', '比較', '準備購買', '服務需求', '流失風險'] as const;
export const SENTIMENTS = ['正向', '中性', '負向'] as const;
export type IntentStage = (typeof INTENT_STAGES)[number];
export type Sentiment = (typeof SENTIMENTS)[number];

export type Profile = {
  id: string;
  session_id: string;
  user_id: string | null;
  demo: boolean;
  created_at: string;
  updated_at: string;
  turns: number;
  attributes: Record<string, Attr>;
  intent_stage: IntentStage;
  sentiment: Sentiment;
  topics: string[];
  marketing_consent: boolean | null;
  offers_shown: { rule_id: string; turn: number; at: string }[];
  first_question: string;
};

/** 不收的敏感資訊（客戶自己講也不記） */
export const SENSITIVE = /(病|癌|藥|懷孕|孕|殘障|身障|憂鬱|焦慮|健康檢查|基因|宗教|信仰|佛|基督|教會|政黨|藍營|綠營|國民黨|民進黨|性向|同志|同性|前科|坐牢|犯罪|吸毒|種族|原住民|身分證|護照號碼|護照號|銀行帳號|信用卡號|地址)/;

export function validValue(def: AttrDef, v: unknown): AttrValue | null {
  if (def.type === 'bool') return typeof v === 'boolean' ? v : v === 'true' ? true : v === 'false' ? false : null;
  if (def.type === 'number') {
    const n = typeof v === 'number' ? v : Number(String(v).replace(/[,，元人位\s]/g, ''));
    return Number.isFinite(n) && n >= 0 && n < 1_000_000 ? Math.round(n) : null;
  }
  if (def.type === 'enum') return typeof v === 'string' && def.options!.includes(v) ? v : null;
  if (def.type === 'list') {
    const arr = (Array.isArray(v) ? v : String(v ?? '').split(/[、,，]/)).map((x) => String(x).trim()).filter((x) => x && x.length <= 30);
    return arr.length ? [...new Set(arr)].slice(0, 8) : null;
  }
  const t = String(v ?? '').trim();
  return t && t.length <= 60 ? t : null;
}

export function displayValue(v: AttrValue): string {
  if (Array.isArray(v)) return v.join('、');
  if (typeof v === 'boolean') return v ? '是' : '否';
  return String(v);
}
