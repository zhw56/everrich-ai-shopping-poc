import { useEffect, useState } from 'react';
import { api, errorText, type Ranking, type Weights as W } from './api';
import { Feedback, Panel, Status, nt, resultMsg, useLoad } from './ui';

const KEYS = [
  { k: 'saving', label: '省下金額', hint: '折扣與回饋越多分數越高' },
  { k: 'fit', label: '品類符合度', hint: '購物籃有多少金額適用' },
  { k: 'ease', label: '使用門檻', hint: '不限身分最高，需聯名卡或 App 任務較低' },
] as const;
const TARGETS = [
  { v: 'mock-user-a', label: 'S2 展示會員 A（創造者、常買美妝）' },
  { v: 'mock-user-b', label: '展示會員 B（探索者、12 月才出發）' },
  { v: 'mock-user-c', label: '展示會員 C（領航者、下週出發）' },
  { v: 'manual', label: '自訂預算' },
];
const CATS = ['美妝保養', '香水', '酒類', '精品配件', '食品伴手禮'];
const toPct = (w: W) => ({ saving: Math.round(w.saving * 100), fit: Math.round(w.fit * 100), ease: Math.round(w.ease * 100) });

function RankList({ r, compare }: { r: Ranking; compare?: Ranking }) {
  if (!r) return <p className="bo-hint">無資料</p>;
  if (!r.items.length) return <p className="bo-hint">沒有符合條件的優惠</p>;
  const before = new Map(compare?.items.map((x) => [x.id, x.rank]) ?? []);
  return <ol className="bo-rank">{r.items.map((x) => { const b = before.get(x.id); const move = b === undefined ? (compare ? '新進' : '') : b > x.rank ? `↑${b - x.rank}` : b < x.rank ? `↓${x.rank - b}` : ''; return <li key={x.id}><b>{x.rank}</b><div><strong>{x.name}</strong><small><span className="bo-score">{x.score} 分</span>・{x.saving > 0 ? `可省 ${nt(x.saving)} 元` : x.gap > 0 ? `還差 ${nt(x.gap)} 元達門檻` : x.label}</small></div>{move && <em className={move.startsWith('↓') ? 'down' : 'up'}>{move}</em>}</li>; })}</ol>;
}

export function Weights({ canWrite }: { canWrite: boolean }) {
  const { data, setData, error, loading, reload } = useLoad<{ weights: W; preview: Ranking }>('/weights');
  const [pct, setPct] = useState({ saving: 50, fit: 30, ease: 20 });
  const [target, setTarget] = useState('mock-user-a');
  const [manual, setManual] = useState({ amount: 12000, categories: ['美妝保養', '精品配件'] as string[], channel: 'dutyfree' });
  const [cmp, setCmp] = useState<{ current: Ranking; preview: Ranking } | null>(null);
  const [cmpErr, setCmpErr] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) setPct(toPct(data.weights)); }, [data?.weights.saving, data?.weights.fit, data?.weights.ease]);
  const sum = pct.saving + pct.fit + pct.ease;
  const weights = { saving: pct.saving / 100, fit: pct.fit / 100, ease: pct.ease / 100 };
  const dirty = data ? JSON.stringify(toPct(data.weights)) !== JSON.stringify(pct) : false;

  useEffect(() => {
    if (sum !== 100 || !data) return;
    const c = new AbortController();
    const t = setTimeout(() => {
      api<{ current: Ranking; preview: Ranking }>('/weights/preview', { method: 'POST', body: { weights, target: target === 'manual' ? { manual } : { user_id: target } }, signal: c.signal })
        .then((r) => { if (r.ok) { setCmp(r.data); setCmpErr(''); } else setCmpErr(errorText(r)); })
        .catch(() => {});
    }, 200);
    return () => { clearTimeout(t); c.abort(); };
  }, [pct.saving, pct.fit, pct.ease, target, manual.amount, manual.categories.join(), manual.channel, data]);

  async function save() {
    setBusy(true);
    const r = await api<{ weights: W; preview: Ranking }>('/weights', { method: 'POST', body: weights });
    setBusy(false);
    setMsg(resultMsg(r, '已寫回推薦權重，下一次推薦立即使用'));
    if (r.ok) setData(r.data);
  }
  const changed = cmp && JSON.stringify(cmp.current?.items.map((x) => x.id)) !== JSON.stringify(cmp.preview?.items.map((x) => x.id));

  return <Panel title="推薦規則" desc="調整優惠推薦引擎的評分權重（寫回 server/src/engine/weights.json）。分數、可折金額與排序都由程式計算，AI 只負責說明。排除條件：已過期、出發前就結束、會員等級不符、購物籃沒有適用分類。">
    <Feedback msg={msg} />
    <Status loading={loading} error={error} retry={reload} />
    {data && <div className="bo-grid2">
      <div className="bo-card"><h3>評分權重</h3>
        {KEYS.map(({ k, label, hint }) => <label key={k} className="bo-slider"><span><strong>{label}</strong><small>{hint}</small></span><input type="range" min={0} max={100} step={5} value={pct[k]} onChange={(e) => setPct((p) => ({ ...p, [k]: Number(e.target.value) }))} aria-valuetext={`${pct[k]}%`} /><output>{pct[k]}%</output></label>)}
        <p className={`bo-sum ${sum === 100 ? 'ok' : 'bad'}`}>合計 {sum}%{sum !== 100 && '，必須等於 100% 才能試算與儲存'}</p>
        <div className="bo-form-actions"><button className="bo-btn" onClick={() => setPct({ saving: 50, fit: 30, ease: 20 })}>恢復預設 50／30／20</button><button className="bo-btn primary" disabled={!canWrite || !dirty || sum !== 100 || busy} onClick={() => void save()}>{busy ? '儲存中…' : '儲存權重'}</button></div>
        {!canWrite && <p className="bo-hint">此裝置為唯讀：可以拖動試算，但不能儲存。</p>}
      </div>
      <div className="bo-card"><h3>排序試算</h3>
        <label className="bo-field">試算對象<select value={target} onChange={(e) => setTarget(e.target.value)}>{TARGETS.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}</select></label>
        {target === 'manual' && <><div className="bo-inline"><label className="bo-field">預算（元）<input type="number" min={0} max={500000} step={1000} value={manual.amount} onChange={(e) => setManual((m) => ({ ...m, amount: Number(e.target.value) }))} /></label><label className="bo-field">通路<select value={manual.channel} onChange={(e) => setManual((m) => ({ ...m, channel: e.target.value }))}><option value="dutyfree">免稅店</option><option value="home">宅配網</option></select></label></div><span className="bo-checks">{CATS.map((c) => <label key={c} className="bo-check"><input type="checkbox" checked={manual.categories.includes(c)} onChange={(e) => setManual((m) => ({ ...m, categories: e.target.checked ? [...m.categories, c] : m.categories.filter((x) => x !== c) }))} />{c}</label>)}</span></>}
        {cmpErr && <p className="bo-warn">{cmpErr}</p>}
        {cmp && <><p className="bo-hint">{cmp.preview?.label}</p><div className="bo-grid2 tight"><div><h4>目前權重</h4><RankList r={cmp.current} /></div><div><h4>試算權重</h4><RankList r={cmp.preview} compare={cmp.current} /></div></div><p className={`bo-sum ${changed ? 'ok' : ''}`}>{changed ? '排序會改變。' : '排序相同（分數可能不同）。可以試試把「使用門檻」調高：需要聯名卡或 App 任務的優惠會往後排。'}</p></>}
      </div>
    </div>}
  </Panel>;
}
