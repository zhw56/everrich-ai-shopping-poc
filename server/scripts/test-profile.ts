/** T15 單元測試：畫像合併規則、客群、NBA 接觸政策、行銷名單同意過濾、展示資料聲明過濾。不呼叫模型。 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { audience } from '../src/admin/profiles.js';
import { disclaimerFilter, pricedWithoutSource } from '../src/orchestrator/guard.js';
import { applyPatches } from '../src/profile/merge.js';
import { defaultNba, pickForConversation, validateNba } from '../src/profile/nba.js';
import { segmentsOf } from '../src/profile/segments.js';
import { _resetProfiles, ensureProfile, newProfile, saveProfile } from '../src/profile/store.js';

process.env.PROFILE_PERSIST = '0';
const P = (id = 's-' + Math.random().toString(36).slice(2)) => newProfile(id);

test('客戶說的必須在原句找得到證據，否則降為 AI 推測', () => {
  const p = P();
  applyPatches(p, [{ key: 'customer_type', value: '學生', source: 'stated', confidence: 1, evidence: '我是學生' }], '我是學生預算不多');
  assert.equal(p.attributes.customer_type.source, 'stated');
  applyPatches(p, [{ key: 'budget_item', value: 3000, source: 'stated', confidence: 1, evidence: '三千以內' }], '便宜就好');
  assert.equal(p.attributes.budget_item.source, 'inferred');
  assert.equal(p.attributes.budget_item.evidence, '');
});

test('推測不能覆蓋客戶說的；系統欄位只能由會員資料寫入；敏感資訊不收', () => {
  const p = P();
  applyPatches(p, [{ key: 'budget_total', value: 10000, source: 'stated', evidence: '一萬' }], '預算一萬');
  applyPatches(p, [{ key: 'budget_total', value: 20000, source: 'inferred', confidence: 0.9 }], '好');
  assert.equal(p.attributes.budget_total.value, 10000);
  applyPatches(p, [{ key: 'member_tier', value: '領航者', source: 'stated', evidence: '領航者' }], '我是領航者');
  assert.equal(p.attributes.member_tier, undefined);
  applyPatches(p, [{ key: 'pain_points', value: ['最近在看憂鬱症'], source: 'stated', evidence: '憂鬱症' }], '最近在看憂鬱症');
  assert.equal(p.attributes.pain_points, undefined);
  applyPatches(p, [{ key: 'pain_points', value: ['提貨要帶護照很麻煩'], source: 'stated', evidence: '要帶護照' }], '提貨要帶護照很麻煩');
  assert.deepEqual(p.attributes['pain_points' as string]?.value, ['提貨要帶護照很麻煩'], '一般購物情境提到護照不算敏感資訊');
});

test('清單欄位累積；排斥品牌自動從偏好移除；客戶否定時可移除', () => {
  const p = P();
  applyPatches(p, [{ key: 'brand_preference', value: ['CHANEL', 'Dior'], source: 'inferred', confidence: 0.6 }], '都可以');
  applyPatches(p, [{ key: 'brand_avoid', value: ['CHANEL'], source: 'stated', evidence: '不喜歡香奈兒' }], '我不喜歡香奈兒');
  assert.deepEqual(p.attributes.brand_preference.value, ['Dior']);
  applyPatches(p, [{ key: 'gift_for', value: ['媽媽'], source: 'stated', evidence: '送媽媽' }], '想送媽媽');
  applyPatches(p, [{ key: 'gift_for', value: ['同事'], source: 'stated', evidence: '同事' }], '還有同事');
  assert.deepEqual(p.attributes.gift_for.value, ['媽媽', '同事']);
  applyPatches(p, [{ key: 'gift_for', op: 'remove', value: ['同事'], source: 'stated', evidence: '同事不用了' }], '同事不用了');
  assert.deepEqual(p.attributes.gift_for.value, ['媽媽']);
  applyPatches(p, [{ key: 'gift_for', op: 'remove', value: ['媽媽'], source: 'stated', evidence: '亂講的' }], '沒這回事');
  assert.deepEqual(p.attributes.gift_for.value, ['媽媽'], '沒有原句佐證不能移除');
});

test('客群：空畫像不屬於任何客群；依屬性與會員資料計算', () => {
  assert.deepEqual(segmentsOf(P()), []);
  const p = P();
  applyPatches(p, [{ key: 'gift_for', value: ['長輩'], source: 'stated', evidence: '長輩' }, { key: 'category_interest', value: ['食品伴手禮'], source: 'stated', evidence: '伴手禮' }, { key: 'budget_item', value: 1500, source: 'stated', evidence: '1500' }], '送長輩的伴手禮 1500 以內');
  assert.deepEqual(segmentsOf(p).sort(), ['gift_shopper', 'price_sensitive', 'souvenir']);
  p.attributes.next_trip = { value: '2026-10-23', source: 'system', confidence: 1, evidence: '', at: '' };
  assert.ok(segmentsOf(p).includes('trip_soon'));
  p.attributes.points_expire = { value: '2026-10-31', source: 'system', confidence: 1, evidence: '', at: '' };
  assert.ok(segmentsOf(p).includes('points_expiring'));
  p.attributes.next_trip = { value: '2026-12-20', source: 'system', confidence: 1, evidence: '', at: '' };
  assert.ok(segmentsOf(p).includes('trip_far') && !segmentsOf(p).includes('trip_soon'));
});

test('NBA 接觸政策：上限、間隔、不滿意時只做服務關懷', () => {
  const c = defaultNba();
  assert.deepEqual(validateNba(c), []);
  const p = P();
  p.attributes.is_member = { value: false, source: 'stated', confidence: 1, evidence: '', at: '' };
  assert.equal(pickForConversation(p, 1, c)?.id, 'join-member');
  p.offers_shown.push({ rule_id: 'join-member', turn: 1, at: '' });
  p.attributes.category_interest = { value: ['美妝保養'], source: 'stated', confidence: 1, evidence: '', at: '' };
  assert.equal(pickForConversation(p, 2, c), null, '間隔不足 2 輪');
  assert.equal(pickForConversation(p, 3, c)?.id, 'beauty-week');
  p.offers_shown.push({ rule_id: 'beauty-week', turn: 3, at: '' });
  p.attributes.budget_total = { value: 40000, source: 'stated', confidence: 1, evidence: '', at: '' };
  assert.equal(pickForConversation(p, 9, c), null, '每段對話最多 2 次');
  const q = P();
  q.attributes.is_member = { value: false, source: 'stated', confidence: 1, evidence: '', at: '' };
  q.sentiment = '負向';
  assert.equal(pickForConversation(q, 1, c)?.type, 'service');
  q.offers_shown.push({ rule_id: 'care-unhappy', turn: 1, at: '' });
  assert.equal(pickForConversation(q, 5, c), null, '不滿意時暫停推銷');
  const r = P();
  r.attributes.category_interest = { value: ['酒類'], source: 'stated', confidence: 1, evidence: '', at: '' };
  assert.equal(pickForConversation(r, 1, c)?.id, 'liquor-allowance', '買酒先提醒入境額度（服務關懷優先）');
});

test('行銷名單只列同意者，並回報排除人數', () => {
  _resetProfiles();
  const mk = (id: string, consent: boolean | null) => {
    const p = ensureProfile(id);
    p.attributes.gift_for = { value: ['媽媽'], source: 'stated', confidence: 1, evidence: '', at: '' };
    p.marketing_consent = consent;
    saveProfile(p);
  };
  mk('aud-yes-0001', true);
  mk('aud-no-00001', false);
  mk('aud-null-001', null);
  const r = audience({ all: ['gift_shopper'] });
  assert.equal(r.matched, 3);
  assert.equal(r.excluded_no_consent, 2);
  assert.deepEqual(r.rows.map((x) => x.id), ['cp-aud-yes-00']);
});

test('展示資料聲明說過後，串流中的重複聲明會被濾掉；一般「以上」不受影響', () => {
  const run = (active: boolean, chunks: string[]) => { const f = disclaimerFilter(active); return chunks.map((c) => f.push(c)).join('') + f.flush(); };
  const chunks = ['以上三款', '都很適合送禮。\n\n', '以上含展', '示資料，實際價格與活動以昇恆昌公告為準。'];
  assert.equal(run(true, chunks), '以上三款都很適合送禮。\n\n');
  assert.equal(run(false, chunks), chunks.join(''));
  assert.equal(run(true, ['免稅價 5,880 元', '（以上含展示資料）']), '免稅價 5,880 元');
});

test('金額都是前面講過的，不再補「查不到來源」提醒', () => {
  assert.equal(pricedWithoutSource('蘭蔻免稅價 5,880 元', 0, '…免稅價 5,880 元…'), false);
  assert.equal(pricedWithoutSource('最新折扣是 300 元。', 0, '免稅價 5,880 元'), true);
  assert.equal(pricedWithoutSource('最新折扣是 300 元。', 1), false);
});
