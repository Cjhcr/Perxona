# IntAIview 部署指引 (Deployment Guide)

本專案支援多種生產級別部署方式：

---

## 方式 1：Docker 容器化部署 (推薦 VPS / 阿里雲 / AWS / GCP)

### 1. 使用 Docker Compose 一鍵啟動
```bash
# 確保目錄中有 .env，或直接使用預設配置
docker compose up -d --build
```
服務將運行於 `http://your-server-ip:8083`。

### 2. 單獨建置並執行 Docker 映像
```bash
docker build -t intaiview:latest .
docker run -d -p 8083:8083 \
  -e PERXONA_API_BASE_URL="https://console.perxona.ai/asia" \
  -e PERXONA_CONNECT_SECRET_KEY="your_secret_key" \
  -e PERXONA_CONNECT_PUBLISHABLE_KEY="your_publishable_key" \
  intaiview:latest
```

---

## 方式 2：Render 一鍵部署 (免費 / 快速)

1. 前往 [Render.com](https://render.com/) 並登入。
2. 點擊 **New +** > **Web Service**。
3. 連接 GitHub 倉庫：`https://github.com/Cjhcr/Perxona`。
4. 設定參數：
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. 在 **Environment Variables** 新增：
   - `PERXONA_API_BASE_URL`: `https://console.perxona.ai/asia`
   - `PERXONA_CONNECT_SECRET_KEY`: `你的 Secret Key`
   - `PERXONA_CONNECT_PUBLISHABLE_KEY`: `你的 Publishable Key`
6. 點擊 **Deploy Web Service** 即可獲得免費 HTTPS 公開網址。

---

## 方式 3：Railway / Zeabur / Koyeb 部署

1. 登入 [Railway.app](https://railway.app/) 或 [Zeabur.com](https://zeabur.com/)。
2. 選擇 **Deploy from GitHub repo**，選取 `Cjhcr/Perxona`。
3. 平台會自動偵測 `Dockerfile` 或 `package.json` 並完成建置。
4. 在環境變數中填入你的 Perxona Key 即可。

---

## 方式 4：Vercel 部署

1. 前往 [Vercel.com](https://vercel.com/) > **Add New Project**。
2. Import `Cjhcr/Perxona`。
3. 在專案設定中的 **Environment Variables** 填入相關 Key。
4. 點擊 **Deploy**。

---

## 必要環境變數清單 (Environment Variables)

| 變數名稱 | 說明 | 範例值 |
|---|---|---|
| `PORT` | 服務監聽連接埠 | `8083` (Render/Railway 會自動注入) |
| `NODE_ENV` | 執行環境 | `production` |
| `PERXONA_API_BASE_URL` | Perxona 控制台 API 網址 | `https://console.perxona.ai/asia` |
| `PERXONA_CONNECT_SECRET_KEY` | 後端 Secret Key (嚴禁洩漏至前端) | `pxc_01M16A...` |
| `PERXONA_CONNECT_PUBLISHABLE_KEY` | 前端 Publishable Key | `pxc_01M16A...` |
| `PRESENTER_URL` | 3D Presenter SDK CDN 網址 | `https://cdn.perxona.ai/asia/prod/latest/widget/entry/presenter.js` |
| `DEMO_FIXED_CHATBOT_ID` | 綁定的 Chatbot ID | `01M15PZSM33DH1GE5HE01N086K` |
