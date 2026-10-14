import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { SOURCES_FILE, createSource, deleteSource, loadSourcesFile, sourceReferences, updateSource, validateSources } from '../src/admin/sources.js';
import { clearLogs, flagLog, listLogs, liveStats, maskText, recordTurn } from '../src/admin/logs.js';
import { previewRanking } from '../src/admin/preview.js';
import { buildAllowedDomains } from '../src/tools/websearch.js';
import { adminRouter } from '../src/routes/admin.js';

const tmpFile = () => {
  const f = join(mkdtempSync(join(tmpdir(), 'everrich-src-')), 'sources.json');
  copyFileSync(SOURCES_FILE, f);
  return { file: f };
};
const base = { id: 'src-test-new', type: 'faq', title: '測試來源', url: 'https://www.everrich-group.com/test', enabled: true, last_checked: '2026-10-14', note: '' };

test('正式 sources.json 通過驗證', () => {
  const r = loadSourcesFile();
  assert.equal(r.ok, true, JSON.stringify(r));
});

test('來源 schema 驗證：網址、網域、ID、日期、欄位', () => {
  const bad = (patch: object) => validateSources([{ ...base, ...patch }]).length > 0;
  assert.ok(!bad({}));
  for (const url of ['http://www.everrich-group.com/a', 'https://everrich-group.com.evil.example/a', 'https://u:p@www.everrich-group.com/a', 'https://www.everrich-group.com:8443/a', 'https://example.com/a', 'notaurl']) assert.ok(bad({ url }), url);
  assert.ok(bad({ id: 'Bad ID' }));
  assert.ok(bad({ type: 'other' }));
  assert.ok(bad({ last_checked: '2026-02-30' }));
  assert.ok(bad({ enabled: 'yes' }));
  assert.ok(bad({ extra: 1 }));
  assert.ok(validateSources([base, base]).some((e) => e.includes('重複')));
});

test('新增、編輯、停用、刪除，並且原子寫入', () => {
  const o = tmpFile();
  const before = loadSourcesFile(o);
  assert.ok(before.ok);
  const created = createSource(base, o);
  assert.ok(created.ok);
  assert.ok(!createSource(base, o).ok, '重複 ID 應被拒絕');
  const bad = updateSource('src-test-new', { url: 'https://evil.example/a' }, o);
  assert.equal(bad.ok, false);
  assert.ok(JSON.parse(readFileSync(o.file, 'utf8')).some((s: any) => s.id === 'src-test-new' && s.url === base.url), '驗證失敗時檔案不變');
  const off = updateSource('src-test-new', { enabled: false, note: '暫停', last_checked: '' }, o);
  assert.ok(off.ok && off.sources.find((s) => s.id === 'src-test-new')?.enabled === false && off.sources.find((s) => s.id === 'src-test-new')?.last_checked === null);
  assert.ok(updateSource('src-test-new', { id: 'hijack' }, o).ok);
  assert.ok(loadSourcesFile(o).ok && (loadSourcesFile(o) as any).sources.some((s: any) => s.id === 'src-test-new'), 'ID 不可被修改');
  assert.ok(deleteSource('src-test-new', { ...o, refs: () => 0 }).ok);
  assert.equal(deleteSource('src-test-new', o).ok, false);
});

test('被引用的來源不可刪除', () => {
  const o = tmpFile();
  assert.ok(sourceReferences('src-brand').total > 0);
  const r = deleteSource('src-brand', o);
  assert.equal(r.ok, false);
  assert.equal((r as any).error, 'SOURCE_IN_USE');
});

test('停用來源後 allowed_domains 立即移除該路徑', () => {
  const o = tmpFile();
  const src = (loadSourcesFile(o) as any).sources.find((s: any) => s.id === 'src-service-center');
  const entry = buildAllowedDomains([src])[0].domain_entry;
  const r = updateSource('src-service-center', { enabled: false }, o);
  assert.ok(r.ok);
  assert.ok(!buildAllowedDomains(r.ok ? r.sources : []).some((a) => a.domain_entry === entry));
});

test('對話紀錄遮罩手機號碼中間 4 碼與姓名第 2 字；可標註錯誤；統計零搜尋回答', () => {
  clearLogs();
  assert.equal(maskText('手機 0900-000-001，展示會員 A 你好'), '手機 0900-****-01，展*會員 A 你好');
  recordTurn('session-abcdef123', '0912345678 的預購單', 'SK-II 青春露免稅價 6,250 元', { tools: ['query_products'], grounded: true, ms: 1200 });
  recordTurn('session-2', '有折扣嗎', '折扣是 300 元', { tools: [], grounded: false, ms: 800 });
  recordTurn('session-3', '你好', '', null);
  const logs = listLogs();
  assert.equal(logs.length, 3);
  assert.ok(!JSON.stringify(logs).includes('0912345678') && !JSON.stringify(logs).includes('session-abcdef123'));
  const s = liveStats();
  assert.equal(s.price_turns, 2);
  assert.equal(s.zero_search_ratio, 50);
  assert.equal(s.errors, 1);
  const flagged = flagLog(logs[1].id, true, '未附來源');
  assert.ok(flagged?.flagged && liveStats().flagged === 1);
  clearLogs();
});

test('權重會改變推薦排序（自訂預算）；會員 A 預設第一名為美妝保養品牌週', () => {
  const a = previewRanking();
  assert.equal(a?.items[0].id, 'promo-beauty-week');
  const target = { manual: { amount: 12000, categories: ['美妝保養', '精品配件'] } };
  const saving = previewRanking({ saving: 0.8, fit: 0.1, ease: 0.1 }, target)!.items.map((x) => x.id);
  const ease = previewRanking({ saving: 0.1, fit: 0.1, ease: 0.8 }, target)!.items.map((x) => x.id);
  assert.notDeepEqual(saving, ease);
});

test('HTTP：區網裝置唯讀、本機可寫、ADMIN_TOKEN 可寫', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((r) => server.once('listening', r));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const lan = { 'Content-Type': 'application/json', 'X-Forwarded-For': '192.168.1.50' };
    assert.equal((await (await fetch(`${origin}/api/admin/access`, { headers: lan })).json()).data.can_write, false);
    assert.equal((await (await fetch(`${origin}/api/admin/access`)).json()).data.can_write, true);
    const denied = await fetch(`${origin}/api/admin/weights`, { method: 'POST', headers: lan, body: JSON.stringify({ saving: 0.5, fit: 0.3, ease: 0.2 }) });
    assert.equal(denied.status, 403);
    process.env.ADMIN_TOKEN = 'secret-token';
    const tokened = await fetch(`${origin}/api/admin/weights/preview`, { method: 'POST', headers: { ...lan, 'X-Admin-Token': 'secret-token' }, body: JSON.stringify({ weights: { saving: 0.5, fit: 0.3, ease: 0.2 } }) });
    assert.equal(tokened.status, 200);
    assert.equal((await (await fetch(`${origin}/api/admin/access`, { headers: { ...lan, 'X-Admin-Token': 'secret-token' } })).json()).data.can_write, true);
    delete process.env.ADMIN_TOKEN;
    const invalid = await fetch(`${origin}/api/admin/weights`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ saving: 0.5, fit: 0.5, ease: 0.5 }) });
    assert.equal(invalid.status, 400);
    for (const p of ['sources', 'prompts', 'weights', 'logs', 'stats', 'catalog/promos', 'catalog/products', 'catalog/bundles', 'kb', 'frontend', 'settings', 'scenarios', 'publish']) {
      const r = await fetch(`${origin}/api/admin/${p}`);
      assert.equal(r.status, 200, p);
      assert.equal(r.headers.get('cache-control'), 'no-store');
    }
    const prompts = (await (await fetch(`${origin}/api/admin/prompts`)).json()).data;
    assert.ok(prompts.fixed_rules.includes('固定規則') && prompts.store.versions.length >= 1);
  } finally {
    delete process.env.ADMIN_TOKEN;
    await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
  }
});
