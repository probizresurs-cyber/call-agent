# Деплой call-agent на VPS

## 1. Первичная установка на VPS

```bash
ssh maria@72.56.241.159

# Клонируем репо
cd ~
git clone <YOUR_REPO_URL> call-agent
cd call-agent

# Зависимости (better-sqlite3 нужен компилятор — обычно build-essential уже установлен)
npm install      # либо pnpm install — лишь бы соответствовало package-lock

# Подготовка .env
cp .env.example .env
nano .env        # см. инструкцию ниже

# Сборка
npm run build

# Создаём пользователя/пароль (выберите свой)
node -e "console.log(require('bcryptjs').hashSync('SuperSecretPass!', 10))"
# вставьте полученный хеш в .env → ADMIN_PASSWORD_HASH

# Папка для логов PM2
mkdir -p logs

# Запуск
pm2 start ecosystem.config.js
pm2 save
pm2 status
```

## 2. Заполнение `.env`

| Переменная | Что туда |
|---|---|
| `PORT` | `3001` (фиксировано) |
| `APP_BASE_URL` | `https://staging.marketradar24.ru/call-agent` |
| `ADMIN_LOGIN` | любой логин для входа |
| `ADMIN_PASSWORD_HASH` | bcrypt-хеш пароля (см. команду выше) |
| `SESSION_SECRET` | `openssl rand -hex 32` |
| `BITRIX_WEBHOOK_URL` | URL входящего вебхука Битрикс. Должен оканчиваться на `/`. Пример: `https://yourportal.bitrix24.ru/rest/1/abcd1234efgh5678/` |
| `BITRIX_INBOUND_TOKEN` | свой случайный токен, который вы укажете в URL исходящего вебхука Bitrix: `?token=...` |
| `ANTHROPIC_API_KEY` | тот же ключ, что у MarketRadar |
| `ANTHROPIC_BASE_URL` | (по желанию) тот же CF-Worker прокси, что у MarketRadar |
| `OPENAI_API_KEY` | ключ OpenAI для Whisper |

## 3. Настройка nginx

Содержимое `deploy/nginx-snippet.conf` скопируйте внутрь `server { }` блока для домена `staging.marketradar24.ru`. Затем:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

После этого:
- `https://staging.marketradar24.ru/` → MarketRadar (3000) — без изменений
- `https://staging.marketradar24.ru/call-agent/` → новое приложение (3001)

## 4. Настройка Битрикс24

1. **Входящий вебхук (мы → Битрикс).** В Битриксе: *Разработчикам → Другое → Входящий вебхук*.
   Разрешите права: `crm`, `telephony`, `user`. Скопируйте полученный URL в `BITRIX_WEBHOOK_URL`.

2. **Исходящий вебхук (Битрикс → мы).** В Битриксе: *Разработчикам → Другое → Исходящий вебхук*.
   - URL обработчика: `https://staging.marketradar24.ru/call-agent/api/webhook/bitrix?token=<BITRIX_INBOUND_TOKEN>`
   - События:
     - `OnVoximplantCallEnd` (если используется встроенная телефония Bitrix Voximplant)
     - `ONCRMACTIVITYADD` (если внешняя АТС записывает звонки как `crm.activity` с `PROVIDER_TYPE_ID=CALL`)

## 5. Деплой обновлений

```bash
ssh maria@72.56.241.159
cd ~/call-agent
git pull
npm install
npm run build
pm2 restart call-agent call-agent-worker
pm2 logs --lines 50
```

## 6. Проверка

1. Открыть `https://staging.marketradar24.ru/call-agent` → должен открыться экран логина.
2. Залогиниться по `ADMIN_LOGIN` / пароль.
3. Завершить тестовый звонок в Битриксе → подождать 30-60 сек → звонок появится в списке.
4. Кликнуть звонок → плеер, стенограмма, AI-анализ.
5. В карточке Сделки/Лида в Битриксе появится timeline-комментарий с выжимкой.

## 7. Логи и мониторинг

```bash
pm2 logs call-agent             # web
pm2 logs call-agent-worker      # обработчик очереди
pm2 monit                       # CPU/RAM
ls -la ~/call-agent/storage/recordings/   # запись звонков
sqlite3 ~/call-agent/data/call-agent.db "SELECT id, status, error FROM calls ORDER BY id DESC LIMIT 10"
```

## 8. Очистка старых записей (опционально)

Поставить cron на удаление mp3 старше `RECORDINGS_TTL_DAYS`:

```bash
crontab -e
# каждый день в 4 утра
0 4 * * * find ~/call-agent/storage/recordings -type f -mtime +30 -delete
```
