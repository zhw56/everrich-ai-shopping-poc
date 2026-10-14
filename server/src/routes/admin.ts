import { Router, type NextFunction, type Request, type Response } from 'express';
import { config, effectiveSource } from '../config.js';
import { getWeights, setWeights, type Weights } from '../engine/index.js';
import { fixedRules } from '../orchestrator/prompt.js';
import { loadSettings, saveSettings, SETTINGS_RANGES } from '../config/settings.js';
import { resetSecrets, saveSecrets, secretsStatus } from '../config/secrets.js';
import { apiKeyFor, getLlm, INCEPTION_DEFAULT_MODEL, modelFor, PROVIDER_LABEL, providerSource } from '../llm/index.js';
import { loadFrontend, saveFrontend } from '../config/frontend.js';
import { loadScenarios, saveScenarios, scenariosPrompt, SCENARIO_TOOLS } from '../config/scenarios.js';
import { deleteRow, KINDS, listRows, saveRow, setListed, type Kind } from '../admin/catalog.js';
import { deleteKb, listKb, saveKb } from '../admin/kb.js';
import { publish, publishStatus } from '../admin/publish.js';
import { audience, profileDetail, profileSummary, segmentStats } from '../admin/profiles.js';
import { deleteProfile, findProfile, listProfiles } from '../profile/store.js';
import { loadNba, RULE_TYPES, saveNba } from '../profile/nba.js';
import { SEGMENTS, segmentsOf } from '../profile/segments.js';
import { loadSources } from '../data.js';
import { getActivePrompt, loadPromptStore, savePromptVersion, setActiveVersion } from '../prompts.js';
import { runTool } from '../tools/index.js';
import { buildAllowedDomains } from '../tools/websearch.js';
import { createSession } from '../types.js';
import { flagLog, listLogs, liveStats } from '../admin/logs.js';
import { previewRanking, type PreviewTarget } from '../admin/preview.js';
import { createSource, deleteSource, loadSourcesFile, sourceReferences, updateSource } from '../admin/sources.js';

export const adminRouter = Router();
adminRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

const LOOPBACK = /^(127\.|::1$|::ffff:127\.)/;
/** 請求來源 IP：經本機 Vite 代理時取 X-Forwarded-For 的第一個位址 */
export function clientIp(req: Request): string {
  const socket = req.socket.remoteAddress ?? '';
  const xff = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
  return LOOPBACK.test(socket) && xff ? xff : socket;
}
/** POC 沒有帳號系統：只有本機（展示筆電）或帶正確 ADMIN_TOKEN 的請求可以寫入；區網其他裝置唯讀 */
export function canWrite(req: Request): boolean {
  const token = process.env.ADMIN_TOKEN;
  if (token && req.headers['x-admin-token'] === token) return true;
  // 雲端部署時請求都經過平台代理，X-Forwarded-For 可被偽造，只認管理密碼
  if (config.publicMode) return false;
  return LOOPBACK.test(clientIp(req));
}
function writeGuard(req: Request, res: Response, next: NextFunction) {
  if (canWrite(req)) return next();
  res.status(403).json({ ok: false, error: 'READ_ONLY', errors: [config.publicMode ? '請先在後台輸入管理密碼' : '此裝置為唯讀，請在展示筆電上修改'] });
}
const fail = (res: Response, r: { error: string; errors?: string[] }, status = 400) => res.status(status).json({ ok: false, error: r.error, errors: r.errors ?? [] });

adminRouter.get('/access', (req, res) => res.json({ ok: true, data: { can_write: canWrite(req) } }));

// ── 搜尋來源
function sourcesPayload() {
  const r = loadSourcesFile();
  if (!r.ok) return r;
  return {
    ok: true as const,
    data: {
      sources: r.sources.map((s) => ({ ...s, refs: sourceReferences(s.id) })),
      allowed_domains: buildAllowedDomains(r.sources).map((a) => a.domain_entry),
    },
  };
}
adminRouter.get('/sources', (_req, res) => {
  const p = sourcesPayload();
  p.ok ? res.json(p) : fail(res, p, 500);
});
adminRouter.post('/sources', writeGuard, (req, res) => {
  const r = createSource(req.body);
  r.ok ? res.json(sourcesPayload()) : fail(res, r);
});
adminRouter.put('/sources/:id', writeGuard, (req, res) => {
  const r = updateSource(String(req.params.id), req.body);
  r.ok ? res.json(sourcesPayload()) : fail(res, r, r.error === 'NOT_FOUND' ? 404 : 400);
});
adminRouter.delete('/sources/:id', writeGuard, (req, res) => {
  const r = deleteSource(String(req.params.id));
  r.ok ? res.json(sourcesPayload()) : fail(res, r, r.error === 'NOT_FOUND' ? 404 : r.error === 'SOURCE_IN_USE' ? 409 : 400);
});
/** 測試搜尋：實際呼叫 search_official_web（會用到 API 額度） */
adminRouter.post('/sources/test', writeGuard, async (req, res) => {
  const query = typeof req.body?.query === 'string' ? req.body.query.trim().slice(0, 200) : '';
  if (!query) return fail(res, { error: 'QUERY_REQUIRED', errors: ['請輸入測試問題'] });
  const r = await runTool('search_official_web', { query }, { session: createSession('admin-test') });
  res.json({ ok: true, data: { result_ok: r.ok, error: r.error ?? null, sources: r.sources ?? [], answer: (r.data as any)?.answer ?? (r.data as any)?.text ?? null } });
});

// ── Prompt 管理
function promptsPayload() {
  const store = loadPromptStore();
  const active = getActivePrompt();
  return { ok: true as const, data: { store: store.ok ? store.store : null, store_error: store.ok ? null : store.error, active: { version: active.version, source: active.source, error: active.error ?? null }, fixed_rules: fixedRules(loadSettings()) } };
}
adminRouter.get('/prompts', (_req, res) => res.json(promptsPayload()));
adminRouter.post('/prompts', writeGuard, (req, res) => {
  const b = req.body ?? {};
  const r = savePromptVersion({ content: String(b.content ?? ''), author: 'admin', note: typeof b.note === 'string' ? b.note.slice(0, 200) : '', activate: b.activate === true });
  r.ok ? res.json(promptsPayload()) : fail(res, r);
});
adminRouter.post('/prompts/active', writeGuard, (req, res) => {
  const r = setActiveVersion(String(req.body?.version ?? ''));
  r.ok ? res.json(promptsPayload()) : fail(res, r);
});

// ── 推薦規則
function parseWeights(b: any): Weights | null {
  const w = { saving: Number(b?.saving), fit: Number(b?.fit), ease: Number(b?.ease) };
  return Object.values(w).every((x) => Number.isFinite(x) && x >= 0) && Math.abs(w.saving + w.fit + w.ease - 1) <= 0.001 ? w : null;
}
function parseTarget(b: any): PreviewTarget {
  const m = b?.manual;
  if (m && Number.isFinite(Number(m.amount)) && Array.isArray(m.categories)) {
    return { manual: { amount: Math.max(0, Math.min(500000, Math.round(Number(m.amount)))), categories: m.categories.map(String).slice(0, 5), channel: m.channel === 'home' ? 'home' : 'dutyfree' } };
  }
  return { user_id: typeof b?.user_id === 'string' ? b.user_id : 'mock-user-a' };
}
adminRouter.get('/weights', (_req, res) => res.json({ ok: true, data: { weights: getWeights(), preview: previewRanking() } }));
/** 不寫檔的試算：比較目前權重與新權重的排序 */
adminRouter.post('/weights/preview', (req, res) => {
  const w = parseWeights(req.body?.weights);
  if (!w) return fail(res, { error: 'INVALID_WEIGHTS', errors: ['權重必須是非負數，且總和為 100%'] });
  const target = parseTarget(req.body?.target);
  res.json({ ok: true, data: { weights: w, current: previewRanking(getWeights(), target), preview: previewRanking(w, target) } });
});
adminRouter.post('/weights', writeGuard, (req, res) => {
  const w = parseWeights(req.body);
  if (!w) return fail(res, { error: 'INVALID_WEIGHTS', errors: ['權重必須是非負數，且總和為 100%'] });
  setWeights(w);
  res.json({ ok: true, data: { weights: getWeights(), preview: previewRanking() } });
});

// ── 對話紀錄與監控
adminRouter.get('/logs', (_req, res) => res.json({ ok: true, data: { logs: listLogs() } }));
adminRouter.post('/logs/:id/flag', writeGuard, (req, res) => {
  const l = flagLog(String(req.params.id), req.body?.flagged !== false, String(req.body?.note ?? ''));
  l ? res.json({ ok: true, data: l }) : fail(res, { error: 'NOT_FOUND' }, 404);
});
adminRouter.get('/stats', (_req, res) => res.json({ ok: true, data: liveStats() }));

// ── T13：優惠活動、商品、組合優惠價
const kindOf = (k: string): Kind | null => ((KINDS as string[]).includes(k) ? (k as Kind) : null);
const catalogPayload = (kind: Kind) => ({ ok: true as const, data: { rows: listRows(kind), sources: loadSources().map((s) => ({ id: s.id, type: s.type, title: s.title })) } });
adminRouter.get('/catalog/:kind', (req, res) => {
  const kind = kindOf(String(req.params.kind));
  kind ? res.json(catalogPayload(kind)) : fail(res, { error: 'NOT_FOUND' }, 404);
});
adminRouter.post('/catalog/:kind', writeGuard, (req, res) => {
  const kind = kindOf(String(req.params.kind));
  if (!kind) return fail(res, { error: 'NOT_FOUND' }, 404);
  const r = saveRow(kind, null, req.body ?? {});
  r.ok ? res.json(catalogPayload(kind)) : fail(res, r);
});
adminRouter.put('/catalog/:kind/:id', writeGuard, (req, res) => {
  const kind = kindOf(String(req.params.kind));
  if (!kind) return fail(res, { error: 'NOT_FOUND' }, 404);
  const r = saveRow(kind, String(req.params.id), req.body ?? {});
  r.ok ? res.json(catalogPayload(kind)) : fail(res, r, r.error === 'NOT_FOUND' ? 404 : 400);
});
adminRouter.post('/catalog/:kind/:id/listed', writeGuard, (req, res) => {
  const kind = kindOf(String(req.params.kind));
  if (!kind) return fail(res, { error: 'NOT_FOUND' }, 404);
  const r = setListed(kind, String(req.params.id), req.body?.listed !== false);
  r.ok ? res.json(catalogPayload(kind)) : fail(res, r, r.error === 'NOT_FOUND' ? 404 : 400);
});
adminRouter.delete('/catalog/:kind/:id', writeGuard, (req, res) => {
  const kind = kindOf(String(req.params.kind));
  if (!kind) return fail(res, { error: 'NOT_FOUND' }, 404);
  const r = deleteRow(kind, String(req.params.id));
  r.ok ? res.json(catalogPayload(kind)) : fail(res, r, r.error === 'NOT_FOUND' ? 404 : r.error === 'IN_USE' ? 409 : 400);
});

// ── T13：知識庫
const kbPayload = () => ({ ok: true as const, data: { items: listKb(), sources: loadSources().map((s) => ({ id: s.id, type: s.type, title: s.title })) } });
adminRouter.get('/kb', (_req, res) => res.json(kbPayload()));
adminRouter.post('/kb', writeGuard, (req, res) => {
  const r = saveKb(null, req.body);
  r.ok ? res.json(kbPayload()) : fail(res, r);
});
adminRouter.put('/kb/:id', writeGuard, (req, res) => {
  const r = saveKb(String(req.params.id), req.body);
  r.ok ? res.json(kbPayload()) : fail(res, r, r.error === 'NOT_FOUND' ? 404 : 400);
});
adminRouter.delete('/kb/:id', writeGuard, (req, res) => {
  const r = deleteKb(String(req.params.id));
  r.ok ? res.json(kbPayload()) : fail(res, r, r.error === 'NOT_FOUND' ? 404 : 400);
});

// ── T13：前台設定
adminRouter.get('/frontend', (_req, res) => res.json({ ok: true, data: loadFrontend() }));
adminRouter.put('/frontend', writeGuard, (req, res) => {
  const r = saveFrontend(req.body);
  r.ok ? res.json({ ok: true, data: r.config }) : fail(res, r);
});

// ── T13／T14：系統參數、模型、金鑰（金鑰只回傳遮罩，不回傳明文）
const settingsPayload = () => ({
  ok: true as const,
  data: {
    settings: loadSettings(),
    ranges: SETTINGS_RANGES,
    effective: effectiveSource(),
    secrets: secretsStatus(),
    env: { public_mode: config.publicMode, admin_token: !!process.env.ADMIN_TOKEN },
    provider: { ...providerSource(), labels: PROVIDER_LABEL, inception_default_model: INCEPTION_DEFAULT_MODEL, orchestrator: modelFor('orchestrator') ?? null, agent: modelFor('agent') ?? null },
  },
});
adminRouter.get('/settings', (_req, res) => res.json(settingsPayload()));
adminRouter.put('/settings', writeGuard, (req, res) => {
  const r = saveSettings(req.body);
  r.ok ? res.json(settingsPayload()) : fail(res, r);
});
adminRouter.put('/secrets', writeGuard, (req, res) => {
  const r = saveSecrets(req.body ?? {});
  r.ok ? res.json(settingsPayload()) : fail(res, r);
});
adminRouter.post('/secrets/reset', writeGuard, (_req, res) => {
  const r = resetSecrets();
  r.ok ? res.json(settingsPayload()) : fail(res, r);
});
/** 測試連線：用目前生效的供應商與金鑰，對主控與專員模型各送一個極短請求（會用到少量 API 額度） */
adminRouter.post('/settings/test', writeGuard, async (_req, res) => {
  const p = providerSource().value;
  if (!apiKeyFor(p)) return res.json({ ok: true, data: { results: [{ name: 'API 金鑰', ok: false, message: `尚未設定 ${PROVIDER_LABEL[p]} 的金鑰` }] } });
  const client = getLlm(p);
  const check = async (name: string, model?: string) => {
    if (!model) return { name, ok: false, message: '尚未設定模型名稱' };
    try {
      await client.messages.create({ model, max_tokens: 5, messages: [{ role: 'user', content: '測試' }] });
      return { name, ok: true, message: `${model} 可以使用` };
    } catch (e: any) {
      const status = e?.status ? `（${e.status}）` : '';
      const msg = e?.status === 401 ? 'API 金鑰無效' : e?.status === 404 ? `找不到模型 ${model}` : e?.status === 429 ? '額度或速率受限' : /credit balance/i.test(e?.message ?? '') ? 'API 額度不足，請儲值' : (e?.message ?? '連線失敗');
      return { name, ok: false, message: msg + status };
    }
  };
  const models = [modelFor('orchestrator', p), modelFor('agent', p)];
  const results = models[0] === models[1] ? [await check(`${PROVIDER_LABEL[p]}模型`, models[0])] : [await check('主控模型', models[0]), await check('專員模型', models[1])];
  res.json({ ok: true, data: { results } });
});

// ── T13：情境設定（T11 表單部分）
const scenariosPayload = () => ({ ok: true as const, data: { scenarios: loadScenarios(), tools: SCENARIO_TOOLS, prompt: scenariosPrompt() } });
adminRouter.get('/scenarios', (_req, res) => res.json(scenariosPayload()));
adminRouter.put('/scenarios', writeGuard, (req, res) => {
  const r = saveScenarios(req.body?.scenarios);
  r.ok ? res.json(scenariosPayload()) : fail(res, r);
});

// ── T13：發布到 GitHub
adminRouter.get('/publish', (_req, res) => res.json({ ok: true, data: publishStatus() }));
adminRouter.post('/publish', writeGuard, async (req, res) => {
  const r = await publish(String(req.body?.message ?? ''), { force: req.body?.force === true });
  r.ok ? res.json({ ok: true, data: { ...r, status: publishStatus() } }) : fail(res, r, r.error === 'CONFLICT' ? 409 : 400);
});

// ── T15：客戶畫像、分眾與行銷名單、NBA 規則（只在後台）
adminRouter.get('/profiles', (_req, res) => res.json({ ok: true, data: { profiles: listProfiles().map(profileSummary) } }));
adminRouter.get('/profiles/:id', (req, res) => {
  const p = findProfile(String(req.params.id));
  p ? res.json({ ok: true, data: profileDetail(p) }) : fail(res, { error: 'NOT_FOUND' }, 404);
});
adminRouter.delete('/profiles/:id', writeGuard, (req, res) => {
  deleteProfile(String(req.params.id)) ? res.json({ ok: true, data: { profiles: listProfiles().map(profileSummary) } }) : fail(res, { error: 'NOT_FOUND' }, 404);
});
adminRouter.get('/segments', (_req, res) => res.json({ ok: true, data: segmentStats() }));
adminRouter.post('/audience', (req, res) => {
  const b = req.body ?? {};
  const arr = (x: unknown) => (Array.isArray(x) ? x.map(String) : []);
  res.json({ ok: true, data: audience({ all: arr(b.all), none: arr(b.none), stages: arr(b.stages), include_demo: b.include_demo !== false }) });
});
const nbaPayload = () => {
  const config = loadNba();
  // 每條規則目前符合幾位客戶（含展示範例），讓行銷人員調整條件時看得到影響範圍
  const segs = listProfiles().map((p) => new Set(segmentsOf(p)));
  const matches = Object.fromEntries(config.rules.map((r) => [r.id, segs.filter((x) => r.when_all.every((s) => x.has(s)) && !r.when_none.some((s) => x.has(s))).length]));
  return { ok: true as const, data: { config, segments: SEGMENTS.map((s) => ({ id: s.id, label: s.label, desc: s.desc })), types: RULE_TYPES, matches } };
};
adminRouter.get('/nba', (_req, res) => res.json(nbaPayload()));
adminRouter.put('/nba', writeGuard, (req, res) => {
  const r = saveNba(req.body);
  r.ok ? res.json(nbaPayload()) : fail(res, r);
});

