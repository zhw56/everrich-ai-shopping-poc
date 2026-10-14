/** 儀表板展示假資料（PRD「儀表板與監控」）：數字全為虛構，只用來說明指標與告警設計 */
export const MOCK_DASHBOARD = {
  updated_at: '2026-10-15 14:00',
  business: {
    today_conversations: 2316,
    same_time_last_week: 1874,
    trend_7d: [1702, 1655, 1810, 1946, 2104, 2230, 2316],
    trend_labels: ['10/9', '10/10', '10/11', '10/12', '10/13', '10/14', '10/15'],
    intents: [
      { name: '優惠活動', share: 31 },
      { name: '商品推薦與送禮', share: 26 },
      { name: '預購與提貨', share: 19 },
      { name: '菸酒與行李額度', share: 14 },
      { name: '會員點數', share: 10 },
    ],
    promo_distribution: [
      { name: '週年慶 單筆滿額折', share: 36 },
      { name: '美妝保養品牌週 88 折', share: 24 },
      { name: '昇恆昌聯名卡 再 9 折起', share: 19 },
      { name: '免稅購物網預購 5% 回饋', share: 13 },
      { name: '其他', share: 8 },
    ],
  },
  system: { first_token_p50_s: 1.4, first_token_p95_s: 3.8, api_error_rate: 0.6, search_failure_rate: 3.1, zero_search_ratio: 0.4 },
  cost: { today_usd: 18.6, daily_budget_usd: 30, per_conversation_usd: 0.0081, per_conversation_7d_avg_usd: 0.0079 },
};
