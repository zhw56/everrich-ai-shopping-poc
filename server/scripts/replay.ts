import { runTurn, verifyAndResume } from '../src/orchestrator/index.js';
import { profileIdle } from '../src/profile/index.js';
import { actionsFor } from '../src/profile/nba.js';
import { displayValue } from '../src/profile/schema.js';
import { SEGMENT_LABEL, segmentsOf } from '../src/profile/segments.js';

/**
 * T15 回歸：重播模擬的真實顧客對話（口語、改口、選項回覆），檢查體驗問題是否改善，並印出後台畫像。
 * 會實際呼叫 API。用法：npm run replay --workspace server
 */
const NL = String.fromCharCode(10);
const SESSIONS: { id: string; verify?: string; turns: string[] }[] = [
  { id: 'replay-student', turns: ['推薦送媽媽的保養品', '我是學生預算不多', '第一個', '三千以內', '我不喜歡香奈兒', '三千只有這個？？？', '你們有賣 Dyson 嗎', '我又不是要送人啦，自己用', '錢不是問題 我很有錢'] },
  { id: 'replay-nonmember', turns: ['免稅店的東西真的比較便宜嗎', '我又不是會員 驗證幹嘛', '我想要清新一點的香水，不要太濃', '你先推薦，預算都好說', '下禮拜五跟家人四個人去大阪', '那可以帶幾瓶威士忌', '我看起來像盤子嗎', '我沒有要出國了，可以寄到家嗎', '我現在都在網路上買'] },
  { id: 'replay-user-c', verify: '0900-000-003', turns: ['我的預購單是不是有問題', '為什麼沒有折 1,000', '好啦算了，那我再加一瓶酒可以嗎', '提貨要帶什麼'] },
];
const ALLOW = /^(RICHCLUB|RICH|POINT|CHANEL|Dior|Sauvage|Malone|London|Lancôme|Lanc|Estée|Lauder|SHISEIDO|Shiseido|Kiehl|COACH|Aviator|HIBIKI|KAVALAN|Macallan|Moët|Chandon|GODIVA|SunnyHills|Dyson|Pay|App)$/i;
let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
  ok ? pass++ : fail++;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : '：' + detail}`);
};

for (const s of SESSIONS) {
  console.log(`${NL}==== ${s.id}`);
  const answers: string[] = [];
  const actions: { turn: number; type: string }[] = [];
  let i = 0;
  for (const q of s.turns) {
    i++;
    let text = '';
    const emit = (ev: string, d: any) => {
      if (ev === 'delta') text += d.text;
      if (ev === 'action') actions.push({ turn: i, type: d.type });
    };
    const r = await runTurn(s.id, q, emit);
    answers.push(r.answer);
    console.log(`${NL}你：${q}${NL}客服：${r.answer.replace(/\n+/g, ' / ').slice(0, 260)}${NL}  [工具] ${r.meta.tools.join('、') || '無'}${r.meta.nba ? `　[NBA] ${r.meta.nba}` : ''}　${(r.meta.ms / 1000).toFixed(1)} 秒`);
    if (s.verify && i === 1) {
      const v = await verifyAndResume(s.id, s.verify, '123456');
      if (v.resume_message) {
        const r2 = await runTurn(s.id, v.resume_message, emit);
        answers.push(r2.answer);
        console.log(`  [驗證後接續] ${r2.answer.replace(/\n+/g, ' / ').slice(0, 200)}`);
      }
    }
  }
  const all = answers.join(NL);
  const english = (all.match(/[A-Za-z]{4,}/g) ?? []).filter((w) => !ALLOW.test(w));
  check(`${s.id} 沒有中英夾雜`, english.length === 0, english.join(','));
  check(`${s.id} 展示資料聲明最多一次`, (all.match(/以上含展示資料/g) ?? []).length <= 1, String((all.match(/以上含展示資料/g) ?? []).length));
  check(`${s.id} 沒有過場句`, !/(請稍候|讓我(重新)?(確認|查))/.test(all));
  check(`${s.id} 沒有一直要求點按鈕`, (all.match(/點選(上方|按鈕|選項|其中)/g) ?? []).length <= 1);
  if (s.id === 'replay-nonmember') check('非會員表明後不再要求驗證', !actions.some((a) => a.type === 'verify' && a.turn >= 2));

  const p = await profileIdle(s.id);
  console.log(`${NL}  [後台畫像] ${p?.id}　意圖：${p?.intent_stage}　情緒：${p?.sentiment}`);
  for (const [k, a] of Object.entries(p?.attributes ?? {})) console.log(`    ${k}＝${displayValue(a.value)}（${a.source} ${a.confidence}）${a.evidence ? `「${a.evidence}」` : ''}`);
  console.log(`    客群：${p ? segmentsOf(p).map((x) => SEGMENT_LABEL.get(x)).join('、') : ''}`);
  console.log(`    NBA：${p ? actionsFor(p).map((a) => a.title).join('、') : ''}`);
  const attr = (k: string) => p?.attributes[k]?.value;
  if (s.id === 'replay-student') {
    check('畫像：學生', attr('customer_type') === '學生');
    check('畫像：排斥香奈兒', JSON.stringify(attr('brand_avoid') ?? '').match(/CHANEL|香奈兒/i) !== null);
    check('畫像：單件預算約三千內', typeof attr('budget_item') === 'number' && (attr('budget_item') as number) <= 3000 || attr('price_sensitivity') === '高');
  }
  if (s.id === 'replay-nonmember') {
    check('畫像：不是會員', attr('is_member') === false);
    check('畫像：同行 4 人', attr('party_size') === 4);
    check('畫像：改成宅配到府', attr('shopping_channel') === '宅配到府');
  }
  if (s.id === 'replay-user-c') {
    check('畫像：會員資料寫入下一趟出發日', attr('next_trip') === '2026-10-23');
    check('畫像：近期出國客群', !!p && segmentsOf(p).includes('trip_soon'));
  }
}
console.log(`${NL}通過 ${pass} 項，失敗 ${fail} 項`);
process.exit(fail ? 1 : 0);
