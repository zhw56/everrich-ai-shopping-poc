import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';

// 第二個參數只供隔離資料測試；預設檢查本檔所在的 data/。
const directory = process.argv[2] ? resolve(process.argv[2]) : fileURLToPath(new URL('.', import.meta.url));
const read = (name) => JSON.parse(readFileSync(join(directory, name), 'utf8'));
const sources = read('sources.json');
const promos = read('promos.json');
const products = read('products.json');
const bundles = read('bundles.json');
const usersFile = read('users_mock.json');
const evaluation = read('eval.json');
const check = (condition, message) => assert.ok(condition, message);
const isText = (value) => typeof value === 'string' && value.trim().length > 0;
const isMoney = (value) => Number.isInteger(value) && value >= 0;
const isDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const isDateOrNull = (value) => value === null || isDate(value);
const CATEGORIES = ['美妝保養', '香水', '酒類', '精品配件', '食品伴手禮'];
const TIERS = ['初心者', '探索者', '創造者', '領航者'];
const OFFICIAL = ['everrich-group.com', 'customs.gov.tw'];
const PARTNER = ['taishinbank.com.tw'];
const under = (h, d) => h === d || h.endsWith('.' + d);
function unique(rows, label) {
  check(Array.isArray(rows) && rows.length > 0, `${label} 必須是非空陣列`);
  check(rows.every((row) => isText(row.id)), `${label} 缺少 ID`);
  check(new Set(rows.map((row) => row.id)).size === rows.length, `${label} ID 重複`);
  return new Map(rows.map((row) => [row.id, row]));
}
function officialUrl(value) {
  check(isText(value), '來源網址不可空白');
  const url = new URL(value);
  check(url.protocol === 'https:' && !url.username && !url.password && !url.port, '來源須為無帳密／非自訂連接埠的 HTTPS');
  const h = url.hostname.toLowerCase();
  check(OFFICIAL.some((d) => under(h, d)) || PARTNER.some((d) => under(h, d)), `非核准網域：${url.hostname}`);
  check(!url.pathname.includes('*'), '來源應為完整頁面路徑');
  return url;
}
const sourceMap = unique(sources, 'sources');
for (const row of sources) {
  assert.deepEqual(Object.keys(row).sort(), ['id', 'type', 'title', 'url', 'enabled', 'last_checked', 'note'].sort(), 'sources 欄位不符');
  check(['promo', 'product', 'faq'].includes(row.type), '來源 type 無效');
  check(typeof row.enabled === 'boolean' && isText(row.title) && isText(row.note), '來源標題／狀態／備註無效');
  check(isDateOrNull(row.last_checked), '來源檢查日期無效');
  const u = officialUrl(row.url);
  if (PARTNER.some((d) => under(u.hostname, d))) check(!row.enabled, '合作夥伴網域只供追溯，不可啟用為搜尋來源');
}
check(new Set(sources.map((s) => { const u = officialUrl(s.url); return u.hostname + u.pathname; })).size === sources.length, '來源頁面重複');
function provenance(row) {
  const source = sourceMap.get(row.source_id);
  check(source && row.source_url === source.url, `${row.id} 來源關聯或 URL 不一致`);
  check(row.verified === false, `${row.id} 未經人工核對不可 verified=true`);
  check(typeof row.mock === 'boolean', `${row.id} 缺少 mock`);
  check(isText(row.note), `${row.id} 缺少說明`);
  if (row.mock) check(Array.isArray(row.mock_fields) && row.mock_fields.length > 0, `${row.id} 缺少假設欄位`);
  for (const field of row.mock_fields ?? []) check(Object.hasOwn(row, field), `${row.id} 假設欄位不存在：${field}`);
  for (const field of row.unknown_fields ?? []) check(row[field] === null, `${row.id} 未知欄位應為 null：${field}`);
}

const promoMap = unique(promos, 'promos');
for (const row of promos) {
  provenance(row);
  check(['promo', 'faq'].includes(sourceMap.get(row.source_id).type), `${row.id} 須關聯 promo 或 faq 來源`);
  check(isText(row.name) && ['dutyfree', 'home', 'all'].includes(row.channel), `${row.id} 名稱／通路無效`);
  check(['rate', 'threshold', 'points', 'rebate'].includes(row.promo_type), `${row.id} 優惠類型無效`);
  if (['rate', 'rebate'].includes(row.promo_type)) check(typeof row.discount_rate === 'number' && row.discount_rate > 0 && row.discount_rate < 1, `${row.id} 折扣比例無效`);
  if (row.promo_type === 'threshold') check(isMoney(row.discount_amount) && row.discount_amount > 0, `${row.id} 滿額折金額無效`);
  if (row.promo_type === 'points') check(isMoney(row.points) && row.points > 0, `${row.id} 點數無效`);
  check(isMoney(row.min_spend) && (row.max_discount === null || isMoney(row.max_discount)), `${row.id} 門檻或上限無效`);
  check([...row.categories, ...row.exclude_categories].every((c) => CATEGORIES.includes(c)), `${row.id} 分類無效`);
  check(row.member_tiers.every((t) => TIERS.includes(t)), `${row.id} 會員等級無效`);
  check(['none', 'member', 'card', 'app'].includes(row.requirement), `${row.id} 使用條件無效`);
  check(isDateOrNull(row.valid_from) && isDateOrNull(row.valid_to), `${row.id} 日期無效`);
  if (row.valid_from && row.valid_to) check(row.valid_from <= row.valid_to, `${row.id} 開始日晚於截止日`);
  check(isText(row.label) && isText(row.condition_label), `${row.id} 優惠說明缺漏`);
}

const productMap = unique(products, 'products');
for (const row of products) {
  provenance(row);
  check(sourceMap.get(row.source_id).type === 'product', `${row.id} 須關聯 product 來源`);
  check(isText(row.name) && isText(row.brand) && CATEGORIES.includes(row.category), `${row.id} 名稱／品牌／分類無效`);
  check(isMoney(row.price) && (row.home_price === null || isMoney(row.home_price)), `${row.id} 價格無效`);
  assert.deepEqual(row.channels, row.home_price === null ? ['dutyfree'] : ['dutyfree', 'home'], `${row.id} 通路與宅配價不一致`);
  if (row.category === '酒類') check(isMoney(row.alcohol_ml) && row.alcohol_ml > 0 && row.home_price === null, `${row.id} 酒類需有容量且不在宅配網販售`);
  check(Array.isArray(row.tags) && row.tags.length > 0 && row.tags.every(isText), `${row.id} tags 無效`);
  check(row.price_kind === 'mock' && row.mock && row.mock_fields.includes('price'), `${row.id} 假價格標示不完整`);
}

unique(bundles, 'bundles');
check(new Set(bundles.map((b) => `${b.product_id}/${b.promo_id}/${b.channel}`)).size === bundles.length, '組合優惠價重複');
for (const row of bundles) {
  provenance(row);
  check(row.mock, '組合優惠價皆須為 mock');
  const product = productMap.get(row.product_id);
  const promo = promoMap.get(row.promo_id);
  check(product && promo, `${row.id} 有懸空商品／優惠關聯`);
  check(['dutyfree', 'home'].includes(row.channel) && product.channels.includes(row.channel), `${row.id} 通路無效`);
  check(promo.channel === 'all' || promo.channel === row.channel, `${row.id} 優惠通路不一致`);
  const list = row.channel === 'home' ? product.home_price : product.price;
  check(isMoney(row.bundle_price) && row.bundle_price <= list, `${row.id} 優惠價不可高於原價`);
  check(isDateOrNull(row.valid_from) && isDateOrNull(row.valid_to), `${row.id} 日期無效`);
  check(!Object.hasOwn(row, 'saving'), '省下金額應留給 engine 計算');
}

check(usersFile.mock && usersFile.verified === false && usersFile.schema_version === 2, '會員檔 metadata 無效');
check(usersFile.as_of === '2026-10-15' && usersFile.timezone === 'Asia/Taipei' && usersFile.currency === 'TWD', '展示基準日或單位無效');
const userMap = unique(usersFile.users, 'users');
check(usersFile.users.length === 3 && new Set(usersFile.users.map((u) => u.phone)).size === 3, '需 3 位不同展示會員');
const months = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];
for (const row of usersFile.users) {
  check(row.mock && row.verified === false && /^0900-000-00[123]$/.test(row.phone), '展示會員標示／手機號碼錯誤');
  check(TIERS.includes(row.member_tier) && isMoney(row.points) && isMoney(row.points_expiring) && row.points_expiring <= row.points, `${row.id} 會員等級或點數錯誤`);
  check(isDate(row.points_expire_date) && isDate(row.joined_date), `${row.id} 日期錯誤`);
  check(productMap.has(row.favorite_product_id), `${row.id} 常買商品關聯錯誤`);
  check(['dutyfree', 'home'].includes(row.preferred_channel), `${row.id} 偏好通路錯誤`);
  if (row.next_trip) check(isDate(row.next_trip.date) && isText(row.next_trip.airport) && isText(row.next_trip.flight), `${row.id} 航班資料錯誤`);
  assert.deepEqual(row.purchases.map((u) => u.month).sort(), months, `${row.id} 消費月份缺漏或重複`);
  for (const p of row.purchases) {
    check(isMoney(p.dutyfree_amount) && isMoney(p.home_amount) && Number.isInteger(p.trips), `${row.id}/${p.month} 消費金額錯誤`);
    const sum = Object.values(p.categories).reduce((s, v) => s + v, 0);
    check(sum === p.dutyfree_amount + p.home_amount, `${row.id}/${p.month} 分類加總不一致`);
    check(Object.keys(p.categories).every((c) => CATEGORIES.includes(c)), `${row.id}/${p.month} 分類無效`);
  }
  check(row.orders.length > 0 && new Set(row.orders.map((o) => o.order_no)).size === row.orders.length, `${row.id} 訂單缺漏或重複`);
  for (const o of row.orders) {
    check(o.mock && o.verified === false && ['dutyfree', 'home'].includes(o.channel) && isDate(o.created_date), `${o.order_no} 訂單標示錯誤`);
    check(o.items.every((i) => isText(i.code) && isText(i.name) && Number.isInteger(i.amount)), `${o.order_no} 訂單項目錯誤`);
    check(o.items.every((i) => !i.product_id || productMap.has(i.product_id)), `${o.order_no} 商品關聯錯誤`);
    check(o.items.reduce((s, i) => s + i.amount, 0) === o.total && isMoney(o.total), `${o.order_no} 訂單加總不一致`);
  }
}
const a = userMap.get('mock-user-a');
const b = userMap.get('mock-user-b');
const c = userMap.get('mock-user-c');
check(a && b && c, '缺少 A／B／C 展示會員');
check(a.member_tier === '創造者' && a.next_trip.date > '2026-10-31', 'S2：會員 A 應為創造者且出發日在週年慶結束後');
check(b.points_expiring > 0 && b.points_expire_date < b.next_trip.date, 'S3：會員 B 點數應在出發前到期');
check(c.next_trip.date <= '2026-10-31' && c.orders.some((o) => o.status === '待取貨' && o.items.some((i) => productMap.get(i.product_id)?.category === '酒類')), 'S6／S7：會員 C 應有近期出發與含酒類的待取貨預購單');

const tools = new Set(['verify_identity', 'get_user_profile', 'get_purchases', 'get_order', 'query_promos', 'recommend_promos', 'query_products', 'recommend_products', 'get_promo_price', 'search_kb', 'search_official_web', 'generate_comparison', 'handoff_to_human']);
unique(evaluation, 'eval');
check(evaluation.length === 30, '評測必須 30 題');
for (let i = 1; i <= 10; i++) check(evaluation.filter((v) => v.scenario === `S${i}`).length === 3, `S${i} 需 3 題`);
for (const row of evaluation) {
  check(row.mock && row.verified === false && row.as_of === usersFile.as_of, '評測 metadata 無效');
  check(isText(row.question) && Array.isArray(row.expected_answer_points) && row.expected_answer_points.length > 0 && row.expected_answer_points.every(isText), '評測問句／要點缺漏');
  check(Array.isArray(row.expected_tools) && row.expected_tools.every((v) => tools.has(v)) && row.expected_tools.length <= 6, `${row.id} 評測工具名稱／數量錯誤`);
  check(row.forbidden_tools.every((v) => v === '*' || tools.has(v)), '禁用工具名稱錯誤');
  check(!row.expected_tools.some((v) => row.forbidden_tools.includes(v)), '評測工具期望互相矛盾');
  check(row.max_tool_calls === 6 && row.max_agents === 3, '評測限制被改動');
  check(typeof row.initial_session.verified === 'boolean', '評測 session 無效');
  if (row.initial_session.verified) check(userMap.has(row.initial_session.user_id), '已驗證評測缺少展示會員');
  else check(row.initial_session.user_id === null && !row.expected_tools.some((v) => ['get_user_profile', 'get_purchases', 'get_order'].includes(v)), '未驗證評測不得預期會員資料工具');
  if (row.forbidden_tools.includes('*')) check(row.expected_tools.length === 0, '全禁用工具的預期應為空');
}
const kb = readFileSync(join(directory, 'kb.md'), 'utf8');
const entries = kb.split(/^## /m).slice(1);
check(entries.length >= 3, '知識庫內容不足');
for (const entry of entries) {
  const id = entry.match(/^- source_id: (.+)$/m)?.[1];
  const url = entry.match(/^- source_url: (.+)$/m)?.[1];
  check(sourceMap.get(id)?.url === url, 'KB 來源關聯錯誤');
  check(entry.includes('- verified: false') && /^- mock: (true|false)$/m.test(entry), 'KB 可信度標示錯誤');
  check(isDate(entry.match(/^- last_checked: (.+)$/m)?.[1]), 'KB 檢查日缺漏');
}
check(kb.includes('預購') && kb.includes('1.5 公升') && kb.includes('提貨'), 'KB 核心主題缺漏');
console.log(JSON.stringify({ ok: true, sources: sources.length, enabled_sources: sources.filter((s) => s.enabled).length, promos: promos.length, products: products.length, bundles: bundles.length, users: usersFile.users.length, orders: usersFile.users.reduce((s, u) => s + u.orders.length, 0), kb_entries: entries.length, evaluation_cases: evaluation.length }, null, 2));
console.log('資料一致性檢查通過；未執行 Claude API、工具層測試或模型評測。人工核對仍待進行。');
