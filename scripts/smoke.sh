#!/usr/bin/env bash
# Recorre el flujo completo de Maitre contra un servidor real: alta → carta → mesa →
# escaneo → pedido del comensal → sala → cobro. Usa una base de datos temporal.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT=${PORT:-3987}
TMP=$(mktemp -d)
export MAITRE_DATA_DIR="$TMP"
JAR="$TMP/cookies.txt"
trap 'kill "${SRV:-0}" 2>/dev/null || true; rm -rf "$TMP"' EXIT

PORT=$PORT node server/index.js > "$TMP/server.log" 2>&1 &
SRV=$!
disown "$SRV" 2>/dev/null || true
API="http://localhost:$PORT"

for _ in $(seq 1 40); do curl -sf -m1 "$API/api/health" > /dev/null && break; sleep 0.25; done

j() { python3 -c "import json,sys;d=json.load(sys.stdin);print($1)"; }
step() { printf '\033[2m%-42s\033[0m %s\n' "$1" "$2"; }

SLUG="smoke-$RANDOM"
VENUE=$(curl -sf -c "$JAR" -X POST "$API/api/auth/signup" -H 'content-type: application/json' \
  -d "{\"venue_name\":\"$SLUG\",\"email\":\"$SLUG@test.dev\",\"password\":\"contrasena123\",\"tables\":3}")
step "1. Alta del local" "$(echo "$VENUE" | j "d['venue']['name'] + ' · plan ' + d['venue']['effective_plan']")"
SLUG=$(echo "$VENUE" | j "d['venue']['slug']")

CAT=$(curl -sf -b "$JAR" -X POST "$API/api/menu/categories" -H 'content-type: application/json' -d '{"name":"Bebidas"}' | j "d['id']")
ITEM=$(curl -sf -b "$JAR" -X POST "$API/api/menu/items" -H 'content-type: application/json' \
  -d "{\"name\":\"Caña\",\"price\":2.60,\"category_id\":$CAT,\"allergens\":[\"gluten\"]}" | j "d['id']")
step "2. Carta cargada" "categoría $CAT, producto $ITEM"

TOKEN=$(curl -sf -b "$JAR" "$API/api/tables" | j "d['tables'][0]['token']")
TABLE_ID=$(curl -sf -b "$JAR" "$API/api/tables" | j "d['tables'][0]['id']")
step "3. Mesa y QR" "$API/m/$SLUG/$TOKEN"
curl -sf -b "$JAR" -o "$TMP/qr.png" "$API/api/tables/$TABLE_ID/qr.png"

SESSION=$(curl -sf -X POST "$API/api/public/$SLUG/$TOKEN/scan" -H 'content-type: application/json' -d '{}' | j "d['session_id']")
step "4. El comensal escanea" "sesión anónima ${SESSION:0:8}…"

ORDER=$(curl -sf -X POST "$API/api/public/$SLUG/$TOKEN/order" -H 'content-type: application/json' \
  -d "{\"lines\":[{\"item_id\":$ITEM,\"qty\":2}],\"session_id\":\"$SESSION\"}")
OID=$(echo "$ORDER" | j "d['id']")
step "5. Pedido enviado" "$(echo "$ORDER" | j "d['code'] + ' · ' + str(d['total_cents']/100) + ' €'")"

curl -sf -X POST "$API/api/public/$SLUG/$TOKEN/call" -H 'content-type: application/json' -d '{"type":"bill"}' > /dev/null
step "6. Aviso al personal" "$(curl -sf -b "$JAR" "$API/api/orders/pending-calls" | j "str(len(d)) + ' pendiente(s)'")"

for _ in 1 2 3; do curl -sf -b "$JAR" -X PATCH "$API/api/orders/$OID/status" > /dev/null; done
step "7. Sala sirve el pedido" "$(curl -sf -b "$JAR" "$API/api/orders/$OID" | j "d['status']")"

CLOSE=$(curl -sf -b "$JAR" -X POST "$API/api/orders/table/$TABLE_ID/close" -H 'content-type: application/json' -d '{"payment_method":"card"}')
step "8. Mesa cobrada" "$(echo "$CLOSE" | j "str(d['charged_cents']/100) + ' € en ' + str(d['orders']) + ' pedido(s)'")"

curl -sf -b "$JAR" -X POST "$API/api/billing/plan" -H 'content-type: application/json' -d '{"plan":"servicio"}' > /dev/null
step "9. Plan Servicio contratado" "$(curl -sf -b "$JAR" "$API/api/analytics/summary" | j "'ticket medio ' + str(d['kpis']['avg_ticket_cents']/100) + ' EUR'")"

NUEVO=$(curl -sf -X POST "$API/api/public/$SLUG/$TOKEN/order" -H 'content-type: application/json' \
  -d "{\"lines\":[{\"item_id\":$ITEM,\"qty\":1}],\"session_id\":\"$SESSION-2\"}")
NID=$(echo "$NUEVO" | j "d['id']")
step "10. «Lo cojo yo» en sala" "$(curl -sf -b "$JAR" -X POST "$API/api/orders/$NID/claim" | j "'lo tiene ' + d['claimed_name']")"
step "    sin sesión queda fuera" "$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/api/orders/$NID/claim") (401 = rechazado)"
step "    al meterlo en el TPV" "$(curl -sf -b "$JAR" -X PATCH "$API/api/orders/$NID/status" | j "d['status'] + ', marca liberada: ' + str(d['claimed_by'] is None)")"


echo
echo "  Flujo completo verificado."
