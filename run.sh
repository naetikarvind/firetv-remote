#!/usr/bin/env bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv .venv
    .venv/bin/pip install --upgrade pip
    .venv/bin/pip install -r requirements.txt
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
