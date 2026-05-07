#!/usr/bin/env bash
# ============================================================
#  Respirator Simulator — Student Station Launcher
#  Designed for Raspberry Pi (Raspbian / Raspberry Pi OS)
#
#  Starts:
#    1. Student backend  (NestJS on port 8080)
#    2. Student frontend (Vite dev server on port 3000)
#    3. Chromium in kiosk mode pointing at http://localhost:3000
#
#  Usage:
#    chmod +x start-student.sh
#    ./start-student.sh                     # auto-discover trainer via UDP
#    ./start-student.sh 192.168.1.100       # connect to trainer at this IP
#    ./start-student.sh 192.168.1.100:8081  # connect to trainer at IP:port
#
#  To stop everything:  Ctrl+C  (the script cleans up child processes)
# ============================================================

set -e

# ── Trainer IP (optional first argument) ─────────────────────
TRAINER_ARG="$1"
if [ -n "$TRAINER_ARG" ]; then
    # If user passed just an IP (no port), append default trainer port 8081
    if [[ "$TRAINER_ARG" != *:* ]]; then
        TRAINER_ARG="${TRAINER_ARG}:8081"
    fi
    export TRAINER_URL="ws://${TRAINER_ARG}/api/trainer/ws"
fi

# ── Paths ────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/student-ui"

# ── Ports ────────────────────────────────────────────────────
BACKEND_PORT="${BACKEND_PORT:-8080}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
FRONTEND_URL="http://localhost:${FRONTEND_PORT}"

# ── Logging ──────────────────────────────────────────────────
LOG_DIR="$SCRIPT_DIR/logs"
mkdir -p "$LOG_DIR"
BACKEND_LOG="$LOG_DIR/backend.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"

# ── Colors ───────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

log()  { echo -e "${CYAN}[$(date +%H:%M:%S)]${NC} $1"; }
ok()   { echo -e "${CYAN}[$(date +%H:%M:%S)]${NC} ${GREEN}✅ $1${NC}"; }
warn() { echo -e "${CYAN}[$(date +%H:%M:%S)]${NC} ${YELLOW}⚠️  $1${NC}"; }
err()  { echo -e "${CYAN}[$(date +%H:%M:%S)]${NC} ${RED}❌ $1${NC}"; }

# ── Cleanup on exit ──────────────────────────────────────────
BACKEND_PID=""
FRONTEND_PID=""
BROWSER_PID=""

cleanup() {
    log "Shutting down..."

    # Kill browser
    if [ -n "$BROWSER_PID" ] && kill -0 "$BROWSER_PID" 2>/dev/null; then
        kill "$BROWSER_PID" 2>/dev/null || true
    fi

    # Kill frontend
    if [ -n "$FRONTEND_PID" ] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
        kill "$FRONTEND_PID" 2>/dev/null || true
        wait "$FRONTEND_PID" 2>/dev/null || true
    fi

    # Kill backend
    if [ -n "$BACKEND_PID" ] && kill -0 "$BACKEND_PID" 2>/dev/null; then
        kill "$BACKEND_PID" 2>/dev/null || true
        wait "$BACKEND_PID" 2>/dev/null || true
    fi

    ok "All processes stopped."
    exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# ── Helpers ──────────────────────────────────────────────────
wait_for_port() {
    local port=$1
    local name=$2
    local max_wait=${3:-60}
    local elapsed=0

    log "Waiting for $name on port $port..."
    while ! (echo >/dev/tcp/localhost/$port) 2>/dev/null; do
        sleep 1
        elapsed=$((elapsed + 1))
        if [ $elapsed -ge $max_wait ]; then
            err "$name did not start within ${max_wait}s — check $LOG_DIR"
            exit 1
        fi
    done
    ok "$name is ready! (took ${elapsed}s)"
}


# ── Pre-flight checks ───────────────────────────────────────
log "🩺 Respirator Simulator — Student Station"
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Очистка портов от старых (зависших) процессов
log "Checking if ports $BACKEND_PORT and $FRONTEND_PORT are clear..."
if command -v fuser &>/dev/null; then
    fuser -k -15 ${BACKEND_PORT}/tcp &>/dev/null || true
    fuser -k -15 ${FRONTEND_PORT}/tcp &>/dev/null || true
    sleep 1 # Даем процессам время на корректное завершение
else
    # Резервный вариант, если fuser не установлен
    killall node 2>/dev/null || true
    sleep 1
fi

# Check Node.js
if ! command -v node &>/dev/null; then
    err "Node.js is not installed. Install Node 20+ first."
    exit 1
fi
NODE_VER=$(node -v)
log "Node.js version: $NODE_VER"

# Check npm
if ! command -v npm &>/dev/null; then
    err "npm is not installed."
    exit 1
fi

# Show trainer connection mode
if [ -n "$TRAINER_URL" ]; then
    ok "Trainer IP set: $TRAINER_URL"
else
    log "Trainer: auto-discovery (UDP broadcast)"
fi

# ── Install dependencies if needed ──────────────────────────
if [ ! -d "$BACKEND_DIR/node_modules" ]; then
    log "Installing backend dependencies..."
    (cd "$BACKEND_DIR" && npm install) >> "$BACKEND_LOG" 2>&1
    ok "Backend dependencies installed."
fi

if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
    log "Installing frontend dependencies..."
    (cd "$FRONTEND_DIR" && npm install) >> "$FRONTEND_LOG" 2>&1
    ok "Frontend dependencies installed."
fi

# ── 1. Start backend ────────────────────────────────────────
log "Starting student backend on port $BACKEND_PORT..."
# IMPORTANT: sudo -E preserves environment (PORT, TRAINER_URL) — plain sudo strips them!
(cd "$BACKEND_DIR" && sudo -E PORT=$BACKEND_PORT TRAINER_URL="${TRAINER_URL:-}" npm run start:student) >> "$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!
log "Backend PID: $BACKEND_PID  (log: $BACKEND_LOG)"

wait_for_port "$BACKEND_PORT" "Student Backend" 90

# ── 2. Start frontend ───────────────────────────────────────
log "Starting student frontend on port $FRONTEND_PORT..."
(cd "$FRONTEND_DIR" && npm run dev) >> "$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!
log "Frontend PID: $FRONTEND_PID  (log: $FRONTEND_LOG)"

wait_for_port "$FRONTEND_PORT" "Student Frontend" 60

# ── 3. Launch browser in kiosk mode ─────────────────────────
log "Launching Chromium in kiosk mode → $FRONTEND_URL"
DISPLAY=:0 chromium --kiosk --noerrdialogs --disable-infobars --app="$FRONTEND_URL" > /dev/null 2>&1 &
BROWSER_PID=$!
ok "Browser launched (PID: $BROWSER_PID)"

# ── 4. Keep alive ───────────────────────────────────────────
ok "All systems running!"
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log "  Backend : http://localhost:$BACKEND_PORT"
log "  Frontend: $FRONTEND_URL"
log "  Browser : kiosk mode"
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log "Press Ctrl+C to stop everything."
echo ""

# Wait for either process to exit
wait -n "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
warn "A process exited — shutting down."