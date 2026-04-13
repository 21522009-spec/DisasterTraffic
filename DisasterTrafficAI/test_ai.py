from ultralytics import YOLO
import cv2

# 1. Gọi bộ não AI 
# Hãy chắc chắn rằng file 'best.pt' nằm cùng thư mục với file code này
model = YOLO('best.pt')

# 2. Định nghĩa file ảnh dùng để test
# nằm cùng thư mục này.
source_img = 'test_image.jpg'

# 3. Yêu cầu AI nhìn và phân tích bức ảnh
# nms=True giúp loại bỏ các khung hình trùng lặp
results = model(source_img, nms=True, conf=0.10)
# 4. Vẽ khung nhận diện và hiển thị kết quả lên màn hình
# 'plot()' sẽ tự động vẽ khung màu đỏ quanh vật thể được nhận diện
# và ghi tên nhãn (fire, smoke) kèm độ tự tin (%)
for r in results:
    im_array = r.plot()  # Vẽ khung lên ảnh
    
    # Sử dụng OpenCV để hiển thị tấm ảnh đã được vẽ khung
    cv2.imshow('Ket qua Nhan dien Lua/Khoi', im_array)


# Chờ người dùng ấn một phím bất kỳ để đóng cửa sổ ảnh
print("AI da phan tich xong. Hay xem cua so anh vua hien len.")
print("An mot phim bat ky tren ban phim (khi dang chon cua so anh) de ket thuc.")
cv2.waitKey(0) 
cv2.destroyAllWindows()