# DisasterTraffic AI Service — setup script for Windows PowerShell
#
# Chạy:
#   .\setup.ps1
#
# Sẽ làm:
#   1. Check Python version >= 3.10
#   2. Tạo virtual env .venv nếu chưa có
#   3. pip install -r requirements.txt
#   4. Copy .env.example → .env
#   5. In ra checklist các bước cần làm tay (best.pt, .env values)

$ErrorActionPreference = 'Stop'

function Write-Step($num, $msg) {
    Write-Host ""
    Write-Host "[$num] $msg" -ForegroundColor Cyan
}

function Write-OK($msg)  { Write-Host "  ✓ $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "  ⚠ $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "  ✗ $msg" -ForegroundColor Red }

$ROOT = $PSScriptRoot

Write-Host "🐍 DisasterTraffic AI Service — Setup" -ForegroundColor Magenta
Write-Host "Working dir: $ROOT" -ForegroundColor DarkGray

# ---------- 1. Python version ----------
Write-Step 1 "Kiểm tra Python"

try {
    $pyVersion = & python --version 2>&1
    if ($pyVersion -match 'Python (\d+)\.(\d+)') {
        $major = [int]$Matches[1]
        $minor = [int]$Matches[2]
        if ($major -lt 3 -or ($major -eq 3 -and $minor -lt 10)) {
            Write-Err "Python $major.$minor quá cũ. Cần >= 3.10"
            Write-Host "  Tải tại https://www.python.org/downloads/windows/" -ForegroundColor DarkGray
            exit 1
        }
        Write-OK "$pyVersion"
    } else {
        Write-Err "Không parse được version: $pyVersion"
        exit 1
    }
} catch {
    Write-Err "Không tìm thấy 'python'. Cài Python từ https://www.python.org/downloads/ (nhớ tick 'Add to PATH')"
    exit 1
}

# ---------- 2. Virtual env ----------
Write-Step 2 "Tạo virtual env (.venv)"

$venvPath = Join-Path $ROOT '.venv'
if (Test-Path $venvPath) {
    Write-OK ".venv đã có"
} else {
    Write-Host "  Đang tạo .venv..." -ForegroundColor DarkGray
    & python -m venv $venvPath
    if ($LASTEXITCODE -ne 0) {
        Write-Err "Tạo venv thất bại"
        exit 1
    }
    Write-OK "Đã tạo .venv"
}

# ---------- 3. Install deps ----------
Write-Step 3 "Cài dependencies (sẽ tốn ~2-5 phút lần đầu)"

$venvPython = Join-Path $venvPath 'Scripts\python.exe'
$venvPip = Join-Path $venvPath 'Scripts\pip.exe'

if (-not (Test-Path $venvPython)) {
    Write-Err "Không tìm thấy $venvPython — venv bị lỗi"
    exit 1
}

& $venvPython -m pip install --upgrade pip --quiet
if ($LASTEXITCODE -ne 0) { Write-Warn "pip upgrade fail (không nghiêm trọng)" }

& $venvPip install -r (Join-Path $ROOT 'requirements.txt')
if ($LASTEXITCODE -ne 0) {
    Write-Err "pip install thất bại"
    exit 1
}
Write-OK "Cài deps xong"

# ---------- 4. .env ----------
Write-Step 4 "Setup file .env"

$envPath = Join-Path $ROOT '.env'
$envExamplePath = Join-Path $ROOT '.env.example'

if (-not (Test-Path $envExamplePath)) {
    Write-Err "Không tìm thấy .env.example"
    exit 1
}

if (-not (Test-Path $envPath)) {
    Copy-Item $envExamplePath $envPath
    Write-OK "Đã copy .env.example → .env"
} else {
    Write-OK ".env đã tồn tại (giữ nguyên)"
}

# ---------- 5. best.pt check ----------
Write-Step 5 "Kiểm tra fire detection model (best.pt)"

$bestPt = Join-Path $ROOT 'models\best.pt'
if (Test-Path $bestPt) {
    Write-OK "models/best.pt đã có — fire detection sẽ hoạt động"
} else {
    Write-Warn "Chưa có models/best.pt"
    Write-Host "  Để bật fire detection:" -ForegroundColor DarkGray
    Write-Host "    1. Tải YOLO fire model (vd: keremberke/yolov8m-fire-detection trên HuggingFace)" -ForegroundColor DarkGray
    Write-Host "    2. Đặt vào aiService/models/best.pt" -ForegroundColor DarkGray
    Write-Host "    3. Trong .env set: FIRE_MODEL_PATH=models/best.pt" -ForegroundColor DarkGray
}

# ---------- 6. videos check ----------
Write-Step 6 "Kiểm tra video sources"

$videosDir = Join-Path $ROOT 'videos'
if (-not (Test-Path $videosDir)) {
    New-Item -ItemType Directory -Path $videosDir -Force | Out-Null
}
$mp4Files = Get-ChildItem -Path $videosDir -Filter "*.mp4" -ErrorAction SilentlyContinue
if ($mp4Files.Count -eq 0) {
    Write-Warn "Chưa có file MP4 nào trong videos/"
    Write-Host "  Để test traffic detection:" -ForegroundColor DarkGray
    Write-Host "    1. Tải 1 video giao thông từ Pixabay/Pexels" -ForegroundColor DarkGray
    Write-Host "    2. Đặt vào aiService/videos/default.mp4" -ForegroundColor DarkGray
} else {
    Write-OK "$($mp4Files.Count) file MP4 trong videos/"
}

# ---------- Done ----------
Write-Host ""
Write-Host "✅ Setup xong!" -ForegroundColor Green
Write-Host ""
Write-Host "Bước tiếp theo:" -ForegroundColor White
Write-Host "  1. Mở file .env, điền:" -ForegroundColor White
Write-Host "       AI_WEBHOOK_SECRET (giống backend)" -ForegroundColor DarkGray
Write-Host "       YOUTUBE_API_KEY (nếu bật ENABLE_YOUTUBE_HUNTER)" -ForegroundColor DarkGray
Write-Host "  2. Activate venv:" -ForegroundColor White
Write-Host "       .\.venv\Scripts\Activate.ps1" -ForegroundColor Cyan
Write-Host "  3. Chạy AI service:" -ForegroundColor White
Write-Host "       python main.py" -ForegroundColor Cyan
