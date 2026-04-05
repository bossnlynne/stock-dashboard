# 專案概覽

Lynne's Stock Dashboard — 純前端股票儀表板 + 損益試算工具，部署於 GitHub Pages。
使用者透過密碼解鎖後，查看台股 / 美股持倉、即時報價、損益，以及進行買賣損益試算。

# 技術架構

- **Runtime**: 純 HTML5 / CSS3 / JavaScript（無框架、無 npm、無 build tool）
- **架構**: 單檔 SPA (`stock-dashboard/app.html`，約 1100 行，HTML + CSS + JS 全包)
- **部署**: GitHub Pages（靜態託管），密碼保護的 `index.html` 由 `build.py` 產生
- **加密**: AES-256-GCM + PBKDF2 (200k iterations)，密碼 `0790`
- **持久化**: localStorage（加密 JSON），無後端、無資料庫
- **伺服器**: 開發用 `/opt/homebrew/bin/python3` HTTP server（系統 Python 有權限問題）

# API 串接

## 台股（TWSE + TPEX）
- **上市 TWSE**: `GET https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY_ALL?response=json`
  - 原生 CORS，直接打
  - 回傳格式: `data[]` 陣列，`row[0]`=代號, `row[1]`=名稱, `row[7]`=收盤價
- **上櫃 TPEX**: 透過 codetabs proxy
  - `GET https://api.codetabs.com/v1/proxy/?quest=https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes`
  - 回傳格式: 物件陣列，欄位 `SecuritiesCompanyCode`, `CompanyName`, `Close`
- **快取策略**: 頁面載入時一次打兩支 API，建成 `twDataCache = { 代碼: { name, price } }` map，後續查找不再重複打 API
- **注意**: TWSE 會阻擋 proxy 代理（codetabs 等），只能直連；TPEX 則可透過 proxy

## 美股（Finnhub）
- **報價**: `GET https://finnhub.io/api/v1/quote?symbol={TICKER}&token={KEY}`，取 `c` (current price)
- **搜尋**: `GET https://finnhub.io/api/v1/search?q={QUERY}&token={KEY}`，過濾 `type === 'Common Stock' || 'ETP'`
- **API Key**: `d73o7hhr01qjjol3nfb0d73o7hhr01qjjol3nfbg`（寫在 app.html 中）
- **注意**: 美股是逐個 symbol 打 API，台股是整批快取；Finnhub 有 rate limit，大量請求需用 `Promise.allSettled` 避免一個失敗全部失敗

## 匯率
- `GET https://open.er-api.com/v6/latest/USD` → `rates.TWD`
- 自動帶入但使用者可手動覆蓋

# 檔案結構

```
stock-dashboard/
├── index.html                 # 密碼解鎖 loader（由 build.py 產生，勿手動編輯）
├── serve.py                   # 簡易 HTTP server (port 3000)
├── CLAUDE.md                  # 本文件
├── .claude/
│   ├── launch.json            # 開發伺服器設定
│   └── settings.local.json    # Claude Code 權限
└── stock-dashboard/
    ├── app.html               # 主應用程式（所有修改在這裡）
    ├── build.py               # Python 加密建置腳本
    └── build.js               # Node.js 加密建置腳本（備用）
```

# 開發注意事項

## 本機開發伺服器
- **必須用 Homebrew Python**: `/opt/homebrew/bin/python3`，系統 Python (`/usr/bin/python3`) 在 sandbox 中有 `PermissionError: [Errno 1] Operation not permitted`
- 系統 Ruby (`/usr/bin/ruby`) 同樣有權限問題，不可用
- `.claude/launch.json` 中的 dev server 已設定好，使用 port 3001
- 開發時直接存取 `http://127.0.0.1:3001/app.html`（注意預設是目錄列表，需手動導航至 app.html）

## 建置與部署
- 修改 `app.html` 後，**必須執行** `/opt/homebrew/bin/python3 stock-dashboard/build.py` 重新產生加密的 `index.html`
- `build.py` 需要 `cryptography` 套件（Homebrew Python 已安裝）
- 部署: `git push origin main` → GitHub Pages 自動更新
- 密碼: `0790`

## 資料結構

```javascript
// localStorage 中的 state（加密儲存）
{
  exchangeRate: 32.5,
  portfolios: {
    tw: [{ id, symbol, name, shares, cost }],      // 台股
    twdUs: [{ id, symbol, name, shares, cost }],    // 台幣複委託美股
    usdUs: [{ id, symbol, name, shares, cost }]     // 外幣複委託美股
  }
}

// 執行期快取
prices = { "2330": 1810, "AAPL": 255.94 }          // symbol → 現價
twDataCache = { "2330": { name: "台積電", price: 1810 } }  // 台股完整快取
```

## 損益試算公式

| 情境 | 公式 |
|------|------|
| 台股賣出 | 淨回 = 成交金額 − 手續費(成交額×0.1425%×0.28) − 證交稅(成交額×0.3%) |
| 台股買進 | 總額 = 成交金額 + 手續費(成交額×0.1425%×0.28) |
| 美股賣出 | 淨回 = 成交金額 − 手續費(成交額×0.08%) |
| 美股買進 | 總額 = 成交金額 + 手續費(成交額×0.08%) |

台股手續費取整數 (`Math.round`)，美股保留兩位小數。

## 數字格式
- 台股: 千分位、整數（0 小數位），股數為整數
- 美股: 千分位、2 小數位，股數最多 5 小數位
- 使用 `fmtNum(n, dec)` 和 `fmtShares(n, isUs)` 統一格式化

## iOS Safari 相容性
- 所有表單元素加 `appearance: none; border-radius: 0;` 避免 Safari 自動加圓角
- 字體大小 ≥ 16px 避免 iOS focus 時自動縮放
- 容器加 `overflow-hidden` 和 `min-w-0` 防止內容溢出
- 長文字用 `break-all` 或 `break-words`

## 手機版 RWD
- 主要斷點: `@media(max-width:600px)`
- Grid layout 在手機上要減少欄數（例 `calc-row` 從 6 欄改 3 欄）
- 測試時用 375px 寬度驗證

## 搜尋邏輯
- 台股搜尋: 從 `twDataCache` 中以代碼或名稱（中文）比對，支援雙向搜尋
- 美股搜尋: 打 Finnhub `/search` API，用代碼或公司名稱皆可
- 搜尋使用 300ms debounce，結果最多顯示 10 筆
- 計算器和持股新增各有獨立的搜尋下拉元件（ID prefix 不同：modal 用 `sym-/drop-`，calculator 用 `csym-/cdrop-` 和 `cname-/cndrop-`）

# UI 設計規範

## 深色主題（目前使用，Resend 風格）

```css
:root {
  --bg: #000;           /* 近黑背景 */
  --surface: #0a0a0a;   /* 卡片/容器 */
  --surface2: #111;     /* 次要表面 */
  --border: #1a1a1a;    /* 極淡邊框 */
  --text: #fafafa;      /* 主要文字 */
  --dim: #71717a;       /* 次要文字/label */
  --profit: #f85149;    /* 虧損（紅） */
  --loss: #3fb950;      /* 獲利（綠） */
  --accent: #a1a1aa;    /* 互動元素 */
  --warn: #d29922;      /* 警告 */
  --del: #f85149;       /* 刪除 */
  --radius: 8px;        /* 統一圓角 */
}
```

- **按鈕**: 主要 = 白底黑字 (`background:#fff; color:#000`)，ghost = 透明+邊框
- **字體**: Inter → system stack，`letter-spacing: -0.01em`
- **卡片**: `border-radius: 12px`，微弱邊框 `1px solid var(--border)`
- **Header**: 半透明背景 `rgba(0,0,0,.85)` + `backdrop-filter: blur(12px)`
- **表格 hover**: `rgba(255,255,255,.02)`

## 淺色主題（備用，極簡暖灰風格）

```css
:root {
  --bg: #f5f3ef;        /* 暖灰背景 */
  --surface: #ffffff;   /* 卡片白底 */
  --surface2: #f0ede8;  /* 次要表面 */
  --border: #e0ddd8;    /* 邊框 */
  --text: #1a1a1a;      /* 主要文字 */
  --dim: #8a8580;       /* 次要文字 */
  --profit: #dc2626;    /* 虧損 */
  --loss: #16a34a;      /* 獲利 */
  --accent: #1a1a1a;    /* 互動元素 */
  --warn: #ca8a04;      /* 警告 */
  --del: #dc2626;       /* 刪除 */
  --radius: 0px;        /* 無圓角，方正風格 */
}
```

- **按鈕**: 主要 = 黑底白字邊框，次要 = 灰邊框
- **字體**: Noto Sans TC，`font-light` 用於大標題
- **間距**: 寬鬆，`p-5 / gap-5`
- **Header**: 實體背景，底部 1px 邊框

## 共通設計原則
- 切換主題只需替換 `:root` CSS 變數，所有元件都透過 `var(--xxx)` 引用
- Tab bar: 底線指示器 (`border-bottom: 2px solid`)，active 狀態用主要文字色
- Modal: 半透明遮罩 + 居中卡片
- Toast: 固定右下角，fade-in 動畫
- 所有金額顯示千分位，profit/loss 用對應色彩標示
- **不使用 emoji** 於 UI 元素中（旗幟 emoji 用於區分台股/美股 section 除外）

# 頁面結構

## Tab 1: 持股總覽
- Header: 標題 + USD/TWD 匯率 + 更新報價按鈕 + 最後更新時間
- Summary cards: 台股市值 / 美股市值(TWD) / 總市值 / 總損益(TWD)
- 三個可摺疊 portfolio section（台股 / 台幣複委託美股 / 外幣複委託美股）
- 每個 section: 表格 + 新增按鈕 → Modal 多筆輸入

## Tab 2: 損益試算
- Header 同上（共用）
- 市場切換: 台股 / 美股 pill toggle
- 匯入持股按鈕（從 portfolio 帶入賣出列）
- 賣出區塊: 多筆（代碼 + 名稱 + 股數 + 現價 → 淨回金額 + 手續費/稅明細）
- 買入區塊: 同上結構
- 總結: 差額 = 賣出合計 − 買入合計（資金有餘 / 尚需補入）

# 常見問題排查

1. **價格載入失敗**: 檢查網路、API rate limit（Finnhub 免費版 60 req/min）、codetabs proxy 是否存活
2. **台股查無代碼**: 可能是 ETN、權證等非普通股，TWSE/TPEX API 不包含
3. **密碼解鎖失敗**: 確認 `build.py` 用的密碼與 loader 一致（目前 `0790`）
4. **本機伺服器啟動失敗**: 確認用 `/opt/homebrew/bin/python3`，非系統 Python
5. **GitHub Pages 未更新**: push 後等 1-2 分鐘，檢查 Actions tab 是否有部署
