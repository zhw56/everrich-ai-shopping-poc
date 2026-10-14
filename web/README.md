# 前台

在專案根目錄執行 `npm run dev`，開啟 `http://localhost:5173/`。

- `/`：真實 API 模式，透過 Vite 的 `/api` 代理呼叫後端。需要後端與根目錄 `.env` 設定。
- `/?demo=1`：固定互動示範，不呼叫 Claude API。資料來自真實工具輸出的快照（`demo-fixtures.json`）；示範驗證固定用會員 C（`0900-000-003`／`123456`）。頁首明示模式，不會在真實 API 失敗時偷偷換成假回答。
- 390px 單欄；768px 起左對話、右結果。對話獨立捲動，輸入區固定底部並保留安全區。卡片支援滑動、方向鍵與上一張／下一張按鈕。

## 測試流程

1. 首頁點「優惠活動」：確認文字、優惠卡片、來源。
2. 點「我的預購單」：跳出 RICHCLUB 會員驗證，輸入 `0900-000-003`、`123456`，驗證後自動接續，出現訂單明細卡片（實付、折扣、滿額差額）。
3. 點「商品推薦」或輸入「推薦送媽媽的保養品，預算 7,000」：出現商品卡片（免稅價）。
4. 回覆途中點停止，再點重新送出；開啟／關閉來源與驗證視窗；新對話會清空畫面並更換 session。

```sh
npm run test --workspace web
npm run typecheck --workspace web
npm run build --workspace web
```

## 接口與資料

- `sse.ts`：POST `/api/chat` 與增量串流解析。網路中斷保留部分回答並提供重試；一次只送一輪。
- `App.tsx`：會話、進度、動作、驗證及兩欄排版。`Cards.tsx`：promo／product／bundle／order；`MessageText.tsx`：安全文字排版，不執行 HTML。
- 所有價格、折扣與省下金額由工具提供，前台不計算。顯示 mock／verified 提示；來源頁不證明假價格。
