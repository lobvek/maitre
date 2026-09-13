#!/usr/bin/env bash
# Pone Maitre online desde este Mac con un túnel de Cloudflare (sin cuenta, URL temporal).
# Para una URL fija y que no dependa del Mac: scripts/deploy-fly.sh
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p data
pkill -f "node server/index.js" 2>/dev/null || true
pkill -f "cloudflared tunnel" 2>/dev/null || true
sleep 1
NODE_ENV=production PORT=3000 nohup node server/index.js > data/server.log 2>&1 &
sleep 2
nohup cloudflared tunnel --url http://localhost:3000 > data/tunnel.log 2>&1 &
for _ in $(seq 1 40); do
  URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' data/tunnel.log | head -1 || true)
  [ -n "$URL" ] && break
  sleep 1
done
echo
echo "  Maitre online en:  ${URL:-(el túnel no ha arrancado, mira data/tunnel.log)}"
echo "  Local:             http://localhost:3000"
echo "  Se cae si apagas el Mac o cierras la sesión."
