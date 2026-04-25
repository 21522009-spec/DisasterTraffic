# Hướng dẫn Cài đặt & Chạy tính năng DisasterTraffic

Dưới đây là các bước để cài đặt và chạy tính năng cảnh báo thiên tai tự động (Hỏa hoạn & Ngập lụt).

## 1. Cài đặt Backend (DisasterTrafficWeb)

Bạn cần cài đặt thêm các thư viện sau:
- `node-cron` (dành cho lập lịch chạy tự động)
- `axios` (dùng để gọi API nếu sử dụng API thật)

Chạy lệnh sau trong thư mục `DisasterTrafficWeb`:
```bash
cd DisasterTrafficWeb
npm install node-cron axios
```

**Cấu hình API Keys**:
Mặc định hệ thống đang dùng dữ liệu mock (giả lập). Nếu bạn muốn dùng API thật, hãy mở `DisasterTrafficWeb/services/crawler.js`, uncomment logic gọi API và thêm các biến môi trường vào `.env`:
```
NEWS_API_KEY=your_news_api_key_here
YOUTUBE_API_KEY=your_youtube_api_key_here
```

Chạy server Backend:
```bash
npm run dev
```

## 2. Cài đặt Frontend (DisasterTrafficApp)

Bạn cần cài đặt các thư viện sau cho ứng dụng di động React Native:
- `react-native-maps` (thư viện bản đồ cho React Native)
- `axios` (gọi API HTTP)
- `socket.io-client` (kết nối WebSocket cho Real-time)

Chạy lệnh sau trong thư mục chứa App:
```bash
cd appDisasterTraffic/DisasterTrafficApp
npm install react-native-maps axios socket.io-client
```

> **Lưu ý quan trọng cho iOS**: Nếu bạn chạy trên iOS, sau khi cài đặt hãy chạy thêm lệnh cài Pods:
> `npx pod-install` hoặc `cd ios && pod install && cd ..`

**Cấu hình URL**:
Trong file `MapScreen.js` (`appDisasterTraffic/DisasterTrafficApp/components/MapScreen.js`), hãy thay đổi biến `BACKEND_URL` thành địa chỉ IP thực tế trên mạng LAN của máy bạn nếu bạn đang chạy ứng dụng qua mạng (VD: `http://192.168.1.50:3000`), vì Emulator hoặc thiết bị thật không thể truy cập `localhost` của máy vi tính theo cách thông thường.

Chạy ứng dụng:
```bash
npm start
# hoặc npx react-native run-android / run-ios
```
