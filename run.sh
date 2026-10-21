#!/usr/bin/env bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv .venv
    .venv/bin/pip install --upgrade pip
    .venv/bin/pip install -r requirements.txt
else
    # Ensure any updated dependencies (like websockets) are installed in existing venv
    if ! .venv/bin/python -c "import websockets" 2>/dev/null; then
        echo "Installing updated dependencies from requirements.txt..."
        .venv/bin/pip install -q -r requirements.txt
    fi
fi

# Clean up any lingering process on port 8000
OLD_PID=$(lsof -ti :8000 2>/dev/null || true)
if [ -n "$OLD_PID" ]; then
    echo "⚡ Port 8000 is occupied by process(es) $OLD_PID. Reclaiming port..."
    kill -9 $OLD_PID 2>/dev/null || true
    sleep 0.5
fi

echo "=========================================================="
echo "           🔥 Fire TV Remote Pro Server                   "
echo "=========================================================="

LOCAL_IP=$(.venv/bin/python -c "import socket; s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.connect(('8.8.8.8', 80)); print(s.getsockname()[0]); s.close()" 2>/dev/null || echo "127.0.0.1")

echo ""
echo "  💻 Open in Browser on your Mac:"
echo "     http://localhost:8000"
echo ""
echo "  📱 Open on your iPhone / Android (same Wi-Fi):"
echo "     http://${LOCAL_IP}:8000"
echo ""
echo "  👉 Tip: Scan the QR code in the top bar to open on phone!"
echo "=========================================================="
echo ""

exec .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
