#!/usr/bin/env bash
# =====================================================================
# Первичная установка call-agent на VPS.
# Запускать ИЗ корня клона репозитория:
#   cd ~/call-agent && bash deploy/setup-vps.sh
# Скрипт безопасный: при повторном запуске пропускает уже сделанное.
# =====================================================================
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

echo "▶ Проект:   $PROJECT_DIR"
echo "▶ Node:     $(node -v 2>/dev/null || echo 'НЕТ — установите Node 20+')"
echo "▶ npm:      $(npm -v 2>/dev/null || echo 'НЕТ')"
echo "▶ PM2:      $(pm2 -v 2>/dev/null || echo 'НЕТ')"

# 1. Проверка зависимостей системы
if ! command -v node >/dev/null; then
  echo "✗ Установите Node.js 20+: https://nodejs.org/"
  exit 1
fi
if ! command -v pm2 >/dev/null; then
  echo "▶ Ставлю PM2 глобально…"
  npm install -g pm2
fi

# 2. .env — создаём из примера если ещё нет
if [ ! -f .env ]; then
  echo "▶ Создаю .env из шаблона"
  cp .env.example .env

  # подтягиваем ключи из MarketRadar, если он рядом
  for MR_DIR in ~/market-radar ~/nextjs-app; do
    if [ -f "$MR_DIR/.env" ] || [ -f "$MR_DIR/.env.local" ]; then
      MR_ENV="$MR_DIR/.env"
      [ -f "$MR_DIR/.env.local" ] && MR_ENV="$MR_DIR/.env.local"
      echo "▶ Нашёл $MR_ENV — подтягиваю ANTHROPIC_/OPENAI_/ANTHROPIC_BASE_URL"
      for KEY in ANTHROPIC_API_KEY OPENAI_API_KEY ANTHROPIC_BASE_URL; do
        VAL=$(grep -E "^${KEY}=" "$MR_ENV" 2>/dev/null | head -1 | cut -d= -f2-)
        if [ -n "$VAL" ]; then
          sed -i "s|^${KEY}=.*|${KEY}=${VAL}|" .env
        fi
      done
      break
    fi
  done

  # Генерим секреты
  SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  INBOUND_TOKEN=$(node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")
  sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=${SESSION_SECRET}|" .env
  sed -i "s|^BITRIX_INBOUND_TOKEN=.*|BITRIX_INBOUND_TOKEN=${INBOUND_TOKEN}|" .env

  # ADMIN_LOGIN / PASSWORD_HASH — попросим у пользователя
  echo ""
  echo "▶ Создаём админ-аккаунт"
  read -rp "    Логин администратора [admin]: " ADMIN_LOGIN
  ADMIN_LOGIN=${ADMIN_LOGIN:-admin}
  read -rsp "    Пароль администратора: " ADMIN_PASSWORD; echo
  if [ -z "$ADMIN_PASSWORD" ]; then
    echo "✗ Пароль не может быть пустым"; exit 1
  fi

  # bcrypt-хеш через node + bcryptjs (он уже будет в node_modules после install,
  # но на этом шаге его ещё нет — поэтому хешируем позже)
  echo "ADMIN_LOGIN=${ADMIN_LOGIN}" >> .env.tmp
  echo "ADMIN_PASSWORD_RAW=${ADMIN_PASSWORD}" >> .env.tmp
  echo "    (хеш будет сгенерирован после npm install)"
  echo ""
else
  echo "▶ .env уже существует — пропускаю генерацию"
fi

# 3. Зависимости
echo "▶ npm install (может занять 2-3 минуты на первой установке)"
npm install

# 4. Дохешируем пароль если есть временный файл
if [ -f .env.tmp ]; then
  ADMIN_LOGIN=$(grep ADMIN_LOGIN .env.tmp | cut -d= -f2-)
  ADMIN_PASSWORD_RAW=$(grep ADMIN_PASSWORD_RAW .env.tmp | cut -d= -f2-)
  HASH=$(node -e "console.log(require('bcryptjs').hashSync(process.argv[1],10))" "$ADMIN_PASSWORD_RAW")
  sed -i "s|^ADMIN_LOGIN=.*|ADMIN_LOGIN=${ADMIN_LOGIN}|" .env
  sed -i "s|^ADMIN_PASSWORD_HASH=.*|ADMIN_PASSWORD_HASH=${HASH}|" .env
  rm -f .env.tmp
  echo "▶ ADMIN_PASSWORD_HASH сгенерирован"
fi

# 5. Папка для логов PM2
mkdir -p logs

# 6. Сборка
echo "▶ npm run build"
npm run build

# 7. PM2 — стартуем если ещё не запущено, иначе reload
if pm2 jlist 2>/dev/null | grep -q '"name":"call-agent"'; then
  echo "▶ pm2 reload call-agent + call-agent-worker"
  pm2 reload ecosystem.config.js
else
  echo "▶ pm2 start ecosystem.config.js"
  pm2 start ecosystem.config.js
  pm2 save
fi

pm2 status

# 8. Финальная подсказка
INBOUND_TOKEN=$(grep ^BITRIX_INBOUND_TOKEN= .env | cut -d= -f2-)
BASE_URL=$(grep ^APP_BASE_URL= .env | cut -d= -f2-)
[ -z "$BASE_URL" ] && BASE_URL="https://staging.marketradar24.ru/call-agent"

cat <<EOF

══════════════════════════════════════════════════════════════════════
  ✓ Call-Agent установлен и запущен
══════════════════════════════════════════════════════════════════════

  1. Настройте nginx (один раз):
     sudo nano /etc/nginx/sites-available/staging.marketradar24.ru
     # вставить содержимое из ./deploy/nginx-snippet.conf внутрь server { }
     sudo nginx -t && sudo systemctl reload nginx

  2. Откройте:
     ${BASE_URL}

  3. URL для исходящего вебхука Битрикса (положите в Битрикс24 → Разработчикам → Исходящий вебхук):
     ${BASE_URL}/api/webhook/bitrix?token=${INBOUND_TOKEN}

     События: OnVoximplantCallEnd, ONCRMACTIVITYADD

  4. Когда получите URL входящего вебхука Битрикс (для обратной записи в CRM):
     nano .env   → BITRIX_WEBHOOK_URL=https://yourportal.bitrix24.ru/rest/.../
     pm2 restart call-agent call-agent-worker

  Логи:    pm2 logs
  Статус:  pm2 status
  БД:      sqlite3 ./data/call-agent.db
══════════════════════════════════════════════════════════════════════
EOF
