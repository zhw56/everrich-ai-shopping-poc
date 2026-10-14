# 資料契約與核對說明

本資料供昇恆昌 AI 購物小幫手 POC 使用，基準日為 **2026-10-15**，時區 Asia/Taipei，金額皆為新臺幣整數。`sources.json` 是唯一的來源管理清單；`raw/urls.txt` 保留原始入口，`raw/observations.json` 保存 2026-10-14 實際讀到的官網與關務署事實摘錄。

目前共有 13 筆來源（12 啟用、1 只供追溯）、11 個優惠活動、20 件商品、56 組組合優惠價、3 位展示會員（6 張訂單）、15 段知識與 30 題評測。`node data/validate.mjs` 會檢查所有關聯、加總與展示情境；後台存檔前也會跑同一支檢查。

## 可信度與展示邊界

- 所有資料的 `verified` 都是 `false`。只有使用者人工核對後才能改成 `true`，網頁可開啟或 AI 查過不代表人工核可。
- `mock: true` 表示包含虛構值或展示假設。`mock_fields` 列出已填入的展示假設，`unknown_fields` 列出保留為 `null` 的未知欄位；不能把 `null` 當成 0、無限制或永久有效。
- **有官網依據的事實**：活動名稱與期間（週年慶 10/1–10/31、潮台由我不設限 9/22–10/31）、徽章任務 1,000 RICH POINT、免稅購物網出境前 45 天開放預購與機場提貨點、預購加碼 5% 回饋、會員四個等級與每 100 元 3／4／5／5 點、入會與升等禮、門市據點、提貨文件與客服電話、關務署菸酒與行李免稅額度、聯名卡「免稅商品再 9 折起」。
- **展示假設**：所有商品價格、滿額門檻與折抵金額、品牌週與酒類 95 折兩個活動、會員與訂單、點數效期規則。不能宣稱成昇恆昌真實優惠。

## sources.json

每筆只有 id、type、title、url、enabled、last_checked、note 七個欄位。

| 欄位 | 型別與含義 |
| --- | --- |
| id | 穩定且唯一；其他檔案以 source_id 關聯，後台不任意更改 |
| type | `promo`（活動與優惠）、`product`（商品與品牌）、`faq`（規定、會員與服務） |
| url | HTTPS 官方來源；搜尋只用 hostname＋pathname |
| enabled | 只有 true 可以進入搜尋允許清單，與內容是否已核對無關 |

搜尋與維護規則：

1. 每次搜尋讀取目前的 `sources.json`。只選 `enabled: true`、HTTPS、無帳密、預設 port，且 hostname 為 `everrich-group.com`（昇恆昌官網）或 `customs.gov.tw`（關務署）與其真正子網域的來源。`taishinbank.com.tw`（聯名卡發卡銀行）只供追溯，不可啟用。
2. 用 URL parser 取出 **hostname＋pathname**，移除 query（例如 `?lang=zh_TW`）與 fragment，作為 `web_search_20250305.allowed_domains`，保留 `max_uses: 3`。
3. 搜尋結果還須檢查**相同 hostname 與完整 pathname**；同網域未列路徑、偽子網域、外站跳轉一律不採用。無有效來源時回 `NO_ENABLED_SOURCES`，引用全部被排除時回 `NO_ALLOWED_SOURCES`，不得送出無限制搜尋。
4. 被引用的來源不可刪除，只能停用。

## promos.json

| 欄位 | 型別與定義 |
| --- | --- |
| channel | `dutyfree`（機場、市區預購、免稅購物網）、`home`（宅配網）、`all` |
| promo_type | `rate` 折扣、`threshold` 滿額折、`points` 送點數、`rebate` 點數回饋（結帳不折價） |
| discount_rate | 0 到 1；0.1 代表 9 折或回饋 10% |
| max_discount | 折扣上限，null 代表未公告或無上限 |
| min_spend、discount_amount | 滿額門檻與折抵金額 |
| categories、exclude_categories | 適用分類（空＝全館）與不列入計算的分類（例如週年慶排除酒類） |
| member_tiers | 限定會員等級，空＝不限 |
| requirement | `none`、`member`、`card`（聯名卡結帳）、`app`（App 任務） |
| valid_from、valid_to | 期間；引擎以「出發日」判斷免稅店活動是否還能用 |
| label、condition_label | 卡片上的優惠內容與條件 |

## products.json

| 欄位 | 型別與定義 |
| --- | --- |
| category | `美妝保養`、`香水`、`酒類`、`精品配件`、`食品伴手禮` |
| price | 免稅價 |
| home_price | 宅配價；null 代表宅配網不販售（酒類一律 null） |
| channels | 依 home_price 自動決定 `['dutyfree']` 或 `['dutyfree', 'home']` |
| alcohol_ml | 酒類容量，用來提醒入境 1.5 公升 |
| price_kind | 目前全部 `mock` |

## bundles.json

單一商品套用單一優惠後的結帳價（`bundle_price`），全部 mock。省下金額（原價－優惠價）由 engine 計算，不存檔。送點數與點數回饋不改變結帳價，不做成組合。

## users_mock.json

根為 `{ schema_version: 2, as_of, timezone, currency, mock, verified, users }`。

| 欄位 | 型別與定義 |
| --- | --- |
| phone | 0900-000-001～003，展示用 |
| member_tier、points、points_expire_date、points_expiring | 會員等級、點數、即將到期的點數與日期 |
| next_trip | 下一趟出發日、機場航廈、目的地、展示航班 |
| favorite_product_id | 常買商品 |
| purchases[] | 2026-04～09 每月 dutyfree_amount、home_amount、trips、categories（分類加總須等於兩通路合計） |
| orders[] | order_no、channel、status、pickup_label、items（折扣為負數）、total（須等於 items 加總） |

- A：創造者、常買美妝、11/8 出發（週年慶在出發前結束）。
- B：探索者、12/20 出發、3,200 點在 10/31 到期（點數早於出發日到期、預購 11/5 才開放）。
- C：領航者、10/23 出發，待取貨預購單含麥卡倫與蘭蔻：實付 7,692 元，週年慶滿額只算非酒類 5,880 元，還差 4,120 元。

## kb.md

每段以 `## KBxx｜問題` 開頭，接著 source_id、source_url、last_checked、valid_to、verified、mock 六行，再接內文。核心主題（預購、提貨、1.5 公升）刪光會被資料檢查擋下。`last_checked` 超過 30 天或 `valid_to` 已過時，search_kb 會標示 stale，主控改查官網。

## eval.json

30 題，S1–S10 各 3 題；每題有預期工具、禁用工具、畫面動作、是否需附來源與揭露展示資料。執行 `npm run eval`。
