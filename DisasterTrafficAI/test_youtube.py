import cv2
import requests
import time
from ultralytics import YOLO
from vidgear.gears import CamGear

# 1. GỌI BỘ NÃO AI VÀ KHỞI TẠO NGROK
model = YOLO('best.pt')
api_url = "https://constance-unproclaimed-maryland.ngrok-free.dev/api/alerts"
# 2. CÀI ĐẶT NGUỒN YOUTUBE / FACEBOOK
# Dán link video hoặc luồng Live stream vào đây để test.
video_url = "https://www.youtube.com/shorts/pxZjypF9kps"

print("Đang phân tích link YouTube... Vui lòng đợi vài giây để lấy luồng!")

# Ép chất lượng video xuống 720p hoặc 480p để AI xử lý mượt hơn, tránh giật lag
options = {"STREAM_RESOLUTION": "720p"} 

# Kích hoạt CamGear (stream_mode=True chuyên trị các luồng Live trực tiếp)
stream = CamGear(source=video_url, stream_mode=True, logging=True, **options).start()

last_alert_time = 0

# 3. VÒNG LẶP CHO AI QUÉT VIDEO
while True:
    # Hút từng khung hình từ YouTube về
    frame = stream.read()
    
    # Nếu rớt mạng hoặc hết video thì thoát
    if frame is None:
        print("Đã hết video hoặc rớt mạng!")
        break

    # Ép AI quét khung hình
    results = model(frame, conf=0.40, verbose=False)

    # Kiểm tra xem AI có thấy chữ 'fire' không
    detected_fire = False
    for r in results:
        for box in r.boxes:
            if model.names[int(box.cls[0])] == 'fire':
                detected_fire = True
                break

    # 4. GỬI CẢNH BÁO LÊN ĐIỆN THOẠI
    current_time = time.time()
    # Nếu phát hiện cháy, và đã trôi qua ít nhất 10 giây kể từ lần cảnh báo trước
    if detected_fire and (current_time - last_alert_time > 10):
        print("🔥 PHÁT HIỆN LỬA TỪ YOUTUBE! Đang gửi tọa độ về App...")
        
        # Giả lập tọa độ cho nguồn video YouTube này
        data = {
            "type": "fire",
            "address": "Cảnh báo từ YouTube Live",
            "lat": 10.7940,  # Có thể đổi tọa độ tùy ý để test ghim trên bản đồ
            "lng": 106.7218
        }
        
        try:
            requests.post(api_url, json=data)
            print("✅ Đã cập nhật lên App thành công!")
            last_alert_time = current_time
        except Exception as e:
            print(f"❌ Lỗi kết nối Backend: {e}")

    # Vẽ khung đỏ và hiển thị màn hình
    annotated_frame = results[0].plot()
    cv2.imshow("YouTube AI Monitor", annotated_frame)

    # Bấm phím 'q' để tắt
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

# 5. DỌN DẸP
cv2.destroyAllWindows()
stream.stop()