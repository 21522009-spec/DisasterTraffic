# DisasterTraffic AI Service

Service Python chạy độc lập với backend Node.js. Nhiệm vụ:

1. Pull danh sách camera `active` từ backend (`GET /api/cameras`).
2. Mỗi camera spawn 1 worker đọc stream, chạy YOLOv8 detect.
3. Khi phát hiện sự kiện → POST `/api/alerts` (kèm `x-api-key`).
4. Backend lưu Mongo + emit Socket.IO → web/app cập nhật realtime.

---

## Yêu cầu

- Python **3.10+** (mình đã test 3.11/3.12)
- Backend (DisasterTrafficWeb) đang chạy
- ~6 MB cho YOLOv8n model (tự download lần đầu)

## Cài đặt

```powershell
cd D:\study\DisasterTraffic\aiService

# Tạo virtual env
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# Cài deps (lần đầu sẽ tải opencv, ultralytics ~500MB)
pip install -r requirements.txt
```

## Cấu hình

```powershell
Copy-Item .env.example .env
```

Mở `.env`, sửa:
- `AI_WEBHOOK_SECRET` = đúng giá trị trong `DisasterTrafficWeb/.env`
- `DETECTOR=yolo` (mặc định) — hoặc `mock` để test pipeline không cần video
- `TRAFFIC_VEHICLE_THRESHOLD=8` — số xe trong frame để coi là "kẹt xe", chỉnh tuỳ video

## Chuẩn bị video test

Tạo thư mục `videos/` (nếu chưa có) và bỏ file MP4 vào:

```
aiService/
├── videos/
│   ├── default.mp4         ← fallback nếu không tìm thấy file riêng
│   ├── hang-xanh.mp4       ← tên file khớp với streamUrl của camera
│   ├── nguyen-huu-canh.mp4
│   ├── cau-saigon.mp4
│   ├── cong-hoa.mp4
│   └── phu-lam.mp4
```

Cách lấy video nhanh:
1. Tìm trên YouTube từ khoá "camera giao thông TP HCM Hàng Xanh", "kẹt xe Sài Gòn"
2. Tải bằng [yt-dlp](https://github.com/yt-dlp/yt-dlp) hoặc các site online (savefrom, y2mate)
3. Chỉ cần 1 video duy nhất tên `default.mp4` cũng đủ — code sẽ fallback dùng nó cho mọi camera

Hoặc dùng video stock free:
- [Pixabay](https://pixabay.com/videos/search/traffic/)
- [Pexels](https://www.pexels.com/search/videos/traffic/)

Chỉ cần MP4 có nhiều xe trong khung hình → YOLO sẽ trigger event "traffic".

## Chạy

```powershell
# Đảm bảo backend đang chạy ở terminal khác
python main.py
```

Lần đầu sẽ thấy:
```
Backend: http://localhost:3000
[supervisor] Active workers: 5
Đang load YOLO general model: yolov8n.pt (lần đầu sẽ download ~6MB)...
YOLO general model đã sẵn sàng.
[worker:Ngã 4 Hàng Xanh] đã mở source: D:\...\videos\hang-xanh.mp4
[worker:Ngã 4 Hàng Xanh] started (interval=20s, cooldown=60.0s, detector=yolo)
[worker:Ngã 4 Hàng Xanh] tick — no event
[worker:Cầu Sài Gòn] 🚨 DETECTED traffic (conf=0.78, sev=3) — YOLO phát hiện 11 phương tiện trong frame
[worker:Cầu Sài Gòn] alert posted (id=68xxxxxx)
```

Mở web `http://localhost:3000` hoặc app — marker tự pin lên map.

---

## Tinh chỉnh

**Detect quá nhiều / quá ít:** sửa `TRAFFIC_VEHICLE_THRESHOLD` trong `.env`. Video ngã 4 lúc cao điểm có 15-20 xe → set 12. Video ít xe set 5.

**Detect chậm:** đổi sang `YOLO_MODEL=yolov8n.pt` (nano, nhanh nhất, mặc định). Model `yolov8s/m/l` chính xác hơn nhưng cần GPU.

**Cooldown spam:** mỗi camera có `cooldownMs` riêng (mặc định 60_000 = 1 phút). Sửa qua API:
```
PATCH /api/cameras/:id  { "cooldownMs": 30000 }
```

**Tắt detect, chỉ test pipeline:** `DETECTOR=mock` trong `.env` → quay lại random alerts.

---

## Thêm fire detection (optional)

YOLOv8 COCO không có class fire/smoke. Để detect fire thật:

1. Tải model fire pre-trained — ví dụ từ HuggingFace:
   - [`keremberke/yolov8m-fire-detection`](https://huggingface.co/keremberke/yolov8m-fire-detection)
   - Hoặc Roboflow Universe có nhiều dataset fire/smoke
2. Đặt file `.pt` vào `aiService/models/` (vd: `models/fire-yolov8.pt`)
3. Thêm vào `.env`:
   ```
   FIRE_MODEL_PATH=models/fire-yolov8.pt
   ```
4. Restart AI service.

## Khi nào chuyển sang detect thật stream HCM CCTV

Khi đã có URL stream RTSP/HTTP của camera CCTV TP.HCM:

1. Update `streamUrl` của camera qua API:
   ```
   PATCH /api/cameras/:id  { "streamUrl": "rtsp://..." }
   ```
2. AI service tự pick up trong vòng `CAMERA_REFRESH_SECONDS` giây.
3. `video_reader.py` đã hỗ trợ sẵn `rtsp://`, `http://`, `https://`, `webcam:0`.
