#!/usr/bin/env bash
# Despliegue en Fly.io. Requiere haber hecho `fly auth login` una vez.
set -euo pipefail
cd "$(dirname "$0")/.."
command -v fly >/dev/null || { echo "Instala flyctl: brew install flyctl"; exit 1; }
fly auth whoami >/dev/null 2>&1 || { echo "Primero: fly auth login"; exit 1; }

APP=${FLY_APP:-maitre}
if ! fly apps list 2>/dev/null | grep -q "^$APP\b"; then
  fly apps create "$APP" --org personal
  fly volumes create maitre_data --app "$APP" --region mad --size 1 --yes
fi
fly secrets set --app "$APP" PUBLIC_URL="https://$APP.fly.dev" >/dev/null
fly deploy --app "$APP" --ha=false
echo
echo "  Online en https://$APP.fly.dev"
