# Hướng dẫn cài đặt và chạy

Project gồm 3 thành phần: backend Node.js, AI service Python và mobile Expo.

## Yêu cầu

- Node.js 18 LTS trở lên
- Python 3.10 trở lên
- Git
- MongoDB Atlas (free tier) — https://cloud.mongodb.com
- Google AI Studio API key (Gemini, free) — https://aistudio.google.com/app/apikey
- TomTom developer key (tuỳ chọn, dùng cho traffic tile)
- YouTube Data API key (tuỳ chọn, dùng cho YouTube hunter)

## Cài tự động

Sau khi `git clone`, từ thư mục root chạy:

Windows:
```powershell
.\setup.ps1
```

macOS / Linux:
```bash
bash setup.sh
```

Script sẽ chạy `npm install` cho backend và mobile, tạo Python venv và cài requirements cho AI service, copy `.env.example` thành `.env` ở những chỗ chưa có.

## Điền các file `.env` (làm thủ công)

### `DisasterTrafficWeb/.env`

```
MONGO_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/disaster_traffic
JWT_SECRET=<chuỗi random ≥ 32 ký tự>
AI_WEBHOOK_SECRET=<chuỗi random ≥ 32 ký tự, dùng chung với aiService>
TOMTOM_KEY=<key TomTom nếu có>
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8081
```

Sinh chuỗi random nhanh trên PowerShell:
```powershell
-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 64 | ForEach-Object { [char]$_ })
```

### `aiService/.env`

```
BACKEND_URL=http://localhost:3000
AI_WEBHOOK_SECRET=<KHỚP với backend>
DETECTOR=yolo
FIRE_MODEL_PATH=models/best.pt

GOOGLE_API_KEY=<key Gemini, lấy ở aistudio.google.com>

ENABLE_YOUTUBE_HUNTER=true
YOUTUBE_API_KEY=<key Google Cloud Console>
YOUTUBE_POLL_INTERVAL_SECONDS=1800

ENABLE_RSS_HUNTER=true
```

### `appDisasterTraffic/app.json`

Tìm key `extra.serverUrl`. Nếu test trên simulator cùng máy thì giữ `http://localhost:3000`. Nếu test trên thiết bị thật hoặc build APK thì đổi sang URL ngrok HTTPS hoặc URL backend đã deploy.

## Chạy 3 thành phần

Mở 3 terminal riêng:

| Terminal | Lệnh |
|---|---|
| backend | `cd DisasterTrafficWeb` rồi `npm run dev` |
| AI service | `cd aiService` rồi `.\.venv\Scripts\Activate.ps1` (Windows) hoặc `source .venv/bin/activate` (Unix), sau đó `python main.py` |
| mobile | `cd appDisasterTraffic` rồi `npx expo start` |

Backend nên start trước. AI service log sẽ báo connect được backend.

## Seed camera mẫu (lần đầu)

Để có dữ liệu camera trong database:

```powershell
cd DisasterTrafficWeb
npm run seed:cameras
```

Reset và seed lại:

```powershell
npm run seed:cameras:reset
```

## Test mobile trên thiết bị Android thật (qua ngrok)

Backend chạy ở `localhost:3000` không reach được từ phone. Dùng ngrok tunnel:

```powershell
npm install -g ngrok
ngrok config add-authtoken <token từ ngrok.com>
ngrok http 3000
```

Ngrok in ra URL kiểu `https://abc-123.ngrok-free.app`. Copy vào:
- `appDisasterTraffic/app.json` → `extra.serverUrl`
- `DisasterTrafficWeb/.env` → thêm vào `ALLOWED_ORIGINS`

Restart Expo (gõ `r` trong terminal Expo). Quét QR bằng Expo Go.

## Build APK Android

Project đã có sẵn `eas.json` với profile `preview` build APK.

Lần đầu:
```powershell
npm install -g eas-cli
eas login
cd appDisasterTraffic
eas build:configure
```

Trước khi build, đặt `app.json` → `extra.serverUrl` thành URL backend public ổn định (deploy lên Railway / Render hoặc ngrok với plan trả phí). Backend phải đang chạy và reachable từ internet khi user dùng app.

Build:
```powershell
cd appDisasterTraffic
npm run build:android:preview
```

EAS sẽ build trên cloud, mất 10-15 phút. Khi xong console in URL APK kiểu:
```
https://expo.dev/artifacts/eas/abc123def.apk
```

Tải file về, gửi cho user. Trên Android phone:
1. Settings → cho phép cài từ "unknown sources"
2. Mở file APK → Install
3. Mở app, cấp quyền notification

Mỗi lần đổi `serverUrl` hoặc code mobile cần build lại. Hoặc dùng OTA update để chỉ push code JS:

```powershell
eas update --branch preview --message "fix bug"
```

User mở app lần sau sẽ tự nhận update.

## Cấu trúc thư mục

```
DisasterTraffic/
├── setup.ps1               Script cài tự động cho Windows
├── setup.sh                Script cài tự động cho Unix
├── SETUP.md                File này
│
├── DisasterTrafficWeb/     Backend Node.js + frontend Leaflet
│   ├── server.js
│   ├── routes/
│   ├── models/
│   ├── services/
│   ├── middleware/
│   ├── public/             index.html, login.html, admin.html
│   └── scripts/            setup.js, seedCameras.js
│
├── aiService/              Python AI service
│   ├── main.py
│   ├── workers/            camera_worker, youtube_hunter, rss_hunter
│   ├── detectors/          yolo, mock, vision_llm
│   ├── services/           location_extractor, geocoder, location_ner
│   ├── models/best.pt      YOLO fire model
│   └── requirements.txt
│
└── appDisasterTraffic/     Mobile Expo
    ├── app.json, eas.json
    ├── app/                Screens (Expo Router)
    ├── lib/                api, auth, socket, notifications
    └── package.json
```

## Lỗi hay gặp

| Triệu chứng | Cách sửa |
|---|---|
| `setup.ps1` không chạy: "running scripts is disabled" | `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser` |
| Backend báo `JWT_SECRET vẫn là placeholder` | Đổi sang chuỗi random thật trong `.env` |
| `AI_WEBHOOK_SECRET` mismatch | Hai file `.env` (backend + aiService) phải có cùng giá trị |
| Mobile báo connection failed | Kiểm tra `app.json` serverUrl, kiểm tra ngrok còn chạy không |
| YouTube hunter `quotaExceeded` | Tăng `YOUTUBE_POLL_INTERVAL_SECONDS=1800` hoặc dùng API key khác |
| Vision LLM 404 model | Để trống `GEMINI_MODEL` cho code tự fallback, hoặc set `GEMINI_MODEL=gemini-2.0-flash` |
| EAS build báo "missing eas.json" | `cd appDisasterTraffic && eas build:configure` |
| APK install xong mở không có data | Backend phải reachable từ internet (deploy hoặc ngrok đang chạy) |
