#!/usr/bin/env bash
# Sauvegarde MenuGo — a planifier via cron (ex. 0 2 * * *)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$BACKEND_DIR"
echo "[MenuGo backup] Démarrage depuis $BACKEND_DIR"
npm run backup
