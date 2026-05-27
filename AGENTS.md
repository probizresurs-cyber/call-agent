# Call-Agent — заметки для AI-агентов

Этот проект — **отдельный Next.js 16 на VPS рядом с MarketRadar**.

## Контекст

- **Цель:** транскрипция и AI-анализ звонков из Битрикс24, обратная запись в CRM, дашборд.
- **Размещение:** `~/call-agent` на VPS `maria@72.56.241.159`, порт `3001`, basePath `/call-agent`.
- **Домен:** `https://staging.marketradar24.ru/call-agent` (path-based, nginx делит трафик с MarketRadar на 3000).
- **Деплой:** PM2 (2 процесса: `call-agent` web + `call-agent-worker`), `git pull && npm i && npm run build && pm2 restart`.

## Архитектурные принципы

1. **Без бэкенд-БД сервиса MarketRadar.** Свой SQLite в `data/call-agent.db` (нужны JOINs и поиск).
2. **Очередь обработки** — простая в SQLite + воркер-поллер (`scripts/worker.ts`). Без BullMQ/Redis в MVP.
3. **Auth** — один админ (логин/пароль из .env, bcrypt-хеш). Куки сессии в SQLite.
4. **basePath `/call-agent`** — все ссылки/fetch в клиентских компонентах должны включать префикс
   (`/call-agent/api/...`), потому что browser fetch не применяет basePath автоматически (применяется только к `next/link`).
5. **Next.js 16 specifics:**
   - `cookies()`, `headers()`, `params`, `searchParams` — все `async`, надо `await`
   - `middleware.ts` → `proxy.ts` (мы не используем — авторизация в RSC через `getSessionUser()`)
   - Turbopack по умолчанию
6. **MCP к Битриксу** в v1.1 — в MVP прямые REST вызовы через `BITRIX_WEBHOOK_URL`.

## Что делать НЕ нужно

- Не добавлять Tailwind (используем inline-styles + ds-* классы из `globals.css`).
- Не создавать БД-юзеров кроме админа в MVP.
- Не мокать Bitrix/Whisper/Claude в коде — в .env есть ключи.
- Не использовать Edge runtime для роутов, которые работают с файлами или SQLite — везде `export const runtime = "nodejs"`.
