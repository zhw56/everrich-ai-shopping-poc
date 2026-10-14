import { MOCK_DASHBOARD as M } from './mockDashboard';
import type { LiveStats } from './api';
import { Badge, Panel, Status, useLoad } from './ui';

type Tile = { group: string; name: string; value: string; note: string; threshold: string; alert: boolean };

function tiles(): Tile[] {
  const b = M.business, s = M.system, c = M.cost;
  const top = b.promo_distribution[0];
  return [
    { group: '業務', name: '今日對話數', value: b.today_conversations.toLocaleString('zh-TW'), note: `上週同時段 ${b.same_time_last_week.toLocaleString('zh-TW')}`, threshold: '低於上週同時段 50%', alert: b.today_conversations < b.same_time_last_week * 0.5 },
    { group: '業務', name: '推薦優惠集中度', value: `${top.share}%`, note: `最多：${top.name}`, threshold: '單一優惠 > 60%', alert: top.share > 60 },
    { group: '系統', name: '首字回應 P50／P95', value: `${s.first_token_p50_s}／${s.first_token_p95_s} 秒`, note: '使用者看到第一個字的時間', threshold: 'P95 > 5 秒持續 5 分鐘', alert: s.first_token_p95_s > 5 },
    { group: '系統', name: 'API 錯誤率', value: `${s.api_error_rate}%`, note: 'LLM 與後端 API', threshold: '> 2%', alert: s.api_error_rate > 2 },
    { group: '系統', name: '搜尋失敗率', value: `${s.search_failure_rate}%`, note: '搜尋錯誤或無結果', threshold: '> 5%', alert: s.search_failure_rate > 5 },
    { group: '系統', name: '零搜尋回答比例', value: `${s.zero_search_ratio}%`, note: '價格與優惠類問題沒有查詢依據就回答', threshold: '> 0%，每日檢視', alert: s.zero_search_ratio > 0 },
    { group: '成本', name: '今日花費', value: `US$ ${c.today_usd.toFixed(2)}`, note: `日預算 US$ ${c.daily_budget_usd}`, threshold: '達日預算 80%', alert: c.today_usd >= c.daily_budget_usd * 0.8 },
    { group: '成本', name: '每則對話成本', value: `US$ ${c.per_conversation_usd.toFixed(4)}`, note: `7 天平均 US$ ${c.per_conversation_7d_avg_usd.toFixed(4)}`, threshold: '高於 7 天平均 2 倍', alert: c.per_conversation_usd > c.per_conversation_7d_avg_usd * 2 },
  ];
}

function Trend({ values, labels }: { values: number[]; labels: string[] }) {
  const w = 300, h = 90, pad = 6;
  const max = Math.max(...values), min = Math.min(...values) * 0.9;
  const pts = values.map((v, i) => [pad + (i * (w - pad * 2)) / (values.length - 1), h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2)]);
  return <figure className="bo-trend"><svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`近 7 天對話數：${values.map((v, i) => `${labels[i]} ${v}`).join('、')}`}><polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="#123d63" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />{pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i === pts.length - 1 ? 4 : 2.5} fill={i === pts.length - 1 ? '#123d63' : '#fff'} stroke="#123d63" strokeWidth="1.5" />)}</svg><figcaption>{labels[0]}–{labels[labels.length - 1]} 對話數（展示假資料）</figcaption></figure>;
}

function Bars({ rows, warn }: { rows: { name: string; share: number }[]; warn?: number }) {
  return <ul className="bo-bars">{rows.map((r) => <li key={r.name}><span>{r.name}</span><div className="bo-bar"><i style={{ width: `${r.share}%` }} className={warn && r.share > warn ? 'warn' : ''} /></div><b>{r.share}%</b></li>)}</ul>;
}

export function Dashboard() {
  const live = useLoad<LiveStats>('/stats');
  const l = live.data;
  const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v}%`);
  return <>
    <Panel title="監控儀表板" desc={<>以下為<strong>展示假資料</strong>，說明正式上線後要監控的指標與告警門檻（PRD「儀表板與監控」）。最後更新：{M.updated_at}</>}>
      <div className="bo-tiles">{tiles().map((t) => <article key={t.name} className={`bo-tile ${t.alert ? 'alert' : ''}`}><div className="bo-tile-top"><span>{t.group}</span>{t.alert ? <Badge tone="red">超過門檻</Badge> : <Badge tone="green">正常</Badge>}</div><h3>{t.name}</h3><strong>{t.value}</strong><p>{t.note}</p><small>告警：{t.threshold}</small></article>)}</div>
      <div className="bo-grid2">
        <div className="bo-card"><h3>對話趨勢</h3><Trend values={M.business.trend_7d} labels={M.business.trend_labels} /></div>
        <div className="bo-card"><h3>熱門意圖 Top 5</h3><Bars rows={M.business.intents} /></div>
        <div className="bo-card"><h3>推薦優惠分布</h3><Bars rows={M.business.promo_distribution} warn={60} /><p className="bo-hint">單一優惠超過 60% 代表推薦可能過度集中，需檢查權重與活動檔期。</p></div>
        <div className="bo-card bo-explain"><h3>為什麼要看「零搜尋回答比例」</h3><p>價格與活動常常變動，模型若沒有呼叫工具或搜尋官網就直接回答，很可能是憑記憶講出過時或錯誤的價格與檔期。這個比例的目標是 0%：只要大於 0 就每天逐筆檢視對話紀錄，找出是哪類問題漏查，再補知識庫或調整提示詞。</p><p>程式端也有對應防護：回答出現金額卻沒有來源時，會補上提醒並提供轉真人按鈕（T8）。</p></div>
      </div>
    </Panel>
    <Panel title="本機實際統計" desc="由這台展示伺服器啟動後的真實對話計算（不是假資料），伺服器重啟即歸零。" actions={<button className="bo-btn" onClick={live.reload}>重新整理</button>}>
      <Status loading={live.loading && !l} error={live.error} retry={live.reload} />
      {l && <div className="bo-tiles small">
        <article className="bo-tile"><h3>對話輪數</h3><strong>{l.turns}</strong><p>錯誤 {l.errors} 輪（{pct(l.error_rate)}）</p></article>
        <article className={`bo-tile ${l.zero_search_ratio ? 'alert' : ''}`}><h3>零搜尋回答比例</h3><strong>{pct(l.zero_search_ratio)}</strong><p>價格與優惠類 {l.price_turns} 輪，無來源 {l.ungrounded_price_turns} 輪</p></article>
        <article className="bo-tile"><h3>轉真人率</h3><strong>{pct(l.handoff_rate)}</strong><p>拒答（超出範圍）{l.out_of_scope} 輪</p></article>
        <article className="bo-tile"><h3>整輪回應時間</h3><strong>{l.turn_ms_p50 === null ? '—' : `${(l.turn_ms_p50 / 1000).toFixed(1)} 秒`}</strong><p>P95 {l.turn_ms_p95 === null ? '—' : `${(l.turn_ms_p95 / 1000).toFixed(1)} 秒`}（非首字時間）</p></article>
        <article className="bo-tile"><h3>待改善清單</h3><strong>{l.flagged}</strong><p>已標註為錯誤的回答</p></article>
      </div>}
    </Panel>
  </>;
}
