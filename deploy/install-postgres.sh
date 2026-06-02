#!/usr/bin/env bash
# =====================================================================
# Установка PostgreSQL на Ubuntu VPS, создание БД для call-agent.
# Запускать один раз:   bash deploy/install-postgres.sh
# Безопасно повторно — пропускает уже сделанное.
# =====================================================================
set -euo pipefail

DB_NAME="callagent"
DB_USER="callagent"
# Пароль генерируется случайным если не задан в окружении
DB_PASS="${PG_PASSWORD:-$(openssl rand -hex 16)}"
PG_PORT="${PG_PORT:-5432}"

# 1. Установка
if ! command -v psql >/dev/null; then
  echo "▶ Установка PostgreSQL…"
  sudo apt-get update
  sudo apt-get install -y postgresql postgresql-contrib
  sudo systemctl enable postgresql
  sudo systemctl start postgresql
else
  echo "▶ PostgreSQL уже установлен ($(psql --version))"
fi

# 2. Создаём пользователя и БД
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1; then
  echo "▶ Создаю пользователя ${DB_USER}…"
  sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';"
else
  echo "▶ Пользователь ${DB_USER} уже существует — пароль не меняем"
  DB_PASS="(существующий)"
fi

if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
  echo "▶ Создаю БД ${DB_NAME}…"
  sudo -u postgres createdb -O "${DB_USER}" "${DB_NAME}"
else
  echo "▶ БД ${DB_NAME} уже существует"
fi

# 3. Права
sudo -u postgres psql -d "${DB_NAME}" -c "GRANT ALL PRIVILEGES ON SCHEMA public TO ${DB_USER};" >/dev/null

# 4. Финал
DATABASE_URL="postgres://${DB_USER}:${DB_PASS}@localhost:${PG_PORT}/${DB_NAME}"

cat <<EOF

═════════════════════════════════════════════════════════════════════
  ✓ PostgreSQL готов для call-agent
═════════════════════════════════════════════════════════════════════

  Добавьте в ~/call-agent/.env:

  DATABASE_URL=${DATABASE_URL}

  Дальше:
  1) cd ~/call-agent && npm install   # подтянет pg + drizzle
  2) npm run db:push                  # создаст схему в Postgres
  3) npm run db:migrate-data --dry    # покажет что переедет
  4) npm run db:migrate-data          # реальная миграция
  5) (после Спринта 2c) restart pm2

  Проверить вручную:
    psql -U ${DB_USER} -d ${DB_NAME} -c "\dt"
═════════════════════════════════════════════════════════════════════
EOF
