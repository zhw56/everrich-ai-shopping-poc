import { ATTR_MAP, SENSITIVE, SYSTEM_ONLY, validValue, type AttrSource, type Profile } from './schema.js';

export type AttrPatch = { key: string; value?: unknown; source: AttrSource; confidence?: number; evidence?: string; op?: 'set' | 'remove' };

const RANK: Record<AttrSource, number> = { system: 3, stated: 2, inferred: 1 };

/**
 * 合併規則：
 * - 只接受白名單欄位；系統欄位只能由會員資料寫入。
 * - 「客戶說的」必須在客戶原句找得到證據，否則降為「AI 推測」。
 * - 推測不能覆蓋客戶說的或會員資料；同等級以新的為準。
 * - 值或證據含敏感資訊一律丟棄。
 */
export function applyPatches(p: Profile, patches: AttrPatch[], userText: string): string[] {
  const changed: string[] = [];
  const now = new Date().toISOString();
  for (const x of patches) {
    const def = ATTR_MAP.get(x.key);
    if (!def) continue;
    if (SYSTEM_ONLY.has(x.key) && x.source !== 'system') continue;
    if (x.op === 'remove') {
      // 移除只接受客戶原句佐證，且不動會員資料
      const prev = p.attributes[x.key];
      const ev = String(x.evidence ?? '').trim();
      if (!prev || prev.source === 'system' || !ev || !userText.includes(ev)) continue;
      const drop = Array.isArray(x.value) ? (x.value as unknown[]).map(String) : x.value == null ? [] : [String(x.value)];
      if (def.type === 'list' && Array.isArray(prev.value) && drop.length) {
        const left = (prev.value as string[]).filter((v) => !drop.includes(v));
        if (left.length === prev.value.length) continue;
        if (left.length) p.attributes[x.key] = { ...prev, value: left, at: now };
        else delete p.attributes[x.key];
      } else delete p.attributes[x.key];
      changed.push(x.key);
      continue;
    }
    const value = validValue(def, x.value);
    if (value === null) continue;
    let evidence = String(x.evidence ?? '').trim().slice(0, 80);
    if (SENSITIVE.test(evidence) || SENSITIVE.test(JSON.stringify(value))) continue;
    let source: AttrSource = x.source === 'system' ? 'system' : x.source === 'stated' ? 'stated' : 'inferred';
    if (source === 'stated' && (!evidence || !userText.includes(evidence))) source = 'inferred';
    if (source !== 'system' && evidence && !userText.includes(evidence)) evidence = '';
    const confidence = source === 'system' ? 1 : Math.max(0.1, Math.min(1, Number(x.confidence ?? (source === 'stated' ? 0.9 : 0.6))));
    const prev = p.attributes[x.key];
    if (prev && RANK[prev.source] > RANK[source]) continue;
    if (prev && JSON.stringify(prev.value) === JSON.stringify(value) && prev.source === source) continue;
    // 清單類欄位累積（同等級以上才合併）
    const merged = def.type === 'list' && prev && Array.isArray(prev.value) && RANK[prev.source] <= RANK[source] ? [...new Set([...(prev.value as string[]), ...(value as string[])])].slice(0, 8) : value;
    p.attributes[x.key] = { value: merged, source, confidence, evidence, at: now };
    changed.push(x.key);
  }
  // 排斥的品牌不應同時出現在偏好裡
  const avoid = p.attributes.brand_avoid?.value as string[] | undefined;
  const pref = p.attributes.brand_preference;
  if (avoid && pref && Array.isArray(pref.value)) {
    const left = (pref.value as string[]).filter((b) => !avoid.includes(b));
    if (left.length) pref.value = left;
    else delete p.attributes.brand_preference;
  }
  return changed;
}
