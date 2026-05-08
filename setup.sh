#!/usr/bin/env bash
# Cai dat tu dong cho macOS / Linux.
# Chay tu repo root: bash setup.sh
set -e

step() { echo; echo "==> $1"; }
ok()   { echo "    [OK] $1"; }
info() { echo "    $1"; }
warn() { echo "    [!] $1"; }

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

step "Kiem tra prerequisite"
missing=()
command -v node    >/dev/null 2>&1 || missing+=("Node.js 18+ (https://nodejs.org)")
command -v npm     >/dev/null 2>&1 || missing+=("npm")
command -v python3 >/dev/null 2>&1 || missing+=("Python 3.10+ (https://python.org)")
command -v git     >/dev/null 2>&1 || missing+=("git")
if [ "${#missing[@]}" -gt 0 ]; then
    echo
    echo "Thieu tool:"
    printf '    - %s\n' "${missing[@]}"
    exit 1
fi
ok "Node $(node -v), Python $(python3 --version | awk '{print $2}')"
info "Repo root: $REPO_ROOT"

# Backend
step "Backend (DisasterTrafficWeb)"
if [ -d "$REPO_ROOT/DisasterTrafficWeb" ]; then
    cd "$REPO_ROOT/DisasterTrafficWeb"
    if [ ! -d node_modules ]; then
        info "npm install..."
        npm install --no-fund --no-audit
        ok "npm install xong"
    else
        info "node_modules da co, skip"
    fi
    if [ ! -f .env ] && [ -f .env.example ]; then
        cp .env.example .env
        ok "Copy .env.example -> .env (NHO DIEN VAO)"
    else
        info ".env da co, skip"
    fi
else
    warn "DisasterTrafficWeb/ khong ton tai, skip"
fi

# AI Service
step "AI Service (aiService)"
if [ -d "$REPO_ROOT/aiService" ]; then
    cd "$REPO_ROOT/aiService"
    if [ ! -d .venv ]; then
        info "Tao venv..."
        python3 -m venv .venv
    fi
    info "pip install -r requirements.txt..."
    ./.venv/bin/pip install --quiet --upgrade pip
    ./.venv/bin/pip install --quiet -r requirements.txt
    ok "Python deps xong"
    if [ ! -f .env ] && [ -f .env.example ]; then
        cp .env.example .env
        ok "Copy .env.example -> .env (NHO DIEN VAO)"
    else
        info ".env da co, skip"
    fi
else
    warn "aiService/ khong ton tai, skip"
fi

# Mobile
step "Mobile (appDisasterTraffic)"
if [ -d "$REPO_ROOT/appDisasterTraffic" ]; then
    cd "$REPO_ROOT/appDisasterTraffic"
    if [ ! -d node_modules ]; then
        info "npm install..."
        npm install --no-fund --no-audit
        ok "npm install xong"
    else
        info "node_modules da co, skip"
    fi
else
    warn "appDisasterTraffic/ khong ton tai, skip"
fi

cat <<'EOF'

Setup hoan tat.

Buoc thu cong con lai (xem chi tiet trong SETUP.md):
  1. Edit DisasterTrafficWeb/.env  -> MONGO_URI, JWT_SECRET, AI_WEBHOOK_SECRET, TOMTOM_KEY
  2. Edit aiService/.env           -> AI_WEBHOOK_SECRET (khop backend), GOOGLE_API_KEY
  3. Edit appDisasterTraffic/app.json -> extra.serverUrl khi test thiet bi that

Khoi chay:
  Backend:    cd DisasterTrafficWeb && npm run dev
  AI Service: cd aiService && source .venv/bin/activate && python main.py
  Mobile:     cd appDisasterTraffic && npx expo start
EOF
