# appDisasterTraffic

Mobile app (Expo / React Native) cho hệ thống DisasterTraffic — bản đồ realtime cảnh báo thiên tai và giao thông tại TP.HCM.

## Tính năng

- **Tab Home**: bản đồ MapView TP.HCM hiển thị marker cảnh báo (cháy, ngập, kẹt xe, động đất, sạt lở, bão) và camera; cập nhật realtime qua Socket.IO.
- **Tab Explore**: danh sách cảnh báo theo thời gian, pull-to-refresh, modal "+ Báo cáo" để gửi báo cáo cộng đồng.
- **Push notifications**: Expo push token được đăng ký với backend kèm bbox + loại sự kiện đã subscribe.

## Yêu cầu

- Node.js LTS, Expo Go (hoặc dev/preview build) trên thiết bị
- Backend `DisasterTrafficWeb` đang chạy (mặc định `http://localhost:3000`)

## Chạy dev

```bash
npm install
npx expo start
```

Quét QR bằng Expo Go (Android) hoặc Camera (iOS).

## Cấu hình server URL

`app.json` → `extra.serverUrl`. Khi test trên thiết bị thật, dùng ngrok và dán URL HTTPS vào đây:

```bash
ngrok http 3000
```

## Build APK qua EAS

```bash
npm run build:android:preview   # APK preview
npm run build:android:prod      # APK production
```

## Cấu trúc

```
app/                 Expo Router (file-based)
  (tabs)/index.tsx   Map screen
  (tabs)/explore.tsx Alerts list + community report
lib/                 api.ts, socket.ts, notifications.ts, types.ts, config.ts
components/          UI components
hooks/               useColorScheme
```
