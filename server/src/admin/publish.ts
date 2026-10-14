import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadSettings } from '../config/settings.js';
import { getSecret } from '../config/secrets.js';

/**
 * T13：把後台改過的資料檔提交回 GitHub（Render 偵測到新提交會自動重新部署，資料因此保留）。
 * 以「本次服務啟動時」的檔案內容為基準判斷哪些檔案變了；提交前比對遠端同檔，遠端已被別人改過就拒絕覆蓋。
 */
export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const PUBLISHED_FILES = [
  { path: 'data/promos.json', label: '優惠活動' },
  { path: 'data/products.json', label: '商品' },
  { path: 'data/bundles.json', label: '組合優惠價' },
  { path: 'data/kb.md', label: '知識庫' },
  { path: 'data/sources.json', label: '搜尋來源' },
  { path: 'data/prompts.json', label: 'Prompt' },
  { path: 'data/scenarios.json', label: '情境設定' },
  { path: 'data/frontend.json', label: '前台設定' },
  { path: 'data/settings.json', label: '系統參數' },
  { path: 'data/secrets.enc.json', label: '金鑰（加密）' },
  { path: 'data/nba.json', label: 'NBA 規則' },
  { path: 'server/src/engine/weights.json', label: '推薦權重' },
];

const read = (p: string): string | null => (existsSync(REPO_ROOT + p) ? readFileSync(REPO_ROOT + p, 'utf8') : null);
let baseline = new Map(PUBLISHED_FILES.map((f) => [f.path, read(f.path)]));

/** 測試用：重新以目前檔案內容當基準 */
export function resetBaseline() {
  baseline = new Map(PUBLISHED_FILES.map((f) => [f.path, read(f.path)]));
}

export function changedFiles() {
  return PUBLISHED_FILES.filter((f) => read(f.path) !== baseline.get(f.path)).map((f) => ({ ...f, created: baseline.get(f.path) === null }));
}

export const gitBlobSha = (text: string) => createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex');

export function publishConfig() {
  const s = loadSettings();
  const token = getSecret('github_token') || process.env.GITHUB_TOKEN || '';
  const repo = s.github_repo || process.env.GITHUB_REPO || '';
  const branch = s.github_branch || process.env.GITHUB_BRANCH || 'main';
  return { configured: !!token && /^[\w.-]+\/[\w.-]+$/.test(repo), repo, branch, token };
}

export function publishStatus() {
  const { configured, repo, branch } = publishConfig();
  return { configured, repo: repo || null, branch, changed: changedFiles() };
}

type Fetch = typeof fetch;
export type PublishResult = { ok: true; commit: string; url: string | null; files: string[] } | { ok: false; error: string; errors: string[] };

export async function publish(message: string, opts: { force?: boolean; fetchImpl?: Fetch } = {}): Promise<PublishResult> {
  const cfg = publishConfig();
  if (!cfg.configured) return { ok: false, error: 'NOT_CONFIGURED', errors: ['尚未設定 GitHub repo 與 token，請到「系統參數」填寫'] };
  const changed = changedFiles();
  if (!changed.length) return { ok: false, error: 'NOTHING_TO_PUBLISH', errors: ['沒有需要發布的變更'] };
  const f = opts.fetchImpl ?? fetch;
  const gh = async (method: string, path: string, body?: unknown) => {
    const r = await f(`https://api.github.com/repos/${cfg.repo}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'everrich-ai-shopping-poc-admin',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const j: any = await r.json().catch(() => null);
    if (!r.ok) throw new Error(`GitHub ${r.status}：${j?.message ?? '請求失敗'}`);
    return j;
  };
  try {
    const ref = await gh('GET', `/git/ref/heads/${encodeURIComponent(cfg.branch)}`);
    const head: string = ref.object.sha;
    const commit = await gh('GET', `/git/commits/${head}`);
    const tree = await gh('GET', `/git/trees/${commit.tree.sha}?recursive=1`);
    const remote = new Map<string, string>((tree.tree ?? []).filter((t: any) => t.type === 'blob').map((t: any) => [t.path, t.sha]));

    const toCommit: { path: string; content: string }[] = [];
    const conflicts: string[] = [];
    for (const c of changed) {
      const content = read(c.path) ?? '';
      const remoteSha = remote.get(c.path);
      if (remoteSha === gitBlobSha(content)) continue; // 遠端已經是同樣內容
      const base = baseline.get(c.path) ?? null;
      const expected = base === null ? undefined : gitBlobSha(base);
      if (remoteSha !== expected) conflicts.push(c.label);
      toCommit.push({ path: c.path, content });
    }
    if (conflicts.length && !opts.force) {
      return { ok: false, error: 'CONFLICT', errors: [`GitHub 上的「${conflicts.join('、')}」在這次部署後被改過。請先重新部署取得最新版，或確認後強制覆蓋。`] };
    }
    if (toCommit.length) {
      const newTree = await gh('POST', '/git/trees', { base_tree: commit.tree.sha, tree: toCommit.map((t) => ({ path: t.path, mode: '100644', type: 'blob', content: t.content })) });
      const newCommit = await gh('POST', '/git/commits', { message: message.trim() || '後台發布資料更新', tree: newTree.sha, parents: [head] });
      await gh('PATCH', `/git/refs/heads/${encodeURIComponent(cfg.branch)}`, { sha: newCommit.sha });
      for (const c of changed) baseline.set(c.path, read(c.path));
      return { ok: true, commit: newCommit.sha, url: newCommit.html_url ?? null, files: changed.map((c) => c.label) };
    }
    for (const c of changed) baseline.set(c.path, read(c.path));
    return { ok: true, commit: head, url: null, files: [] };
  } catch (e) {
    return { ok: false, error: 'GITHUB_ERROR', errors: [(e as Error).message] };
  }
}
