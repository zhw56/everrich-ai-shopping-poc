import { asOfDate, isListed, loadPromos, normalizeCategory } from '../data.js';
import { isExpired, summarizePromo } from '../engine/index.js';
import type { Tool } from '../types.js';
import { MOCK_NOTICE, sourcesFrom } from './_common.js';

type Input = {
  channel?: 'dutyfree' | 'home';
  category?: string;
  promo_type?: 'rate' | 'threshold' | 'points' | 'rebate';
  member_tier?: string;
  active_on?: string;
};

export const queryPromos: Tool<Input> = {
  definition: {
    name: 'query_promos',
    description:
      '依條件篩選昇恆昌目前的優惠活動，例如通路（免稅店 dutyfree／宅配網 home）、商品分類、優惠類型、會員等級、指定日期是否仍有效。回傳活動清單、條件與官網來源。',
    input_schema: {
      type: 'object',
      properties: {
        channel: { type: 'string', enum: ['dutyfree', 'home'], description: 'dutyfree 為機場與市區免稅店（含免稅購物網預購），home 為宅配網' },
        category: { type: 'string', enum: ['美妝保養', '香水', '酒類', '精品配件', '食品伴手禮'] },
        promo_type: { type: 'string', enum: ['rate', 'threshold', 'points', 'rebate'], description: 'rate 折扣、threshold 滿額折、points 送點數、rebate 點數回饋' },
        member_tier: { type: 'string', enum: ['初心者', '探索者', '創造者', '領航者'], description: '只列這個等級可用的活動（含不限等級者）' },
        active_on: { type: 'string', description: '出發日或購買日 YYYY-MM-DD，只列當天仍有效的活動' },
      },
    },
  },
  async run(i, _ctx) {
    const asOf = asOfDate();
    const category = i.category ? normalizeCategory(i.category) ?? i.category : undefined;
    const day = i.active_on && /^\d{4}-\d{2}-\d{2}$/.test(i.active_on) ? i.active_on : asOf;
    const list = loadPromos()
      .filter(isListed)
      .filter((p) => !isExpired(p.valid_to, asOf) && !isExpired(p.valid_to, day) && (!p.valid_from || p.valid_from <= day || day === asOf))
      .filter((p) => !i.channel || p.channel === 'all' || p.channel === i.channel)
      .filter((p) => !category || ((!p.categories.length || p.categories.includes(category)) && !p.exclude_categories.includes(category)))
      .filter((p) => !i.promo_type || p.promo_type === i.promo_type)
      .filter((p) => !i.member_tier || !p.member_tiers.length || p.member_tiers.includes(i.member_tier))
      .sort((a, b) => (a.valid_to ?? '9999').localeCompare(b.valid_to ?? '9999'));
    return {
      ok: true,
      data: { as_of: asOf, active_on: day, count: list.length, promos: list.map(summarizePromo), notice: MOCK_NOTICE },
      sources: sourcesFrom(list),
    };
  },
};
