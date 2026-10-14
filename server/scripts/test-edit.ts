import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { DATA_DIR } from '../src/data.js';
import { deleteRow, listRows, saveRow, setListed } from '../src/admin/catalog.js';
import { deleteKb, listKb, parseKb, saveKb, serializeKb } from '../src/admin/kb.js';
import { changedFiles, gitBlobSha, publish, publishStatus, resetBaseline, REPO_ROOT } from '../src/admin/publish.js';
import { loadSettings, saveSettings } from '../src/config/settings.js';
import { decryptSecrets, encryptSecrets, getSecret, maskSecret, saveSecrets, secretsStatus, SECRETS_FILE } from '../src/config/secrets.js';
import { config } from '../src/config.js';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultFrontend, loadFrontend, saveFrontend } from '../src/config/frontend.js';
import { loadScenarios, saveScenarios, scenariosPrompt } from '../src/config/scenarios.js';
import { fixedRules } from '../src/orchestrator/prompt.js';
import { runTool } from '../src/tools/index.js';
import { createSession } from '../src/types.js';

// 這些測試會改正式 data/ 檔案，結束時一律還原
const FILES = ['promos.json', 'products.json', 'bundles.json', 'kb.md', 'settings.json', 'frontend.json', 'scenarios.json'];
const snapshot = new Map<string, string>();
before(() => {
  for (const f of FILES) snapshot.set(f, readFileSync(DATA_DIR + f, 'utf8'));
  resetBaseline();
});
after(() => {
  for (const [f, text] of snapshot) writeFileSync(DATA_DIR + f, text, 'utf8');
});
const restore = (f: string) => writeFileSync(DATA_DIR + f, snapshot.get(f)!, 'utf8');
const anon = { session: createSession('edit-test') };

test('系統參數：範圍驗證、生效到固定規則', () => {
  assert.equal(saveSettings({ max_tool_calls: 7 }).ok, false);
  assert.equal(saveSettings({ max_agents: 0 }).ok, false);
  assert.equal(saveSettings({ agent_timeout_seconds: 4 }).ok, false);
  const r = saveSettings({ max_tool_calls: 4, max_agents: 2 });
  assert.ok(r.ok);
  assert.equal(loadSettings().max_tool_calls, 4);
  assert.match(fixedRules(loadSettings()), /最多 4 次工具呼叫、最多派 2 個專員/);
  restore('settings.json');
});

test('系統參數：模型與分享網址由後台設定優先、格式驗證', () => {
  const prev = process.env.MODEL_ORCHESTRATOR;
  process.env.MODEL_ORCHESTRATOR = 'claude-env-model';
  assert.ok(saveSettings({ model_orchestrator: '' }).ok);
  assert.equal(saveSettings({ model_orchestrator: 'Bad Model!' }).ok, false);
  assert.equal(saveSettings({ share_base_url: 'ftp://x' }).ok, false);
  assert.equal(saveSettings({ github_repo: 'no-slash' }).ok, false);
  assert.equal(config.modelOrchestrator, 'claude-env-model', '後台留空時用環境變數');
  const r = saveSettings({ model_orchestrator: 'claude-admin-model', share_base_url: 'https://example.onrender.com', github_repo: 'owner/repo' });
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(config.modelOrchestrator, 'claude-admin-model', '後台有填時立即生效');
  assert.equal(loadSettings().share_base_url, 'https://example.onrender.com/');
  if (prev === undefined) delete process.env.MODEL_ORCHESTRATOR; else process.env.MODEL_ORCHESTRATOR = prev;
  restore('settings.json');
});

test('金鑰：以 ADMIN_TOKEN 加密、錯誤密碼解不開、只回傳遮罩', () => {
  const env = encryptSecrets({ anthropic_api_key: 'sk-ant-test-1234567890' }, 'pw-1');
  assert.ok(!JSON.stringify(env).includes('sk-ant-test'), '檔案內不得出現明文');
  assert.equal(decryptSecrets(env, 'pw-1').anthropic_api_key, 'sk-ant-test-1234567890');
  assert.throws(() => decryptSecrets(env, 'pw-2'));
  assert.equal(maskSecret('sk-ant-test-1234567890'), 'sk-ant-…7890');

  const file = join(mkdtempSync(join(tmpdir(), 'everrich-sec-')), 'secrets.enc.json');
  const prevToken = process.env.ADMIN_TOKEN;
  delete process.env.ADMIN_TOKEN;
  assert.equal(saveSecrets({ anthropic_api_key: 'sk-ant-x' }, file).ok, false, '沒有 ADMIN_TOKEN 不能保存');
  process.env.ADMIN_TOKEN = 'pw-1';
  assert.equal(saveSecrets({ anthropic_api_key: 'not-a-key' }, file).ok, false);
  assert.ok(saveSecrets({ anthropic_api_key: 'sk-ant-abc-0000001111', github_token: 'github_pat_xyz' }, file).ok);
  assert.equal(getSecret('anthropic_api_key', file), 'sk-ant-abc-0000001111');
  const st = secretsStatus(file);
  assert.equal(st.masked.anthropic_api_key, 'sk-ant-…1111');
  assert.ok(!JSON.stringify(st).includes('0000001111'));
  assert.ok(saveSecrets({ github_token: '' }, file).ok);
  assert.equal(getSecret('github_token', file), '', '空字串代表清除');
  process.env.ADMIN_TOKEN = 'pw-2';
  assert.equal(getSecret('anthropic_api_key', file), '', '換密碼後解不開');
  assert.equal(secretsStatus(file).locked, true);
  if (prevToken === undefined) delete process.env.ADMIN_TOKEN; else process.env.ADMIN_TOKEN = prevToken;
  assert.equal(existsSync(SECRETS_FILE), false, '測試不寫正式加密檔');
});

test('前台設定：必填驗證、儲存後公開設定讀到新值', () => {
  assert.equal(saveFrontend({ ...defaultFrontend(), welcome_title: '' }).ok, false);
  assert.equal(saveFrontend({ ...defaultFrontend(), shortcuts: [] }).ok, false);
  const r = saveFrontend({ ...defaultFrontend(), welcome_title: '測試歡迎詞' });
  assert.ok(r.ok);
  assert.equal(loadFrontend().welcome_title, '測試歡迎詞');
  restore('frontend.json');
});

test('情境設定：工具名稱驗證、停用情境進入提示詞', () => {
  const list = loadScenarios();
  assert.equal(saveScenarios([{ ...list[0], tools: ['hack_tool'] }]).ok, false);
  const r = saveScenarios(list.map((x) => (x.id === 'S10' ? { ...x, enabled: false } : x)));
  assert.ok(r.ok);
  assert.match(scenariosPrompt(), /S10 超出範圍的問題：已停用/);
  restore('scenarios.json');
});

test('優惠編輯：改折扣自動標展示資料、上下架影響查詢、引用保護', async () => {
  const r = saveRow('promos', 'promo-preorder-rebate', { discount_rate: 0.06 });
  assert.ok(r.ok, JSON.stringify(r));
  const p = listRows('promos').find((x) => x.id === 'promo-preorder-rebate')!;
  assert.equal(p.discount_rate, 0.06);
  assert.equal(p.mock, true);
  assert.ok(p.mock_fields?.includes('discount_rate'));
  const q = await runTool('query_promos', { promo_type: 'rebate' }, anon);
  assert.ok((q.data as any).promos.some((x: any) => x.id === 'promo-preorder-rebate'));
  assert.ok(setListed('promos', 'promo-preorder-rebate', false).ok);
  const q2 = await runTool('query_promos', { promo_type: 'rebate' }, anon);
  assert.ok(!((q2.data as any)?.promos ?? []).some((x: any) => x.id === 'promo-preorder-rebate'), '下架後不出現在查詢');
  const used = deleteRow('promos', 'promo-beauty-week');
  assert.equal(used.ok, false);
  assert.equal((used as any).error, 'IN_USE');
  assert.equal(saveRow('promos', 'promo-beauty-week', { discount_rate: 1.5 }).ok, false, '折扣比例要介於 0 到 1');
  restore('promos.json');
});

test('資料檢查擋下破壞展示情境的修改，正式檔不變', () => {
  const beforeText = readFileSync(DATA_DIR + 'products.json', 'utf8');
  const r = saveRow('products', 'prod-macallan-12-700', { category: '美妝保養' });
  assert.equal(r.ok, false);
  assert.equal(readFileSync(DATA_DIR + 'products.json', 'utf8'), beforeText);
  assert.equal(saveRow('products', 'prod-skii-essence-230', { name: '' }).ok, false);
});

test('商品與組合優惠價：新增、重複組合、刪除', () => {
  const src = listRows('products')[0].source_id;
  const c = saveRow('products', null, { name: '測試商品', brand: 'TestBrand', category: '香水', price: 3999, home_price: 4399, size_label: '50ml', tags: ['清新'], source_id: src, note: '測試' });
  assert.ok(c.ok, JSON.stringify(c));
  const d = listRows('products').find((x) => x.name === '測試商品')!;
  assert.match(d.id, /^prod-custom-/);
  assert.equal(d.mock, true);
  assert.equal(d.price_kind, 'mock');
  assert.deepEqual(d.channels, ['dutyfree', 'home']);
  const b0 = listRows('bundles')[0];
  const dup = saveRow('bundles', null, { product_id: b0.product_id, promo_id: b0.promo_id, channel: b0.channel, bundle_price: 1, note: 'x' });
  assert.equal(dup.ok, false);
  const nb = saveRow('bundles', null, { product_id: d.id, promo_id: 'promo-card-cobrand', channel: 'dutyfree', bundle_price: 3599, note: '測試' });
  assert.ok(nb.ok, JSON.stringify(nb));
  const wrong = saveRow('bundles', null, { product_id: d.id, promo_id: 'promo-home-first', channel: 'dutyfree', bundle_price: 3599, note: '測試' });
  assert.equal(wrong.ok, false, '宅配網優惠不能配免稅店通路');
  assert.equal(deleteRow('products', d.id).ok, false, '被組合引用時不可刪');
  restore('bundles.json');
  restore('products.json');
});

test('知識庫：格式往返不變、新增編輯刪除、核心主題保護', () => {
  const original = readFileSync(DATA_DIR + 'kb.md', 'utf8');
  const parsed = parseKb(original);
  assert.equal(serializeKb(parsed.header, parsed.items), original);
  const n = listKb().length;
  const src = listKb()[0].source_id;
  const c = saveKb(null, { title: '測試問題', source_id: src, body: '測試內容' });
  assert.ok(c.ok, JSON.stringify(c));
  const item = listKb().find((k) => k.title === '測試問題')!;
  assert.ok(saveKb(item.id, { body: '改過的內容' }).ok);
  assert.equal(listKb().find((k) => k.id === item.id)!.body, '改過的內容');
  assert.ok(deleteKb(item.id).ok);
  assert.equal(listKb().length, n);
  const allowance = listKb().filter((k) => (k.title + k.body).includes('1.5 公升'));
  let r: any = { ok: true };
  for (const k of allowance) r = deleteKb(k.id);
  assert.equal(r.ok, false, '刪光菸酒額度主題要被擋下');
  restore('kb.md');
});

test('發布到 GitHub：未設定、變更偵測、衝突保護、成功提交', async () => {
  delete process.env.GITHUB_TOKEN;
  restore('frontend.json');
  resetBaseline();
  assert.equal(changedFiles().length, 0);
  saveFrontend({ ...defaultFrontend(), welcome_title: '發布測試' });
  assert.deepEqual(changedFiles().map((f) => f.path), ['data/frontend.json']);
  assert.equal((await publish('x')).ok, false);

  process.env.GITHUB_TOKEN = 'test-token';
  process.env.GITHUB_REPO = 'owner/repo';
  assert.ok(saveSettings({ github_repo: '', github_branch: '' }).ok);
  restore('frontend.json');
  resetBaseline();
  saveFrontend({ ...defaultFrontend(), welcome_title: '發布測試' });
  assert.equal(publishStatus().configured, true);
  const original = snapshot.get('frontend.json')!;
  const calls: string[] = [];
  const fake = (remoteContent: string) =>
    (async (url: string, init: any) => {
      const path = url.replace('https://api.github.com/repos/owner/repo', '');
      calls.push(`${init.method} ${path}`);
      assert.equal(init.headers.Authorization, 'Bearer test-token');
      const json = (x: unknown) => new Response(JSON.stringify(x), { status: 200 });
      if (path === '/git/ref/heads/main') return json({ object: { sha: 'head1' } });
      if (path === '/git/commits/head1') return json({ tree: { sha: 'tree1' } });
      if (path.startsWith('/git/trees/tree1')) return json({ tree: [{ path: 'data/frontend.json', type: 'blob', sha: gitBlobSha(remoteContent) }] });
      if (path === '/git/trees') {
        const body = JSON.parse(init.body);
        assert.equal(body.base_tree, 'tree1');
        assert.deepEqual(body.tree.map((t: any) => t.path), ['data/frontend.json']);
        return json({ sha: 'tree2' });
      }
      if (path === '/git/commits') return json({ sha: 'commit2', html_url: 'https://github.com/owner/repo/commit/commit2' });
      if (path === '/git/refs/heads/main') return json({ ref: 'refs/heads/main' });
      return new Response('{}', { status: 404 });
    }) as unknown as typeof fetch;

  const conflict = await publish('x', { fetchImpl: fake('{"someone":"else"}') });
  assert.equal(conflict.ok, false);
  assert.equal((conflict as any).error, 'CONFLICT');
  const ok = await publish('後台發布測試', { fetchImpl: fake(original) });
  assert.ok(ok.ok, JSON.stringify(ok));
  assert.ok(calls.includes('PATCH /git/refs/heads/main'));
  assert.equal(changedFiles().length, 0, '發布後基準更新');
  assert.ok(REPO_ROOT.endsWith('/'));
  delete process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_REPO;
  restore('settings.json');
});
