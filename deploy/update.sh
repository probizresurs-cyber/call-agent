#!/usr/bin/env bash
# =====================================================================
# Обновление call-agent — запускать после git pull
#   cd ~/call-agent && git pull && bash deploy/update.sh
# =====================================================================
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

echo "▶ npm install"
npm install

echo "▶ npm run build"
npm run build

echo "▶ pm2 reload"
pm2 reload ecosystem.config.js

pm2 status
