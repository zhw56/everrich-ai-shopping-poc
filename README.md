# 昇恆昌 AI 購物小幫手 POC

展示用的概念驗證：手機優先的 AI 購物小幫手，涵蓋免稅店（機場、市區預購、免稅購物網）與宅配網兩個通路。功能包含商品推薦與送禮挑選、算出這次最划算的優惠、預購單與提貨查詢、入境菸酒與行李額度問答、限定昇恆昌官網搜尋（附來源）、multi-agent 處理複合問題，以及後台、客戶畫像與 NBA。

> 本專案為個人作品，**不是昇恆昌官方產品**。商品價格、優惠門檻與折數、會員與訂單多為展示用假資料（標示 `mock`／`verified: false`），不可當成實際報價，實際內容以昇恆昌公告為準。

## 快速開始

需要 Node.js 20.19 以上的 20.x，或 22.12 以上。

```sh
npm install
cp .env.example .env   # 填入自己的 ANTHROPIC_API_KEY
npm run dev
```

- 前台：http://localhost:5173
- 不想花 API 費用：開 http://localhost:5173/?demo=1 ，固定示範對話，不呼叫 Claude API、不需要金鑰（示範驗證用會員 C：`0900-000-003`）
- 後台與儀表板：http://localhost:5173/admin
- 後端健康檢查：http://localhost:3001/api/health

真實 AI 模式會呼叫 Claude API（含官網搜尋），費用由 `.env` 裡的金鑰帳號支付。本機 `.env` 若設 `LLM_PROVIDER=inception`，對話會改用 Inception（測試省錢）；正式展示請在後台「系統參數」切回 Claude，或把 `.env` 改成 `LLM_PROVIDER=anthropic`。

## 試玩建議

| 情境 | 怎麼試 |
| --- | --- |
| 一般商品查詢 | 問「預算 3,000 以內有什麼適合送長輩的伴手禮？」 |
| 個人化優惠推薦 | 問「這次出國怎麼買最划算？」，驗證會員 `0900-000-001`（創造者、常買美妝、11/8 飛首爾） |
| 出發日與點數到期 | 驗證 `0900-000-002`（12/20 才出發、點數 10/31 到期），問「我 12 月才出國，點數會不會先過期？」 |
| 商品＋優惠＋取貨（multi-agent） | 驗證 `0900-000-003`（領航者、10/23 飛東京），問「我下週五從桃園飛東京，想預購一瓶威士忌跟送媽媽的保養品，預算一萬，現在有什麼優惠？在哪裡取貨？」 |
| 預購單疑問 | 驗證 `0900-000-003`，問「我的預購單怎麼沒有折 1,000？」 |
| 商品一問一答 | 問「想買香水送女朋友」，用快速回覆選條件 |
| 規定問答 | 問「入境可以帶幾瓶酒？」、「提貨要帶什麼？」 |
| 宅配網 | 問「我沒有要出國，保養品可以寄到家嗎？」 |
| 轉真人／拒答 | 說「我要客訴」或問「其他免稅店是不是比較便宜？」 |

展示驗證碼一律為 `123456`，3 位會員都是虛構資料。

## 一個機器人、兩個通路

免稅店與宅配網共用同一個 RICHCLUB 會員、點數與對話。差別做成「通路」欄位：

- 商品有免稅價與宅配價（宅配價留空＝宅配網不販售，例如酒類）
- 優惠活動標示適用通路（免稅店／宅配網／兩者）
- 訂單分免稅預購單（機場提貨）與宅配訂單
- 客人說了出發日、航班或機場就走免稅店；說寄到家就走宅配網；沒說時先用免稅店回答，並提醒也可以宅配到家

## 手機試用

筆電與手機連同一個 Wi-Fi 後，比較表會產生區網 QR code。自動偵測的 IP 不對時，在 `.env` 設定 `SHARE_BASE_URL=http://<筆電區網 IP>:5173`。後台在區網其他裝置上為唯讀。

## 部署到雲端

專案附 `Dockerfile`，一個服務同時提供前台、後台與 API，任何支援 Dockerfile 的平台都能用（Zeabur、Render、Railway 等）。

1. 建立新的服務，選這個 repo（建議另開一個 repo 或分支，不要覆蓋原本的部署）。
2. 環境變數填 `ADMIN_TOKEN`（後台管理密碼，也是後台保存金鑰時的加密鑰匙）。
3. 產生網域後，打開 `網址/admin` → 輸入管理密碼 → 系統參數保存 API 金鑰、分享網址（與需要時的 GitHub repo、token）→ 按「測試連線」。

`data/settings.json` 的 GitHub repo 與分享網址預設留空，避免「發布」誤寫到其他專案。

## 後台

`/admin` 可以編輯優惠活動、商品、組合優惠價、知識庫、情境設定、Prompt、推薦權重、搜尋來源、前台文案與系統參數，存檔後下一輪對話就生效。改到數字或新增的資料會自動標示為展示資料。

### 行銷

對話時 AI 會在背景整理客戶需求（客戶畫像：旅客類型、預算、送禮對象、感興趣分類、出發日、同行人數等），客戶在前台看不到。後台「行銷」有三頁：

- 客戶畫像：每位客戶的需求屬性，標示來源（客戶說的附原句、AI 推測附信心、會員資料），以及建議的下一步行動。
- 分眾與名單：客群（美妝香氛客、酒類買家、送禮需求、近期出國、點數將到期⋯）人數與分布；勾選條件產生行銷名單，只含同意行銷的客戶，可匯出 CSV。
- NBA 規則：設定「什麼客群該推什麼」（例如近期出國提醒預購、點數到期提醒折抵、買酒提醒入境 1.5 公升）與接觸頻率。

## 指令

```sh
npm run typecheck      # 前後端型別檢查
npm run test:tools     # 工具與引擎測試（不呼叫 API）
npm run test:edit --workspace server     # 後台編輯與發布測試（會暫改 data/ 後還原）
npm run test:admin --workspace server    # 搜尋來源、對話紀錄、權重與權限測試
npm run test:profile --workspace server  # 客戶畫像、客群、NBA、行銷名單測試
npm run test:comparison --workspace server  # 比較表測試
npm run test --workspace web             # 前台串流解析測試
npm run smoke --workspace server -- "問題"  # 單輪快速測試（用目前供應商）
npm run chat           # 指令列對話；npm run chat:demo 自動跑展示情境（會呼叫 API）
npm run eval           # 30 題評測，結果在 eval-results/（會呼叫 API）
node data/validate.mjs # 資料一致性檢查
```

## 架構與文件

- 後端：Express＋Anthropic SDK，`server/src/`（orchestrator 主控、agents 4 位專員、tools 13 個工具、engine 優惠計算與推薦）
- 前台：Vite＋React＋Tailwind，`web/src/`（app 前台、admin 後台）
- 資料：`data/*.json`、`data/kb.md`，欄位與規則見 `data/README.md`
- 需求與規則：`PRD.md`、`AGENTS.md`；進度與交接：`PROGRESS.md`、`TASKS.md`
