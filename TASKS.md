# 任務清單

每個任務完成時勾選驗收條件，並在 PROGRESS.md 留下交接紀錄。

換帳號或換 AI 助理時，新對話開場只要說：「讀 AGENTS.md 和 PROGRESS.md，接續未完成的任務。」

---

## E1 昇恆昌購物小幫手版本（2026-10-14 完成）

架構不動（主控＋4 位專員＋13 個工具＋推薦引擎＋後台＋客戶畫像），內容換成昇恆昌。

- [x] 資料：`promos.json`、`products.json`、`bundles.json`、`users_mock.json`、`sources.json`、`kb.md`、`eval.json`、`nba.json`、`profiles_demo.json`、`scenarios.json`、`frontend.json`、`prompts.json`
- [x] 一個機器人、兩個通路：商品有免稅價與宅配價，優惠與訂單標示通路
- [x] 推薦引擎：依出發日排除用不到的活動、計算可折金額與門檻差額、點數是否在出發前到期、預購開放日
- [x] 訂單引擎：滿額活動的適用金額（排除分類不列入）與還差多少
- [x] 工具與專員改名：promo／product／order／knowledge；query_promos、recommend_promos、query_products、recommend_products、get_promo_price、get_purchases、get_order、search_official_web
- [x] 防護：其他免稅店與購物平台不比較；客訴與退貨退款轉真人；規定類問題（菸酒額度、液體、點數效期、預購期限）強制先查資料；菸酒回答提醒入境額度
- [x] 客戶畫像欄位、客群、NBA 規則改成購物情境
- [x] 前台、比較表、示範模式、後台各頁改成昇恆昌；配色改為深藏青＋香檳金
- [x] `node data/validate.mjs`、`npm run typecheck`、`test:tools`、`test:edit`、`test:admin`、`test:profile`、`test:comparison`、`test:llm`、`web test` 全部通過
- [x] 用 Claude 實測 S1、S2、S3、S4、S6、S7、S8、S10

## E2 展示前確認（你）

- [ ] 後台「系統參數」確認模型供應商是 Claude、按「測試連線」
- [ ] 跑一次 `npm run eval:demo`（會呼叫 API）確認展示情境穩定
- [ ] 準備備援：`/?demo=1` 示範模式不需要網路以外的任何設定

## E3 人工核對（之後）

- [ ] 對照官網與門市核對至少 10 件商品價格與 5 個活動條件，核對過且已排除展示假設的內容才標 `verified: true`
- [ ] 確認預購截止時間、點數效期與折抵比例、退換貨規定，補進知識庫
- [ ] 確認是否要把品牌週、酒類 95 折兩個虛構活動換成當期真實活動

## E4 延伸（可選）

- [ ] 串接 RICHCLUB 會員與預購訂單 API（工具內部改接，主控與前台不用改）
- [ ] 機場與市區門市大螢幕版型（結果用 QR 帶走）
- [ ] 英文、日文介面（國際旅客）
