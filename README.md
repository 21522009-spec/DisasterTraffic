# DisasterTraffic

Hệ thống cảnh báo **thiên tai** (cháy, ngập lụt, sạt lở...) và **giao thông** (kẹt xe) cho TP.HCM. Dữ liệu cảnh báo được tổng hợp từ:

- **AI Service** chạy YOLOv8 detect kẹt xe / cháy từ video CCTV / livestream
- **Cộng đồng** báo cáo qua web hoặc mobile app
- **Crawler** ingest từ các nguồn ngoài (USGS earthquake, NASA EONET, ...)

Hiển thị realtime trên **web** (Leaflet) và **mobile app** (Expo + react-native-maps).

---

## Kiến trúc

```
                  ┌──────────────────────┐
                  │  AI Service (Python) │  ← YOLO + camera registry + YT hunter
                  └──────────┬───────────┘
                             │ POST /api/alerts (x-api-key)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  Backend (Node.js + Express + Socket.IO + MongoDB Atlas)    │
│  - REST: /api/alerts, /api/cameras, /api/devices            │
│  - Realtime: Socket.IO 'new-alert', 'camera:*'              │
│  - Push: Expo Push Service                                  │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────┴─────────────┐
        ▼                          ▼
┌──────────────────┐       ┌──────────────────────┐
│  Web (Leaflet)   │       │ Mobile (Expo / RN)   │
│ - Map + alerts   │       │ - Map + alerts       │
│ - Admin camera   │       │ - Push notification  │
│ - Community rpt  │       │ - Community report   │
└──────────────────┘       └──────────────────────┘
```

## Cấu trúc thư mục

```
DisasterTraffic/
├── DisasterTrafficWeb/   # Backend Node.js + Web frontend (Leaflet)
├── appDisasterTraffic/   # Mobile app (Expo + React Native)
├── aiService/            # AI Service (Python + YOLO + Expo Push trigger)
└── README.md             # File này
```

---

## Quick start (máy mới)

Yêu cầu chung:
- **Node.js 18+** ([nodejs.org](https://nodejs.org))
- **Python 3.10+** ([python.org](https://www.python.org/downloads/))
- **Tài khoản MongoDB Atlas** miễn phí ([cloud.mongodb.com](https://cloud.mongodb.com))
- **ngrok** (free tier, [ngrok.com](https://ngrok.com))

### 1. Clone repo

```powershell
cd D:\study
git clone <your-repo-url> DisasterTraffic
cd DisasterTraffic
```

### 2. Setup backend

```powershell
cd DisasterTrafficWeb
npm run setup
```

Script sẽ:
- Check Node version
- Tự `npm install`
- Copy `.env.example` → `.env`
- In ra checklist các giá trị cần điền

Sau đó mở `.env` điền:
- `MONGO_URI` — connection string Atlas
- `TOMTOM_KEY` — TomTom API key (lấy ở [developer.tomtom.com](https://developer.tomtom.com))
- `AI_WEBHOOK_SECRET` — chuỗi random 64 ký tự (xem README riêng để biết cách generate)

Khởi động:
```powershell
npm run dev
```

### 3. Setup AI service

```powershell
cd ..\aiService
.\setup.ps1
```

Script sẽ:
- Check Python version
- Tạo `.venv` virtual env
- `pip install` deps
- Copy `.env.example` → `.env`

Sau đó:
1. Mở `.env`, đặt `AI_WEBHOOK_SECRET` giống backend
2. (Optional) Copy fire detection model `best.pt` vào `models/`
3. (Optional) Tải video MP4 vào `videos/default.mp4` để test traffic detection

Khởi động:
```powershell
.\.venv\Scripts\Activate.ps1
python main.py
```

### 4. Setup mobile app

```powershell
cd ..\appDisasterTraffic
npm install
```

Cập nhật `app.json` → `extra.serverUrl` cho khớp ngrok URL của backend.

Có 2 cách chạy app:

**a) Dùng Expo Go (phát triển nhanh):**
```powershell
npx expo start
```
Quét QR bằng Expo Go.

**b) Build APK standalone (không cần Expo Go):**

Xem [`appDisasterTraffic/BUILD.md`](./appDisasterTraffic/BUILD.md) — dùng EAS Build (cloud) để có APK cài trực tiếp.

### 5. Expose backend qua ngrok (cho mobile test)

```powershell
ngrok http 3000
```

Copy URL https → cập nhật:
- `appDisasterTraffic/app.json` → `extra.serverUrl`
- `DisasterTrafficWeb/.env` → `ALLOWED_ORIGINS` (thêm URL ngrok)

Restart backend + Expo sau khi sửa.

---

## Dev daily workflow

Sau khi setup xong, mỗi ngày dev cần 4 terminal:

| Terminal | Lệnh | Mô tả |
|---|---|---|
| 1 | `cd DisasterTrafficWeb && npm run dev` | Backend |
| 2 | `ngrok http 3000` | Expose port 3000 |
| 3 | `cd aiService && .\.venv\Scripts\Activate.ps1 && python main.py` | AI service |
| 4 | `cd appDisasterTraffic && npx expo start` | Mobile dev server |

Mở `http://localhost:3000` xem web. Quét QR mở app trên phone.

---

## URLs hữu ích

| Endpoint | Mô tả |
|---|---|
| `http://localhost:3000` | Web frontend (map + alerts) |
| `http://localhost:3000/admin.html` | Admin panel (camera CRUD) |
| `http://localhost:3000/api/health` | Health check |
| `http://localhost:3000/api/alerts` | List alerts |
| `http://localhost:3000/api/cameras` | List cameras |
| `http://localhost:3000/api/devices/count` | Đếm số device đã register push |

---

## Documentation chi tiết

- [`DisasterTrafficWeb/README.md`](./DisasterTrafficWeb/README.md) — backend & web
- [`aiService/README.md`](./aiService/README.md) — AI service & YOLO setup
- [`appDisasterTraffic/BUILD.md`](./appDisasterTraffic/BUILD.md) — build APK standalone

---

## Tech stack

**Backend:** Node.js, Express, Socket.IO, Mongoose, MongoDB Atlas, helmet, cors, express-rate-limit

**Web frontend:** Leaflet, Tailwind CSS (CDN), vanilla JS

**Mobile:** Expo SDK 54, React Native 0.81, Expo Router, react-native-maps, socket.io-client, expo-notifications

**AI Service:** Python 3.10+, OpenCV, Ultralytics YOLOv8, vidgear, httpx, loguru, google-api-python-client

**Deploy options:** Railway, Render, Fly.io (backend), EAS Build (mobile), Docker Compose (chưa setup)

---
