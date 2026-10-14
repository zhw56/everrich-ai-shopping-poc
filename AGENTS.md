# 昇恆昌 AI 購物小幫手 POC｜專案規則

Claude Code 與 Codex 共用這份規則。每次開工前必讀，規則與使用者指示衝突時，以使用者為準，並把變更記到 PROGRESS.md 的「決策紀錄」。

## 專案目標

展示用的 POC：手機優先的昇恆昌 AI 購物小幫手，一個機器人涵蓋免稅店（機場、市區預購、免稅購物網）與宅配網兩個通路，包含商品推薦與送禮挑選、個人化優惠計算、預購單與提貨查詢、入境菸酒與行李額度問答、限定昇恆昌官網搜尋（附來源）、multi-agent 處理複合問題。完整需求與使用者情境（S1–S10）見 PRD.md。

## 開工流程（每次都要做）

1. 讀本檔、PROGRESS.md、TASKS.md。
2. 只做 PROGRESS.md 的「下一個任務」或使用者指定的任務，一次只做一個。
3. 開始前把 PROGRESS.md 裡該任務的狀態改為「進行中」，並寫上帳號與模型。
4. 只讀和這個任務有關的檔案，不要每次讀整個專案（節省額度）。

## 收工流程（任務完成，或額度快用完時）

1. 更新 PROGRESS.md：完成了什麼、未完成的部分、下一步、已知問題。
2. 在 TASKS.md 勾選已達成的驗收條件。
3. `git add -A && git commit`，訊息格式：`T3: 完成 query_promos 與 recommend_promos`。
4. 額度快用完時，優先讓程式保持可執行再交接。如果必須中斷，在 PROGRESS.md 寫明哪個檔案改到一半、改到哪裡。

## 技術選型（已定案，不可自行更改）

- Node.js 20 以上、TypeScript、npm workspaces（根目錄管理 server 與 web）
- server：Express＋`@anthropic-ai/sdk`，用 `tsx` 執行，對話回應用 SSE 串流
- web：Vite＋React＋Tailwind CSS，手機優先
- 資料：`data/*.json` 與 `data/kb.md`，POC 不使用資料庫或向量資料庫
- QR code：`qrcode` 套件；比較表是網頁，PDF 用瀏覽器列印產生
- 新增套件只加必要的，並記錄在 PROGRESS.md「決策紀錄」

## 目錄結構

```
everrich-demo/
├─ AGENTS.md  CLAUDE.md  PRD.md  TASKS.md  PROGRESS.md
├─ .env.example            .env 不進 git
├─ data/
│  ├─ sources.json        來源清單（唯一管理入口；T9 維護，T3 搜尋讀取）
│  ├─ promos.json products.json bundles.json users_mock.json kb.md eval.json
│  ├─ prompts.json        後台可編輯的系統提示詞版本（T7 建立，T9 管理介面）
│  ├─ scenarios.json frontend.json settings.json  後台維護的情境、前台文案、系統參數（T13）
│  ├─ nba.json profiles_demo.json marketing_consents.json  NBA 規則、示範畫像、展示用戶行銷同意（T15）
│  ├─ runtime/            執行時產生的客戶畫像（不進 git、不列入發布）
│  ├─ README.md           欄位、來源比對、mock 與日期契約
│  ├─ validate.mjs        T2 資料完整性檢查（不呼叫 API）
│  └─ raw/                urls.txt 原始入口與 observations.json 事實摘錄
├─ server/
│  ├─ src/orchestrator/    主控 agent：system prompt、工具迴圈、session
│  ├─ src/agents/          優惠、商品、訂單、知識 4 個專員 agent
│  ├─ src/tools/           13 個工具，一個工具一個檔案
│  ├─ src/engine/          推薦引擎：優惠計算、評分、排序、組合優惠價與訂單門檻檢查
│  ├─ src/profile/         客戶畫像（只在後台）：欄位、合併規則、抽取、客群、NBA、行銷同意
│  └─ src/routes/          API 路由
└─ web/
   ├─ src/app/             前台（手機優先）
   └─ src/admin/           後台與儀表板（假資料）
```

## 執行時使用的模型（展示 App 呼叫 Claude API 用）

- 主控 agent：`claude-sonnet-5`（環境變數 `MODEL_ORCHESTRATOR`）
- 專員 agent：`claude-haiku-4-5-20251001`（環境變數 `MODEL_AGENT`）
- 模型名稱與 API 金鑰不寫死在程式裡：後台「系統參數」有填的值優先（模型存 `data/settings.json`，金鑰以 ADMIN_TOKEN 加密存 `data/secrets.enc.json`），留空才用環境變數；一律透過 `config.modelOrchestrator`、`config.modelAgent`、`config.anthropicApiKey` 取用（每次讀取即時生效）
- **模型供應商（T16）**：`server/src/llm/` 統一取得模型 client，主控、專員、畫像抽取、評分員一律用 `getLlm()`、`modelFor('orchestrator'|'agent')`，不要直接 `new Anthropic()`。供應商為 `anthropic`（正式展示）或 `inception`（Mercury，開發測試省錢，經轉接層轉成 OpenAI 相容格式）；優先序：環境變數 `LLM_PROVIDER` ＞後台 `llm_provider` ＞ anthropic。
- **省錢規則：AI 助理開發時跑 chat、eval、replay 一律用 Inception**（本機 `.env` 已設 `LLM_PROVIDER=inception`）。只有使用者要求，或正式展示前的最後確認，才用 Claude 跑（`LLM_PROVIDER=anthropic npm run eval:demo`）。Inception 的測試結果只代表流程與程式正確，不代表 Claude 的回答品質。
- 限定來源搜尋：固定用 Claude 內建網頁搜尋（不受供應商切換影響），結果快取 24 小時於 `data/runtime/search-cache.json`；工具類型 `web_search_20250305`，`max_uses: 3`；`allowed_domains` 從 `data/sources.json` 的啟用來源擷取 `hostname + pathname`，不寫死整站網域。
- 搜尋來源只允許 HTTPS 的 `everrich-group.com`（昇恆昌官網）與 `customs.gov.tw`（關務署通關規定）或其真正子網域；`taishinbank.com.tw`（聯名卡發卡銀行）只供追溯、不可啟用為搜尋來源。搜尋結果另比對完整 hostname／pathname，停用、未列路徑與外站跳轉不得使用。無啟用來源時回 `NO_ENABLED_SOURCES`，禁止退回不受限搜尋；完整規則見 `data/README.md`。
- 搜尋結果的引用（url、title、cited_text）要原樣保留，傳給前台顯示
- 回應一律串流

## 工具介面規範

- 每個工具一個檔案：`server/src/tools/<工具名>.ts`，匯出 `definition`（name、description、input_schema）與 `run(input, ctx)`。
- `run` 回傳格式固定為：
  ```ts
  { ok: boolean; data?: unknown; sources?: { title: string; url: string; cited_text?: string }[]; error?: string }
  ```
- 需要驗證會員的工具（get_user_profile、get_purchases、get_order）先檢查 `ctx.session.verified`，未驗證時回傳 `{ ok: false, error: "NEED_VERIFY" }`。
- 價格、折扣、省下金額、門檻差額與日期推算只能由 `engine/` 計算，LLM 不做任何算術。
- 13 個工具與 4 個專員的分工，見 PRD.md「Agent 與工具設計」。

## 前後端介面（前台與後端各自開發時的共同約定）

`POST /api/chat`，body：`{ session_id, message }`，回應為 SSE，事件如下：

| 事件 | 資料 | 用途 |
| --- | --- | --- |
| status | `{ text, tool?, agent?, phase? }` | 進度，例如「正在查詢優惠活動…」；multi-agent 時每個專員在開始與結束各送一則，`agent` 為 promo／product／order／knowledge，`phase` 為 start／done／timeout／error／skipped |
| delta | `{ text }` | 串流文字 |
| cards | `{ type: "promo" \| "product" \| "bundle" \| "order", items: [] }` | 結果卡片 |
| sources | `[{ title, url, cited_text }]` | 來源標籤 |
| action | `{ type: "verify" \| "quick_replies" \| "compare" \| "handoff", payload }` | 要求前台顯示驗證視窗、快速回覆按鈕、比較表連結、轉真人結果 |
| done | `{}` | 本輪結束 |
| error | `{ message }` | 錯誤 |

其他路由：

- `POST /api/verify`，body：`{ session_id, phone, otp }`（RICHCLUB 會員手機號碼），展示用固定 OTP `123456`
  - 回應 JSON：`{ ok, data?: { verified, user_id, name, phone }, error?, resume_message? }`；成功且有 `resume_message` 時，前台要自動把它當成下一則訊息送到 `/api/chat`
  - 驗證視窗要提供「不驗證，自己說預算」按鈕，按下後關閉視窗並送出「我不想驗證，想自己說這次的預算和想買的東西」
- `done` 事件資料為 `{ meta: { tool_calls, tools, searched, grounded, ms, agents, agent_status, prompt_version, nba } }`，供監控與評測使用；`nba` 為本輪 AI 帶出的 NBA 規則代號（沒有為 null）；`agents` 為本輪派出的專員（沒派工為空陣列），`agent_status` 為各專員結果，`prompt_version` 為本輪使用的提示詞版本；發生錯誤時 meta 為 null
- 主控另有 2 個介面工具（不屬於 13 個業務工具）：`request_verification` 觸發 `action verify`（payload：`{ reason }`）、`show_quick_replies` 觸發 `action quick_replies`（payload：`{ question, options }`）
- 主控另有派工工具 `dispatch_agents`（輸入 `tasks: [{ agent: promo｜product｜order｜knowledge, task }]`）：跨 2 個以上領域才使用，平行執行、每個專員 15 秒逾時、每輪最多 3 個專員；派工本身不計次，專員內的工具呼叫計入每輪 6 次上限。有商品與優惠價時，主控送出 3 組 `bundle` 卡片（多一個 `reason` 欄位）
- `action compare` 的 payload 為 `{ id, url, row_count }`；`action handoff` 的 payload 為 `{ ticket_id, status, mock, notice }`
- `GET /api/config`：前台文案與快捷入口（後台「前台設定」維護）
- 後台 API 在 `/api/admin/*`（catalog、kb、frontend、settings、scenarios、publish、sources、prompts、weights、logs、stats、profiles、segments、audience、nba），寫入需本機或 `x-admin-token`
- `GET /api/compare/:id`：比較表資料
- `GET /api/health`：健康檢查

卡片欄位：

- promo：`id, name, label, condition_label, channel_label, requirement_label, valid_to, saving?, rebate?, points?, gap?, reason?, source_url`
- product：`id, name, brand, category, channel, price, size_label, tags[], reason?, source_url`
- bundle：`bundle_id, product, promo, channel_label, list_price, bundle_price, saving, gift?, reason?, source_url`
- order：`order_no, status, pickup_label, total, subtotal, discount_total, items[{ name, amount }], promo_check[{ name, reached, gap, eligible_amount }]`

## 防護規則（寫進主控 agent 的 system prompt）

1. 價格、折扣、省下金額與結帳價只能來自工具回傳，LLM 不自行計算。
2. 商品、優惠與規定類回答至少附一個來源（知識庫或官網），沒有來源就不回答。
3. 會員資料工具只能在已驗證狀態下呼叫。
4. 每輪最多 6 次工具呼叫、最多 3 個專員 agent，專員逾時 15 秒就用已取得的結果回答。
5. 只回答昇恆昌相關問題，不比較或評論其他免稅店或購物平台。
6. 只用台灣繁體中文與台灣用語，不得出現簡體字與中英夾雜；後端送出前另以 OpenCC（`server/src/util/zh.ts`）把 `delta` 與快速回覆轉為台灣正體。
7. 菸酒相關回答一律提醒入境免稅數量，不鼓勵超量攜帶，不推銷菸品。

系統提示詞的組合順序：固定規則（`orchestrator/prompt.ts`，含上述防護規則，不開放編輯）→ `data/prompts.json` 的啟用版本（角色、業務規則、回答格式，後台可編輯，每輪重新讀取）→ 目前狀態（程式產生）。讀寫一律透過 `server/src/prompts.ts` 的 `getActivePrompt`、`loadPromptStore`、`savePromptVersion`、`setActiveVersion`（驗證格式、原子寫入、只新增版本不覆蓋）；讀檔失敗或內容為空時自動退回內建 v1。

## 資料規則

- 活動、會員權益與通關規定以昇恆昌官網與關務署為準，每筆要有 `source_url` 與 `verified`（使用者人工核對過才是 `true`）。
- 商品價格、優惠門檻與折數查不到時使用展示值並標 `mock: true`，列出 `mock_fields`／`unknown_fields`；不得宣稱為官方報價。
- 展示會員一律虛構，手機號碼使用 `0900-000-001` 這類格式，航班使用「DM 108（展示航班）」這類虛構編號。
- 所有資料 `verified` 先為 `false`；人工核對另行進行，不以 AI 查詢代替。
- `source_id` 關聯 `sources.json`，來源頁只供追溯，不可拿來證明 mock 值。價格與優惠的來源要求不能用假資料充抵；前台與工具需明示展示資料。
- 來源清單由 T9 後台經 server 維護；修改後 T3 下一次搜尋須生效，不得另存一份硬編碼清單。資料 `verified` 與 session 身分驗證旗標分開。

- 客戶畫像（T15）只在後台使用，前台不顯示；只收白名單欄位，健康、宗教、政治、性向、犯罪、證件號碼、地址等敏感資訊一律不收。執行時畫像存在 `data/runtime/`，不進 git、不列入發布。行銷名單只列 `marketing_consent` 為 true 的客戶。

## 前台規範

- 設計語言見 `web/src/theme.css`（極簡精緻，前後台共用）；前台 class 前綴 `fx-`，後台 `bo-`，不要用 `ad-` 開頭（會被廣告封鎖器隱藏）。

- 介面文字使用台灣繁體中文與全形標點。
- 以手機寬度 390px 為主要設計尺寸，小於 768px 單欄；平板與桌機改為左對話、右結果的雙欄。
- 觸控目標至少 44px；輸入框固定在底部，並避開手機安全區域。
- 來源標籤點開後顯示標題、引用原文與網址。

## 禁止事項

- 不提交 `.env` 或任何 API key。
- 前台不直接呼叫 Claude API，一律經過後端。
- 不修改其他任務負責的檔案；真的需要時，在 PROGRESS.md 寫明原因。
- 不自行更換技術選型、工具名稱或前後端介面（2026-10-14 已依使用者指示改為昇恆昌版，見 PROGRESS.md 決策紀錄）。

## 驗證指令

- `npm run dev`：同時啟動前後端
- `npm run test:tools`：工具單元測試
- `npm run chat`：指令列對話測試（不需前台）
- `npm run eval`：跑 `data/eval.json` 30 題評測（`-- --only S7-01`、`-- --no-judge`），報告在 `eval-results/`
- `npm run eval:demo`：展示情境 S1、S2、S4、S7、S10 各連跑 3 次
- `node data/validate.mjs`：資料一致性（來源、商品、優惠、組合價、會員訂單加總、展示情境）
- `npm run test:admin --workspace server`、`npm run test:comparison --workspace server`：後台與比較表測試
- `npm run test:profile --workspace server`：客戶畫像、客群、NBA 接觸政策、行銷名單同意過濾（不呼叫 API）
- `npm run replay --workspace server`：重播使用者實測對話，檢查中英夾雜、重複聲明、過場句、逼按按鈕與畫像抽取（會呼叫 API）
