import { existsSync, readFileSync } from 'node:fs';
import { DATA_DIR } from '../data.js';
import { toJson, writeAtomic } from '../util/atomic.js';

/** 前台文案與入口（data/frontend.json），後台「前台設定」維護，前台由 GET /api/config 讀取 */
export type Shortcut = { icon: 'promo' | 'product' | 'order' | 'help'; title: string; subtitle: string; prompt: string };
export type FrontendConfig = {
  service_name: string;
  welcome_title: string;
  welcome_subtitle: string;
  shortcuts: Shortcut[];
  suggestions: string[];
  composer_placeholder: string;
  footer_note: string;
  results_empty_title: string;
  results_empty_text: string;
  demo_hint: string;
};

export const FRONTEND_FILE = DATA_DIR + 'frontend.json';
const ICONS = ['promo', 'product', 'order', 'help'];

export function defaultFrontend(): FrontendConfig {
  return {
    service_name: '購物小幫手',
    welcome_title: '這趟想買點什麼？',
    welcome_subtitle: '免稅店、宅配網、預購提貨都可以問我。需要會員資料時，會先請你驗證 RICHCLUB 會員。',
    shortcuts: [
      { icon: 'promo', title: '優惠活動', subtitle: '算出這次最划算的買法', prompt: '現在有什麼優惠活動？' },
      { icon: 'product', title: '商品推薦', subtitle: '依預算與送禮對象挑選', prompt: '推薦送媽媽的保養品' },
      { icon: 'order', title: '我的預購單', subtitle: '提貨資訊與折扣明細', prompt: '我的預購單怎麼沒有折 1,000？' },
      { icon: 'help', title: '免稅規定', subtitle: '菸酒額度、液體、提貨', prompt: '入境可以帶幾瓶酒？' },
    ],
    suggestions: ['預算 3,000 以內有什麼適合送長輩的伴手禮？', '我下週五從桃園飛東京，想預購一瓶威士忌跟送媽媽的保養品，預算一萬，現在有什麼優惠？在哪裡取貨？'],
    composer_placeholder: '輸入你的問題',
    footer_note: 'AI 回覆僅供參考，價格與活動以昇恆昌公告為準。對話內容會用於改善服務與提供個人化建議。',
    results_empty_title: '查詢結果會整理在這裡',
    results_empty_text: '商品、優惠與預購單會以卡片呈現，點選來源可查看資料出處。',
    demo_hint: '展示會員：0900-000-001（會員 A）、0900-000-002（會員 B）、0900-000-003（會員 C），驗證碼 123456。不會發送簡訊。',
  };
}

const text = (v: unknown, max: number) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;

export function validateFrontend(x: unknown): string[] {
  const c = x as FrontendConfig;
  if (!c || typeof c !== 'object' || Array.isArray(c)) return ['設定必須是物件'];
  const e: string[] = [];
  if (!text(c.service_name, 30)) e.push('服務名稱必填，30 字內');
  if (!text(c.welcome_title, 40)) e.push('歡迎標題必填，40 字內');
  if (!text(c.welcome_subtitle, 120)) e.push('歡迎說明必填，120 字內');
  if (!Array.isArray(c.shortcuts) || c.shortcuts.length < 1 || c.shortcuts.length > 6) e.push('快捷入口需 1 到 6 個');
  else
    c.shortcuts.forEach((s, i) => {
      if (!s || !ICONS.includes(s.icon)) e.push(`快捷入口 ${i + 1} 圖示無效`);
      if (!text(s?.title, 12)) e.push(`快捷入口 ${i + 1} 標題必填，12 字內`);
      if (!text(s?.subtitle, 24)) e.push(`快捷入口 ${i + 1} 說明必填，24 字內`);
      if (!text(s?.prompt, 200)) e.push(`快捷入口 ${i + 1} 送出的問題必填，200 字內`);
    });
  if (!Array.isArray(c.suggestions) || c.suggestions.length > 6 || !c.suggestions.every((s) => text(s, 200))) e.push('建議問題最多 6 則，每則 200 字內');
  if (!text(c.composer_placeholder, 40)) e.push('輸入框提示必填，40 字內');
  if (!text(c.footer_note, 120)) e.push('頁尾說明必填，120 字內');
  if (!text(c.results_empty_title, 40)) e.push('結果區空白標題必填，40 字內');
  if (!text(c.results_empty_text, 120)) e.push('結果區空白說明必填，120 字內');
  if (!text(c.demo_hint, 200)) e.push('驗證視窗提示必填，200 字內');
  return e;
}

export function loadFrontend(file = FRONTEND_FILE): FrontendConfig {
  try {
    if (!existsSync(file)) return defaultFrontend();
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    return validateFrontend(parsed).length ? defaultFrontend() : parsed;
  } catch {
    return defaultFrontend();
  }
}

export function saveFrontend(input: unknown, file = FRONTEND_FILE): { ok: true; config: FrontendConfig } | { ok: false; error: string; errors: string[] } {
  const errors = validateFrontend(input);
  if (errors.length) return { ok: false, error: 'INVALID_FRONTEND', errors };
  const c = input as FrontendConfig;
  const clean: FrontendConfig = {
    ...defaultFrontend(),
    ...Object.fromEntries(Object.entries(c).filter(([k]) => k in defaultFrontend())),
    shortcuts: c.shortcuts.map((s) => ({ icon: s.icon, title: s.title.trim(), subtitle: s.subtitle.trim(), prompt: s.prompt.trim() })),
    suggestions: c.suggestions.map((s) => s.trim()),
  } as FrontendConfig;
  writeAtomic(file, toJson(clean));
  return { ok: true, config: clean };
}
