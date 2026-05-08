# Build app standalone (không cần Expo Go)

App này có thể chạy độc lập sau khi build APK. Hướng dẫn dùng **EAS Build** (cloud build của Expo) để có APK Android cài lên điện thoại.

## Yêu cầu

- Tài khoản expo.dev (miễn phí, đăng ký tại https://expo.dev/signup)
- EAS CLI cài global

## Setup lần đầu (chỉ làm 1 lần)

```powershell
# Cài EAS CLI global
npm install -g eas-cli

# Đăng nhập
eas login
# → nhập username/password expo.dev

# Cài expo-dev-client trong project (đã thêm sẵn vào package.json)
npm install

# Init project trên cloud (tạo projectId, lưu vào app.json)
eas init
# → chọn account, đặt tên project, đợi khoảng 30s
```

## Có 3 loại build, chọn theo nhu cầu

### 1. Development build (cho dev hằng ngày)

Tạo APK có "Dev Client" — vẫn kết nối được Metro để hot reload, nhưng **không cần Expo Go**. Tất cả native module custom đều có. Chỉ cần build 1 lần, sau đó dev cứ `npm run start:dev-client`.

```powershell
npm run build:android:dev
```

Đợi 10-20 phút (build trên cloud). Khi xong:
1. Mở link build trên web browser
2. Scan QR ở trang đó để cài APK lên phone (hoặc download APK + sideload)
3. Mở app vừa cài → bấm "Enter URL manually" → nhập URL Metro (`exp://10.x.x.x:8081`)
4. App hoạt động như Expo Go nhưng là project riêng của bạn

Sau đó mỗi lần dev chỉ cần:
```powershell
npm run start:dev-client
```
→ mở app dev đã cài, app tự kết nối Metro. Hot reload OK.

### 2. Preview build (cho demo / share)

APK standalone, không cần Metro server, chạy hoàn toàn độc lập với code đã bundle sẵn.

```powershell
npm run build:android:preview
```

Sau khi build xong → tải APK → cài lên phone → mở app là chạy ngay.
Phù hợp để **gửi APK cho team / giảng viên / demo seminar**.

### 3. Production build (cho App Store / Play Store)

Build app bundle (`.aab`) để upload Play Store hoặc IPA cho App Store.

```powershell
npm run build:android:prod
```

Cần cấu hình thêm trong `eas.json` cho App Store specifics.

## Xem danh sách builds đã làm

```powershell
npm run build:list
```

Hoặc vào https://expo.dev/accounts/<your_account>/projects/DisasterTrafficApp/builds

## Quota

EAS Build free tier:
- **30 builds/tháng** Android
- **30 builds/tháng** iOS
- Đủ cho student MVP. Đừng spam build.

## Build cho iOS

iOS phức tạp hơn vì cần:
- Apple Developer account ($99/năm)
- Provisioning profile

Nếu chỉ test trên 1-2 iPhone:
```powershell
npm run build:ios:dev
```
EAS sẽ hỏi Apple ID → tạo provisioning tự động → build IPA → cài qua TestFlight hoặc sideload qua AltStore.

## Troubleshooting

**"projectId is missing":** chạy `eas init` ở thư mục `appDisasterTraffic`.

**"Build failed: Java heap space":** EAS server overload, chờ vài phút rồi build lại.

**App cài rồi nhưng không kết nối được server:** kiểm tra `app.json` → `extra.serverUrl` trỏ đúng ngrok URL hiện tại. Thay đổi giá trị này → cần build lại (vì giá trị đã bake vào bundle).

**Quota hết:** chuyển sang local build với Android Studio (xem README chính), hoặc đợi sang tháng sau.
