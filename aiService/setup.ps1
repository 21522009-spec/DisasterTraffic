# DisasterTraffic AI Service - setup script cho Windows PowerShell
# Cách dùng: .\setup.ps1

$ErrorActionPreference = 'Stop'

function Write-Step($num, $msg) {
    Write-Host ""
    Write-Host "[$num] $msg" -ForegroundColor Cyan
}

function Write-OK($msg)  { Write-Host "  + $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "  ! $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "  x $msg" -ForegroundColor Red }

$ROOT = $PSScriptRoot

Write-Host "DisasterTraffic AI Service - Setup" -ForegroundColor Magenta
Write-Host "Working dir: $ROOT" -ForegroundColor DarkGray

Write-Step 1 "Kiem tra Python"

try {
    $pyVersion = & python --version 2>&1
    if ($pyVersion -match 'Python (\d+)\.(\d+)') {
        $major = [int]$Matches[1]
        $minor = [int]$Matches[2]
        if ($major -lt 3 -or ($major -eq 3 -and $minor -lt 10)) {
            Write-Err "Python $major.$minor qua cu. Can >= 3.10"
            Write-Host "  Tai tai https://www.python.org/downloads/windows/" -ForegroundColor DarkGray
            exit 1
        }
        Write-OK "$pyVersion"
    } else {
        Write-Err "Khong parse duoc version: $pyVersion"
        exit 1
    }
} catch {
    Write-Err "Khong tim thay 'python'. Cai Python tu https://www.python.org/downloads/ (nho tick 'Add to PATH')"
    exit 1
}

Write-Step 2 "Tao virtual env (.venv)"

$venvPath = Join-Path $ROOT '.venv'
if (Test-Path $venvPath) {
    Write-OK ".venv da co"
} else {
    Write-Host "  Dang tao .venv..." -ForegroundColor DarkGray
    & python -m venv $venvPath
    if ($LASTEXITCODE -ne 0) {
        Write-Err "Tao venv that bai"
        exit 1
    }
    Write-OK "Da tao .venv"
}

Write-Step 3 "Cai dependencies"

$venvPython = Join-Path $venvPath 'Scripts\python.exe'
$venvPip = Join-Path $venvPath 'Scripts\pip.exe'

if (-not (Test-Path $venvPython)) {
    Write-Err "Khong tim thay $venvPython - venv bi loi"
    exit 1
}

& $venvPython -m pip install --upgrade pip --quiet
if ($LASTEXITCODE -ne 0) { Write-Warn "pip upgrade fail (khong nghiem trong)" }

& $venvPip install -r (Join-Path $ROOT 'requirements.txt')
if ($LASTEXITCODE -ne 0) {
    Write-Err "pip install that bai"
    exit 1
}
Write-OK "Cai deps xong"

Write-Step 4 "Setup file .env"

$envPath = Join-Path $ROOT '.env'
$envExamplePath = Join-Path $ROOT '.env.example'

if (-not (Test-Path $envExamplePath)) {
    Write-Err "Khong tim thay .env.example"
    exit 1
}

if (-not (Test-Path $envPath)) {
    Copy-Item $envExamplePath $envPath
    Write-OK "Da copy .env.example -> .env"
} else {
    Write-OK ".env da ton tai (giu nguyen)"
}

Write-Step 5 "Kiem tra fire detection model"

$bestPt = Join-Path $ROOT 'models\best.pt'
if (Test-Path $bestPt) {
    Write-OK "models/best.pt da co"
} else {
    Write-Warn "Chua co models/best.pt"
    Write-Host "  De bat fire detection: tai YOLO fire model va dat vao aiService/models/best.pt" -ForegroundColor DarkGray
    Write-Host "  Sau do trong .env set: FIRE_MODEL_PATH=models/best.pt" -ForegroundColor DarkGray
}

Write-Step 6 "Kiem tra video sources"

$videosDir = Join-Path $ROOT 'videos'
if (-not (Test-Path $videosDir)) {
    New-Item -ItemType Directory -Path $videosDir -Force | Out-Null
}
$mp4Files = Get-ChildItem -Path $videosDir -Filter "*.mp4" -ErrorAction SilentlyContinue
if ($mp4Files.Count -eq 0) {
    Write-Warn "Chua co file MP4 nao trong videos/"
} else {
    Write-OK "$($mp4Files.Count) file MP4 trong videos/"
}

Write-Host ""
Write-Host "Setup xong." -ForegroundColor Green
Write-Host ""
Write-Host "Buoc tiep theo:" -ForegroundColor White
Write-Host "  1. Mo file .env, dien:" -ForegroundColor White
Write-Host "       AI_WEBHOOK_SECRET (giong backend)" -ForegroundColor DarkGray
Write-Host "       YOUTUBE_API_KEY (neu bat ENABLE_YOUTUBE_HUNTER)" -ForegroundColor DarkGray
Write-Host "  2. Activate venv:" -ForegroundColor White
Write-Host "       .\.venv\Scripts\Activate.ps1" -ForegroundColor Cyan
Write-Host "  3. Chay AI service:" -ForegroundColor White
Write-Host "       python main.py" -ForegroundColor Cyan
