import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { DATA_DIR } from '../data.js';
import { toJson, writeAtomic } from '../util/atomic.js';
import type { Profile } from './schema.js';

/**
 * 畫像存放：記憶體＋ data/runtime/profiles.json（已列入 .gitignore，不進 GitHub、不列入後台發布）。
 * 示範畫像 data/profiles_demo.json 在啟動時載入並標示 demo，讓後台展示時不空白。
 */
const RUNTIME_DIR = DATA_DIR + 'runtime/';
export const PROFILES_FILE = RUNTIME_DIR + 'profiles.json';
const DEMO_FILE = DATA_DIR + 'profiles_demo.json';
const MAX_PROFILES = 2000;

const profiles = new Map<string, Profile>();
let loaded = false;
let timer: NodeJS.Timeout | null = null;

function load() {
  if (loaded) return;
  loaded = true;
  for (const file of [DEMO_FILE, PROFILES_FILE]) {
    try {
      if (!existsSync(file)) continue;
      const list = JSON.parse(readFileSync(file, 'utf8')) as Profile[];
      for (const p of list) profiles.set(p.session_id, { ...p, demo: file === DEMO_FILE ? true : !!p.demo });
    } catch (e) {
      console.warn('畫像檔讀取失敗：', file, (e as Error).message);
    }
  }
}

function persistSoon() {
  if (process.env.PROFILE_PERSIST === '0') return;
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    try {
      mkdirSync(RUNTIME_DIR, { recursive: true });
      writeAtomic(PROFILES_FILE, toJson([...profiles.values()].filter((p) => !p.demo)));
    } catch (e) {
      console.warn('畫像寫檔失敗：', (e as Error).message);
    }
  }, 500);
  timer.unref?.();
}

export function newProfile(sessionId: string): Profile {
  const now = new Date().toISOString();
  return {
    id: 'cp-' + sessionId.slice(0, 10),
    session_id: sessionId,
    user_id: null,
    demo: false,
    created_at: now,
    updated_at: now,
    turns: 0,
    attributes: {},
    intent_stage: '瀏覽',
    sentiment: '中性',
    topics: [],
    marketing_consent: null,
    offers_shown: [],
    first_question: '',
  };
}

export function getProfile(sessionId: string): Profile | undefined {
  load();
  return profiles.get(sessionId);
}

export function ensureProfile(sessionId: string): Profile {
  load();
  let p = profiles.get(sessionId);
  if (!p) {
    p = newProfile(sessionId);
    profiles.set(sessionId, p);
    if (profiles.size > MAX_PROFILES) {
      const oldest = [...profiles.values()].filter((x) => !x.demo).sort((a, b) => a.updated_at.localeCompare(b.updated_at))[0];
      if (oldest) profiles.delete(oldest.session_id);
    }
  }
  return p;
}

export function saveProfile(p: Profile) {
  p.updated_at = new Date().toISOString();
  profiles.set(p.session_id, p);
  persistSoon();
}

export function listProfiles(): Profile[] {
  load();
  return [...profiles.values()].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export function findProfile(id: string): Profile | undefined {
  load();
  return [...profiles.values()].find((p) => p.id === id);
}

export function deleteProfile(id: string): boolean {
  const p = findProfile(id);
  if (!p) return false;
  profiles.delete(p.session_id);
  persistSoon();
  return true;
}

/** 測試用 */
export function _resetProfiles() {
  profiles.clear();
  loaded = true;
}
