# Video files cho AI service

Đặt các file MP4 vào đây để AI worker đọc.

## Tên file (khớp với streamUrl của 5 camera đã seed)

```
hang-xanh.mp4
nguyen-huu-canh.mp4
cau-saigon.mp4
cong-hoa.mp4
phu-lam.mp4
```

Nếu thiếu file nào, worker sẽ fallback sang `default.mp4`.

## Cách lấy video nhanh

**Cách 1 — Stock video free:**
- [Pixabay videos: traffic](https://pixabay.com/videos/search/traffic/)
- [Pexels videos: traffic](https://www.pexels.com/search/videos/traffic/)

**Cách 2 — Tải từ YouTube:**
- Cài `yt-dlp`: `pip install yt-dlp`
- Lệnh: `yt-dlp -f mp4 -o "default.mp4" <youtube_url>`

**Cách 3 — Webcam laptop:**
- Trong DB camera, đổi `streamUrl` thành `webcam:0` (qua PATCH API).

## Tip

Chỉ cần **1 file `default.mp4`** với cảnh giao thông đông đúc là đủ để demo —
cả 5 camera sẽ cùng đọc file đó (mỗi worker mở instance riêng).

Sau này khi có stream RTSP thật, đổi `streamUrl` qua API là xong, không cần file MP4 nữa.
