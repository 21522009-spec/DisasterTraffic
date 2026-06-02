import cv2
import time

url = "rtsp://9627b0bf2a7b.entrypoint.cloud.wowza.com:1935/app-p5260J38/66abe4b9_stream1"
print(f"Connecting to: {url}")
cap = cv2.VideoCapture(url)

if not cap.isOpened():
    print("Could not open stream")
else:
    print("Opened stream successfully. Reading 5 frames...")
    for i in range(5):
        ret, frame = cap.read()
        if ret:
            print(f"Frame {i}: shape={frame.shape}")
        else:
            print(f"Frame {i}: failed to read")
        time.sleep(0.5)
    cap.release()
