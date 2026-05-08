# Cài đặt tự động cho Windows.
# Chạy từ thư mục root: .\setup.ps1
# Script làm: npm install backend + mobile, tạo Python venv + pip install,
# copy .env.example -> .env (chỉ khi .env chưa có).
# KHÔNG tự điền secret — phải mở .env điền tay sau khi script chạy xong.

$ErrorActionPreference = "Stop"

function Test-Cmd($cmd) {
    return $null -ne (Get-Command $cmd -ErrorAction SilentlyContinue)
}

function Step($msg) { Write-Host ""; Write-Host "==> $msg" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "    [OK] $msg" -ForegroundColor Green }
function Info($msg) { Write-Host "    $msg" -ForegroundColor DarkGray }
function Warn($msg) { Write-Host "    [!] $msg" -ForegroundColor Yellow }

# Check prerequisites
Step "Kiem tra prerequisite"
$missing = @()
if (-not (Test-Cmd "node"))   { $missing += "Node.js 18+ (https://nodejs.org)" }
if (-not (Test-Cmd "npm"))    { $missing += "npm" }
if (-not (Test-Cmd "python")) { $missing += "Python 3.10+ (https://python.org)" }
if (-not (Test-Cmd "git"))    { $missing += "Git" }
if ($missing.Count -gt 0) {
    Write-Host ""
    Write-Host "Thieu cac tool sau:" -ForegroundColor Red
    $missing | ForEach-Object { Write-Host "    - $_" }
    exit 1
}
$nodeVer = (node --version).TrimStart("v")
$pyVer = (python --version 2>&1).Split(" ")[1]
Ok "Node v$nodeVer, Python $pyVer"

$repoRoot = $PSScriptRoot
if (-not $repoRoot) { $repoRoot = Get-Location }
Info "Repo root: $repoRoot"

# Backend
Step "Backend (DisasterTrafficWeb)"
$backendPath = Join-Path $repoRoot "DisasterTrafficWeb"
if (-not (Test-Path $backendPath)) {
    Warn "Khong tim thay DisasterTrafficWeb/, bo qua"
} else {
    Push-Location $backendPath
    try {
        if (-not (Test-Path "node_modules")) {
            Info "npm install..."
            npm install --no-fund --no-audit
            Ok "npm install xong"
        } else {
            Info "node_modules da co, skip"
        }
        if (-not (Test-Path ".env")) {
            if (Test-Path ".env.example") {
                Copy-Item ".env.example" ".env"
                Ok "Copy .env.example -> .env (NHO DIEN VAO)"
            } else {
                Warn ".env.example khong ton tai"
            }
        } else {
            Info ".env da co, skip"
        }
    } finally { Pop-Location }
}

# AI Service
Step "AI Service (aiService)"
$aiPath = Join-Path $repoRoot "aiService"
if (-not (Test-Path $aiPath)) {
    Warn "Khong tim thay aiService/, bo qua"
} else {
    Push-Location $aiPath
    try {
        if (-not (Test-Path ".venv")) {
            Info "Tao virtualenv (.venv)..."
            python -m venv .venv
            Ok "venv tao xong"
        } else {
            Info ".venv da co, skip"
        }
        $pipExe = ".\.venv\Scripts\pip.exe"
        if (Test-Path $pipExe) {
            Info "pip install -r requirements.txt (mat vai phut)..."
            & $pipExe install --quiet --upgrade pip
            & $pipExe install --quiet -r requirements.txt
            Ok "Python deps xong"
        } else {
            Warn "Khong tim thay .venv\Scripts\pip.exe"
        }
        if (-not (Test-Path ".env")) {
            if (Test-Path ".env.example") {
                Copy-Item ".env.example" ".env"
                Ok "Copy .env.example -> .env (NHO DIEN VAO)"
            }
        } else {
            Info ".env da co, skip"
        }
    } finally { Pop-Location }
}

# Mobile
Step "Mobile (appDisasterTraffic)"
$mobilePath = Join-Path $repoRoot "appDisasterTraffic"
if (-not (Test-Path $mobilePath)) {
    Warn "Khong tim thay appDisasterTraffic/, bo qua"
} else {
    Push-Location $mobilePath
    try {
        if (-not (Test-Path "node_modules")) {
            Info "npm install..."
            npm install --no-fund --no-audit
            Ok "npm install xong"
        } else {
            Info "node_modules da co, skip"
        }
    } finally { Pop-Location }
}

Write-Host ""
Write-Host "Setup hoan tat." -ForegroundColor Green
Write-Host ""
Write-Host "Buoc thu cong con lai (xem chi tiet trong SETUP.md):"
Write-Host "  1. Edit DisasterTrafficWeb\.env  -> MONGO_URI, JWT_SECRET, AI_WEBHOOK_SECRET, TOMTOM_KEY"
Write-Host "  2. Edit aiService\.env           -> AI_WEBHOOK_SECRET (khop backend), GOOGLE_API_KEY"
Write-Host "  3. Edit appDisasterTraffic\app.json -> extra.serverUrl khi test thiet bi that"
Write-Host ""
Write-Host "Khoi chay:"
Write-Host "  Backend:    cd DisasterTrafficWeb; npm run dev"
Write-Host "  AI Service: cd aiService; .\.venv\Scripts\Activate.ps1; python main.py"
Write-Host "  Mobile:     cd appDisasterTraffic; npx expo start"
