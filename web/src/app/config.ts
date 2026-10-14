import { useEffect, useState } from 'react';

/** 前台文案與入口：由後台「前台設定」維護（GET /api/config），讀不到時用內建預設 */
export type Shortcut = { icon: 'promo' | 'product' | 'order' | 'help'; title: string; subtitle: string; prompt: string };
export type FrontConfig = {
  service_name: string; welcome_title: string; welcome_subtitle: string; shortcuts: Shortcut[]; suggestions: string[];
  composer_placeholder: string; footer_note: string; results_empty_title: string; results_empty_text: string; demo_hint: string;
};

export const DEFAULT_CONFIG: FrontConfig = {
  service_name: '購物小幫手',
  welcome_title: '這趟想買點什麼？',
  welcome_subtitle: '免稅店、宅配網、預購提貨都可以問我。需要會員資料時，會先請你驗證 RICHCLUB 會員。',
  shortcuts: [
    { icon: 'promo', title: '優惠活動', subtitle: '算出這次最划算的買法', prompt: '現在有什麼優惠活動？' },
    { icon: 'product', title: '商品推薦', subtitle: '依預算與送禮對象挑選', prompt: '推薦送媽媽的保養品' },
    { icon: 'order', title: '我的預購單', subtitle: '提貨資訊與折扣明細', prompt: '我的預購單怎麼沒有折 1,000？' },
    { icon: 'help', title: '免稅規定', subtitle: '菸酒額度、液體、提貨', prompt: '入境可以帶幾瓶酒？' },
  ],
  suggestions: ['預算 3,000 以內有什麼適合送長輩的伴手禮？'],
  composer_placeholder: '輸入你的問題',
  footer_note: 'AI 回覆僅供參考，價格與活動以昇恆昌公告為準。對話內容會用於改善服務與提供個人化建議。',
  results_empty_title: '查詢結果會整理在這裡',
  results_empty_text: '商品、優惠與預購單會以卡片呈現，點選來源可查看資料出處。',
  demo_hint: '展示會員：0900-000-001（會員 A）、0900-000-002（會員 B）、0900-000-003（會員 C），驗證碼 123456。不會發送簡訊。',
};

export function useFrontConfig(): FrontConfig {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  useEffect(() => {
    const c = new AbortController();
    fetch('/api/config', { signal: c.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j?.ok && j.data?.welcome_title) setConfig({ ...DEFAULT_CONFIG, ...j.data }); })
      .catch(() => {});
    return () => c.abort();
  }, []);
  return config;
}
