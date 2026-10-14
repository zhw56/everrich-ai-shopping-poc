import { actionsFor, loadNba } from '../profile/nba.js';
import { ATTR_MAP, displayValue, type Profile } from '../profile/schema.js';
import { SEGMENTS, SEGMENT_LABEL, segmentsOf } from '../profile/segments.js';
import { listProfiles } from '../profile/store.js';

/** T15 後台：客戶畫像、分眾統計與行銷名單（名單只含同意行銷者） */
const seg = (ids: string[]) => ids.map((id) => ({ id, label: SEGMENT_LABEL.get(id) ?? id }));

export function profileSummary(p: Profile) {
  const nba = loadNba();
  const segs = segmentsOf(p);
  const top = actionsFor(p, nba)[0];
  return {
    id: p.id, demo: p.demo, user_id: p.user_id, updated_at: p.updated_at, turns: p.turns, first_question: p.first_question,
    intent_stage: p.intent_stage, sentiment: p.sentiment, segments: seg(segs), attr_count: Object.keys(p.attributes).length,
    top_action: top ? { id: top.id, title: top.title, type: top.type } : null, marketing_consent: p.marketing_consent,
  };
}

export function profileDetail(p: Profile) {
  return {
    ...profileSummary(p),
    topics: p.topics,
    attributes: Object.entries(p.attributes).map(([key, a]) => ({ key, label: ATTR_MAP.get(key)?.label ?? key, value: displayValue(a.value), source: a.source, confidence: a.confidence, evidence: a.evidence, at: a.at })),
    actions: actionsFor(p).map((a) => ({ id: a.id, title: a.title, type: a.type, say: a.say, reason: a.reason, score: a.score })),
    offers_shown: p.offers_shown,
  };
}

export function segmentStats() {
  const list = listProfiles();
  const counts = (fn: (p: Profile) => string | string[] | undefined) => {
    const m = new Map<string, number>();
    for (const p of list) for (const k of ([] as string[]).concat(fn(p) ?? [])) m.set(k, (m.get(k) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  };
  const val = (k: string) => (p: Profile) => {
    const v = p.attributes[k]?.value;
    return v === undefined ? undefined : Array.isArray(v) ? v : [displayValue(v)];
  };
  return {
    total: list.length,
    demo: list.filter((p) => p.demo).length,
    consented: list.filter((p) => p.marketing_consent === true).length,
    segments: SEGMENTS.map((s) => {
      const hit = list.filter((p) => s.test(p));
      return { id: s.id, label: s.label, desc: s.desc, count: hit.length, consented: hit.filter((p) => p.marketing_consent === true).length };
    }),
    stages: counts((p) => p.intent_stage),
    sentiments: counts((p) => p.sentiment),
    top_actions: counts((p) => actionsFor(p)[0]?.title),
    distributions: {
      customer_type: counts(val('customer_type')),
      category_interest: counts(val('category_interest')),
      gift_for: counts(val('gift_for')),
      brand_preference: counts(val('brand_preference')),
      brand_avoid: counts(val('brand_avoid')),
      pain_points: counts(val('pain_points')),
    },
  };
}

export type AudienceQuery = { all?: string[]; none?: string[]; stages?: string[]; include_demo?: boolean };

/** 名單：只列同意行銷者；同時回報有多少人因未同意而排除（個資法第 19、20 條） */
export function audience(q: AudienceQuery) {
  const all = (q.all ?? []).filter((s) => SEGMENT_LABEL.has(s));
  const none = (q.none ?? []).filter((s) => SEGMENT_LABEL.has(s));
  const stages = q.stages ?? [];
  const matched = listProfiles().filter((p) => {
    if (q.include_demo === false && p.demo) return false;
    const segs = new Set(segmentsOf(p));
    return all.every((s) => segs.has(s)) && !none.some((s) => segs.has(s)) && (!stages.length || stages.includes(p.intent_stage));
  });
  const ok = matched.filter((p) => p.marketing_consent === true);
  return {
    matched: matched.length,
    excluded_no_consent: matched.length - ok.length,
    rows: ok.map((p) => {
      const top = actionsFor(p)[0];
      return { id: p.id, user_id: p.user_id, demo: p.demo, segments: segmentsOf(p).map((s) => SEGMENT_LABEL.get(s)), intent_stage: p.intent_stage, top_action: top?.title ?? null, say: top?.say ?? null, updated_at: p.updated_at };
    }),
  };
}
