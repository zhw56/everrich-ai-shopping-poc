import { apiKeyFor, getLlm, modelFor } from '../llm/index.js';
import { applyPatches, type AttrPatch } from './merge.js';
import { ATTRS, displayValue, INTENT_STAGES, SENTIMENTS, SYSTEM_ONLY, type Profile } from './schema.js';

const NL = String.fromCharCode(10);
const TOPICS = ['優惠', '美妝', '酒類', '伴手禮', '訂單', '預購提貨', '菸酒額度', '會員點數', '宅配', '客訴', '其他'];
const EXTRACTABLE = ATTRS.filter((a) => !SYSTEM_ONLY.has(a.key));

const TOOL = {
  name: 'record_profile',
  description: '記錄這一輪從客戶發言得到的新資訊或變更',
  input_schema: {
    type: 'object',
    properties: {
      attributes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            key: { type: 'string', enum: EXTRACTABLE.map((a) => a.key) },
            op: { type: 'string', enum: ['set', 'remove'], description: '預設 set；客戶否定先前的條件時用 remove（清單欄位只移除 value 裡的項目）' },
            value: { description: '依欄位型別：數字、是否、選項文字或文字陣列' },
            source: { type: 'string', enum: ['stated', 'inferred'] },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            evidence: { type: 'string', description: '客戶原句中的一小段（逐字複製，20 字內）' },
          },
          required: ['key', 'value', 'source', 'confidence', 'evidence'],
        },
      },
      intent_stage: { type: 'string', enum: [...INTENT_STAGES] },
      sentiment: { type: 'string', enum: [...SENTIMENTS] },
      topics: { type: 'array', items: { type: 'string', enum: TOPICS } },
    },
    required: ['attributes', 'intent_stage', 'sentiment', 'topics'],
  },
};

const SYSTEM = [
  '你是免稅店購物客服的客戶洞察分析師，從客戶這一輪的發言整理結構化需求，供後台分眾與推薦使用。',
  '規則：',
  '- 只根據「客戶發言」判斷；客服回答只當上下文。',
  '- source 為 stated 時，evidence 必須逐字複製客戶原句中的片段；沒有明說、靠語氣或情境判斷的一律用 inferred 並降低 confidence。',
  '- 例：「下週五要飛東京，想買酒和送媽媽的保養品」→ destination=東京（stated）、category_interest=[酒類, 美妝保養]（stated）、gift_for=[媽媽]（stated）。',
  '- 例：「第一個」等回覆選項時，依上一輪提供的選項換成實際條件。',
  '- 例：「不用太貴，心意到就好」→ price_sensitivity=高（inferred）、budget_item 給保守數字（inferred, 0.5）。「我不喜歡太濃的香水」→ product_priorities=[清新香調]（inferred）。',
  '- 例：「我沒有要出國，可以寄到家嗎」→ shopping_channel=宅配到府（stated）。',
  '- 客戶否定先前的條件時用 op=remove，例：「我又不是要送人」→ gift_for remove（stated）。',
  '- interested_products 只記客戶自己點名、選擇或追問的商品或優惠（例如「第一個」對應的那一款）；客服列出但客戶沒回應的不要記。',
  '- 只輸出這一輪新得到或改變的資訊；沒有就給空陣列。',
  '- 絕對不要記錄健康、疾病、宗教、政治、性向、犯罪、種族、證件號碼、地址等敏感資訊。',
  '- intent_stage：只是問問＝瀏覽；比較商品或優惠＝比較；說要買、要預購、問怎麼提貨＝準備購買；訂單、退換貨、規定＝服務需求；抱怨或說不想再來買＝流失風險。',
  '- 欄位說明：' + EXTRACTABLE.map((a) => `${a.key}（${a.label}；${a.type}${a.options ? '：' + a.options.join('／') : ''}）`).join('；'),
].join(NL);

function summary(p: Profile): string {
  const lines = Object.entries(p.attributes).map(([k, a]) => `${k}=${displayValue(a.value)}（${a.source}）`);
  return lines.length ? lines.join('；') : '（尚無資料）';
}

/** 抽取並合併；失敗時靜默略過（畫像是加值功能，不影響對話） */
export async function extractInto(p: Profile, turn: { user: string; assistant: string; options: string[] }): Promise<string[]> {
  const model = modelFor('agent');
  if (!apiKeyFor() || !model) return [];
  const content = [
    `目前畫像：${summary(p)}`,
    turn.options.length ? `上一輪提供給客戶的選項：${turn.options.join('／')}` : '',
    `客戶發言：${turn.user}`,
    `客服回答（上下文）：${turn.assistant.slice(0, 600)}`,
  ].filter(Boolean).join(NL);
  const res: any = await getLlm().messages.create({
    model,
    max_tokens: 800,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: 'record_profile' },
    messages: [{ role: 'user', content }],
  } as any);
  const out = (res.content ?? []).find((b: any) => b.type === 'tool_use')?.input;
  if (!out) return [];
  const patches: AttrPatch[] = Array.isArray(out.attributes) ? out.attributes : [];
  const changed = applyPatches(p, patches, turn.user);
  if (INTENT_STAGES.includes(out.intent_stage)) p.intent_stage = out.intent_stage;
  if (SENTIMENTS.includes(out.sentiment)) p.sentiment = out.sentiment;
  if (Array.isArray(out.topics)) p.topics = [...new Set([...p.topics, ...out.topics.filter((t: string) => TOPICS.includes(t))])].slice(0, 8);
  return changed;
}
