/** 單輪煙霧測試：npm run smoke --workspace server -- "問題"（用目前供應商，預設本機 Inception） */
import { activeProvider, modelFor } from '../src/llm/index.js';
import { runTurn } from '../src/orchestrator/index.js';

const qs = process.argv.slice(2).length ? process.argv.slice(2) : ['預算 3,000 以內有什麼適合送長輩的伴手禮？'];
console.log(`供應商 ${activeProvider()}／${modelFor('orchestrator')}`);
const sid = 'smoke-' + Date.now();
for (const q of qs) {
  let answer = '';
  const events: string[] = [];
  const t = Date.now();
  const out = await runTurn(sid, q, (e, d: any) => {
    if (e === 'delta') answer += d.text;
    else if (e === 'action') events.push(`${d.type}:${JSON.stringify(d.payload).slice(0, 80)}`);
    else if (e === 'cards') events.push(`cards:${d.type}×${d.items.length}`);
  });
  console.log(`\n你：${q}\n客服：${answer}\n  ${events.join('｜')}\n  工具：${out.meta.tools.join('、') || '無'}　${((Date.now() - t) / 1000).toFixed(1)} 秒`);
}
process.exit(0);
