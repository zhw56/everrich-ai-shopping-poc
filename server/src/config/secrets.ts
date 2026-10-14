import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { DATA_DIR } from '../data.js';
import { toJson, writeAtomic } from '../util/atomic.js';

/**
 * 後台輸入的機密（Anthropic API 金鑰、GitHub token）以 ADMIN_TOKEN 加密後存成 data/secrets.enc.json。
 * 加密檔可以隨「發布」寫回 GitHub，重新部署後用同一組 ADMIN_TOKEN 解開；明文不落地、不回傳給前端。
 * ADMIN_TOKEN 本身必須放在部署平台的環境變數（它是解鎖其他設定的鑰匙）。
 */
export type SecretKey = 'anthropic_api_key' | 'inception_api_key' | 'github_token';
export const SECRET_KEYS: SecretKey[] = ['anthropic_api_key', 'inception_api_key', 'github_token'];
const SECRET_LABEL: Record<SecretKey, string> = { anthropic_api_key: 'API 金鑰', inception_api_key: 'Inception 金鑰', github_token: 'GitHub token' };
export const SECRETS_FILE = DATA_DIR + 'secrets.enc.json';
type Secrets = Partial<Record<SecretKey, string>>;
type Envelope = { version: 1; kdf: 'scrypt'; salt: string; iv: string; tag: string; data: string };

const adminToken = () => process.env.ADMIN_TOKEN ?? '';
const keyCache = new Map<string, Buffer>();
function deriveKey(token: string, salt: Buffer): Buffer {
  const id = token + ':' + salt.toString('base64');
  let k = keyCache.get(id);
  if (!k) {
    k = scryptSync(token, salt, 32, { N: 16384, r: 8, p: 1 });
    keyCache.clear();
    keyCache.set(id, k);
  }
  return k;
}

export function encryptSecrets(secrets: Secrets, token: string): Envelope {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(token, salt), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(secrets), 'utf8'), cipher.final()]);
  return { version: 1, kdf: 'scrypt', salt: salt.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') };
}

export function decryptSecrets(env: Envelope, token: string): Secrets {
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(token, Buffer.from(env.salt, 'base64')), Buffer.from(env.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(env.tag, 'base64'));
  const text = Buffer.concat([decipher.update(Buffer.from(env.data, 'base64')), decipher.final()]).toString('utf8');
  return JSON.parse(text);
}

let cache: { mtime: number; token: string; value: Secrets; locked: boolean } | null = null;

/** 讀取並解密（依檔案修改時間快取）；沒有 ADMIN_TOKEN 或解不開時回空物件 */
function read(file = SECRETS_FILE): { value: Secrets; locked: boolean; exists: boolean } {
  if (!existsSync(file)) return { value: {}, locked: false, exists: false };
  const token = adminToken();
  if (!token) return { value: {}, locked: true, exists: true };
  const mtime = statSync(file).mtimeMs;
  if (cache && cache.mtime === mtime && cache.token === token) return { value: cache.value, locked: cache.locked, exists: true };
  let value: Secrets = {};
  let locked = false;
  try {
    value = decryptSecrets(JSON.parse(readFileSync(file, 'utf8')), token);
  } catch {
    locked = true;
  }
  cache = { mtime, token, value, locked };
  return { value, locked, exists: true };
}

export function getSecret(key: SecretKey, file = SECRETS_FILE): string {
  return read(file).value[key] ?? '';
}

export const maskSecret = (v: string) => (v ? `${v.slice(0, 7)}…${v.slice(-4)}` : null);

export function secretsStatus(file = SECRETS_FILE) {
  const r = read(file);
  return {
    can_store: !!adminToken(),
    file_exists: r.exists,
    locked: r.locked,
    masked: Object.fromEntries(SECRET_KEYS.map((k) => [k, maskSecret(r.value[k] ?? '')])) as Record<SecretKey, string | null>,
  };
}

/** 寫入或清除（傳空字串代表清除）；需要 ADMIN_TOKEN 才能加密 */
export function saveSecrets(patch: Record<string, unknown>, file = SECRETS_FILE): { ok: true } | { ok: false; error: string; errors: string[] } {
  const token = adminToken();
  if (!token) return { ok: false, error: 'NO_ADMIN_TOKEN', errors: ['伺服器沒有設定 ADMIN_TOKEN，無法加密保存金鑰。本機開發請把金鑰寫在 .env。'] };
  const r = read(file);
  if (r.locked && r.exists) return { ok: false, error: 'LOCKED', errors: ['現有的加密檔無法用目前的 ADMIN_TOKEN 解開（可能換過密碼）。請先清除全部金鑰再重新輸入。'] };
  const next: Secrets = { ...r.value };
  const errors: string[] = [];
  for (const k of SECRET_KEYS) {
    if (!Object.hasOwn(patch, k)) continue;
    const v = String(patch[k] ?? '').trim();
    if (!v) delete next[k];
    else if (v.length > 300 || /\s/.test(v)) errors.push(`${SECRET_LABEL[k]}格式不正確`);
    else if (k === 'anthropic_api_key' && !v.startsWith('sk-ant-')) errors.push('Anthropic API 金鑰應以 sk-ant- 開頭');
    else next[k] = v;
  }
  if (errors.length) return { ok: false, error: 'INVALID_SECRET', errors };
  writeAtomic(file, toJson(encryptSecrets(next, token)));
  cache = null;
  return { ok: true };
}

/** 加密檔解不開時（換過 ADMIN_TOKEN）用來重設 */
export function resetSecrets(file = SECRETS_FILE) {
  const token = adminToken();
  if (!token) return { ok: false as const, error: 'NO_ADMIN_TOKEN', errors: ['伺服器沒有設定 ADMIN_TOKEN'] };
  writeAtomic(file, toJson(encryptSecrets({}, token)));
  cache = null;
  return { ok: true as const };
}
