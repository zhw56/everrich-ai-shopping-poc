import type { ChatEvent } from './types';
import fixtures from './demo-fixtures.json';
import { readSSE } from './sse';

/** 示範模式（?demo=1）：不呼叫 AI，用固定回覆展示流程；資料來自真實工具的輸出快照 */
export async function demoChat(message: string, verified: boolean, emit: (e: ChatEvent) => void, signal: AbortSignal) {
  let events: ChatEvent[] = [{ event: 'status', data: { text: '正在整理適合你的選擇…' } }];
  let reply = '';
  if (/預購單|訂單|我的|划算|消費紀錄|繼續/.test(message) && !verified) {
    reply = '可以，先完成 RICHCLUB 會員驗證，我就能依你的會員等級、航班與預購單幫你查。';
    events.push({ event: 'action', data: { type: 'verify', payload: { reason: '查詢會員資料與預購單，需要先驗證會員身分。' } } });
  } else if (/預購單|訂單|折 ?1,?000/.test(message)) {
    reply = '你的預購單實付 7,692 元，已套用酒類會員 95 折與美妝品牌週 88 折。週年慶滿 10,000 折 1,000 只計算非酒類商品，目前適用 5,880 元，還差 4,120 元。以上會員與訂單皆為虛構展示資料。';
    events.push({ event: 'cards', data: { type: 'order', items: [fixtures.order] } });
    events.push({ event: 'sources', data: [fixtures.source] });
  } else if (/保養|香水|送|伴手禮|威士忌|預算/.test(message)) {
    if (!/預算|元|萬|千/.test(message)) {
      reply = '幫你挑一份送得出手的禮物。預算大約是多少呢？';
      events.push({ event: 'action', data: { type: 'quick_replies', payload: { question: '這次的預算？', options: ['預算 3,000 以內', '預算 7,000 以內', '預算不限，想送好一點的'] } } });
    } else {
      reply = '先看看這幾款適合送禮的保養品，都在預算內。價格為展示資料，請勿作為正式報價。';
      events.push({ event: 'cards', data: { type: 'product', items: fixtures.products } });
      events.push({ event: 'sources', data: [fixtures.source] });
    }
  } else if (/客服|真人/.test(message)) {
    reply = '你可以問我昇恆昌的商品、優惠活動、預購提貨與會員服務，也可以告訴我需要協助的問題。';
    events.push({ event: 'action', data: { type: 'quick_replies', payload: { options: ['現在有什麼優惠活動？', '推薦送媽媽的保養品', '入境可以帶幾瓶酒？'] } } });
  } else {
    reply = verified
      ? '依展示會員 C 的消費紀錄與 10 月 23 日的航班，這三個優惠最划算。卡片上的金額由系統計算，門檻與折數含展示假設，仍待人工核對。'
      : '免稅店目前有這些優惠活動，週年慶到 10 月 31 日。也可以驗證會員，依你的消費算出最划算的買法。門檻與折數含展示假設，仍待人工核對。';
    events.push({ event: 'cards', data: { type: 'promo', items: verified ? fixtures.recommendations : fixtures.promos } });
    events.push({ event: 'sources', data: [fixtures.source] });
    events.push({ event: 'action', data: { type: 'quick_replies', payload: { options: ['這次出國怎麼買最划算？', '推薦送媽媽的保養品'] } } });
  }
  const final = events.splice(1);
  events = [...events, ...Array.from(reply).map(text => ({ event: 'delta', data: { text } })), ...final, { event: 'done', data: {} }];
  let index = 0, timer: ReturnType<typeof setTimeout>;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const next = () => {
        if (index >= events.length) { controller.close(); return; }
        const e = events[index++];
        controller.enqueue(new TextEncoder().encode(`event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`));
        timer = setTimeout(next, e.event === 'delta' ? 18 : 180);
      };
      next();
    },
    cancel() { clearTimeout(timer); },
  });
  await readSSE(body, emit, signal);
}
