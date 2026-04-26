import requests
import time
from googleapiclient.discovery import build
from ultralytics import YOLO
from vidgear.gears import CamGear


# CẤU HÌNH HỆ THỐNG
YOUTUBE_API_KEY = "AIzaSyD_T-8t388wXCpbq8jDlNF8d1eHHB1X8jE"
NGROK_API_URL = "https://constance-unproclaimed-maryland.ngrok-free.dev/api/alerts" 
SEARCH_KEYWORDS = "cháy lớn|hỏa hoạn|cháy nhà trực tiếp" #Các từ khóa để tìm kiếm video liên quan đến cháy trên YouTube

# Khởi tạo AI
print("🧠 Đang nạp bộ não YOLOv8...")
model = YOLO('best.pt')
# Pre-resolve 'fire' class ID for performance optimization
fire_class_id = next((k for k, v in model.names.items() if v == 'fire'), None)
youtube_client = build('youtube', 'v3', developerKey=AIzaSyD_T-8t388wXCpbq8jDlNF8d1eHHB1X8jE)

# Bộ nhớ tạm để không quét lại video đã báo cáo
processed_videos = set() 

# HÀM 1: TÌM KIẾM VIDEO TRÊN YOUTUBE
def find_latest_fire_videos():
    print(f"\n🔍 Đang lùng sục YouTube với từ khóa: {SEARCH_KEYWORDS}")
    try:
        request = youtube_client.search().list(
            part="snippet",
            q=SEARCH_KEYWORDS,
            type="video",
            eventType="live", # Chỉ tìm các video ĐANG LIVESTREAM
            maxResults=3,     # Lấy 3 kết quả mới nhất để check
            regionCode="VN"   # Chỉ tìm ở Việt Nam
        )
        response = request.execute()
        
        video_links = []
        for item in response['items']:
            vid_id = item['id']['videoId']
            title = item['snippet']['title']
            if vid_id not in processed_videos:
                video_links.append((vid_id, title))
                
        return video_links
    except Exception as e:
        print(f"❌ Lỗi khi tìm kiếm YouTube: {e}")
        return []

# HÀM 2: AI KIỂM TRA ĐỘ CHÍNH XÁC CỦA VIDEO TRONG TRƯỜNG HỢP CẦN TEST
def verify_fire_with_ai(video_id, title):
    video_url = f"https://www.youtube.com/watch?v={video_id}"
    print(f"👁️ AI đang soi video: {title}")
    
    try:
        # Mở luồng video chất lượng thấp 
        options = {"STREAM_RESOLUTION": "480p"}
        stream = CamGear(source=video_url, stream_mode=True, logging=False, **options).start()
        
        fire_confirmed = False
        frame_count = 0
        
        # Cho AI xem tối đa 100 khung hình (khoảng 3-4 giây) của Livestream
        while frame_count < 100:
            frame = stream.read()
            if frame is None: break
                
            results = model(frame, conf=0.45, verbose=False)
            
            # Kiểm tra xem có khung 'fire' nào không
            for r in results:
                for box in r.boxes:
                    if int(box.cls[0]) == fire_class_id:
                        fire_confirmed = True
                        break
            if fire_confirmed: break
            frame_count += 1
            
        stream.stop()
        return fire_confirmed
        
    except Exception as e:
        print(f"⚠️ Không thể đọc luồng video này, bỏ qua: {e}")
        return False

# HÀM 3: GỬI CẢNH BÁO LÊN APP
def send_alert_to_app(title, video_url):
    print("🚨 XÁC NHẬN CÓ CHÁY! Đang bắn thông báo lên App...")
    data = {
        "type": "fire",
        "address": f"Phát hiện từ mạng xã hội: {title}",
        "lat": 10.8700, # Tọa độ giả định (ví dụ khu vực UIT)
        "lng": 106.8031,
        "sourceLink": video_url # Gửi kèm link để người dùng bấm vào xem
    }
    try:
        requests.post(NGROK_API_URL, json=data)
        print("✅ Đã cập nhật bản đồ thành công!")
    except Exception as e:
        print(f"❌ Lỗi kết nối Node.js: {e}")

# VÒNG LẶP CHÍNH (CHẠY 24/7)
print("🚀 HỆ THỐNG THỢ SĂN LỬA ĐÃ KHỞI ĐỘNG!")
while True:
    # 1. Tìm video
    new_videos = find_latest_fire_videos()
    
    if not new_videos:
        print("Trời yên biển lặng. Đang ngủ 3 phút...")
    else:
        # 2. Đưa AI vào kiểm tra từng video
        for vid_id, title in new_videos:
            processed_videos.add(vid_id) # Đánh dấu đã kiểm tra
            
            is_real_fire = verify_fire_with_ai(vid_id, title)
            
            if is_real_fire:
                video_url = f"https://www.youtube.com/watch?v={vid_id}"
                send_alert_to_app(title, video_url)
            else:
                print("🧐 Cảnh báo giả (Không thấy lửa thật). Bỏ qua.")
                
    # 3. Nghỉ ngơi 3 phút trước khi đi quét mạng xã hội lần tiếp theo
    # Điều này giúp không bị Google khóa API vì over request
    time.sleep(180)