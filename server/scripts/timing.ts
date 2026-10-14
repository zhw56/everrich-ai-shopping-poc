/** 計時：驗證流程與派工回答（LLM_PROVIDER=anthropic LLM_DEBUG=1 npm run timing --workspace server） */
import { activeProvider, modelFor } from '../src/llm/index.js';
import { runTurn, verifyAndResume } from '../src/orchestrator/index.js';

const phone = process.argv[2] ?? '0900-000-002';
const question = process.argv[3] ?? '下週要出國，想買保養品送媽媽，有什麼優惠？';
console.log(`供應商 ${activeProvider()}／${modelFor('orchestrator')}`);
const sid = 'timing-' + Date.now();
async function turn(q: string) {
  let answer = '';
  const t = Date.now();
  let first = 0;
  const out = await runTurn(sid, q, (e, d: any) => {
    if (e === 'delta') { if (!first) first = Date.now() - t; answer += d.text; }
  });
  console.log(`\n你：${q}\n客服：${answer}\n  首字 ${(first / 1000).toFixed(1)} 秒、整輪 ${((Date.now() - t) / 1000).toFixed(1)} 秒；工具 ${out.meta.tools.join('、') || '無'}；專員 ${out.meta.agents.join('、') || '無'}`);
}
await turn(question);
const v = await verifyAndResume(sid, phone, '123456');
if (v.resume_message) await turn(v.resume_message);
for (const q of process.argv.slice(4)) await turn(q);
process.exit(0);
