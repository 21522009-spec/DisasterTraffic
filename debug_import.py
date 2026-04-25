import sys
from unittest.mock import MagicMock

print("Starting mocks...")
mock_cv2 = MagicMock()
mock_requests = MagicMock()
mock_googleapiclient = MagicMock()
mock_ultralytics = MagicMock()
mock_vidgear = MagicMock()

sys.modules['cv2'] = mock_cv2
sys.modules['requests'] = mock_requests
sys.modules['googleapiclient'] = mock_googleapiclient
sys.modules['googleapiclient.discovery'] = mock_googleapiclient.discovery
sys.modules['ultralytics'] = mock_ultralytics
sys.modules['vidgear'] = mock_vidgear
sys.modules['vidgear.gears'] = mock_vidgear.gears

print("Mocks set. Importing fire_hunter...")
sys.path.append('DisasterTrafficAI')
import fire_hunter
print("Import successful!")
