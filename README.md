# Call-Agent

AI-агент анализа звонков Битрикс24.

- Принимает webhook от Битрикс о завершённом звонке
- Скачивает запись, транскрибирует через OpenAI Whisper
- Анализирует разговор через Claude (Sonnet 4.6)
- Возвращает выжимку в карточку CRM (Сделка/Лид)
- Дашборд: метрики по менеджерам, настроениям, темам, возражениям

## Стек

- Next.js 16 (App Router, basePath `/call-agent`)
- SQLite (better-sqlite3) + FTS5 для поиска по транскриптам
- OpenAI Whisper (транскрипция)
- Anthropic Claude (анализ)
- PM2 (двойной процесс: web + worker)

## Локальная разработка

```bash
cp .env.example .env.local
# заполнить ADMIN_LOGIN/PASSWORD_HASH и ключи API

npm install
npm run dev          # → http://localhost:3002/call-agent
```

Воркер очереди в отдельном терминале:

```bash
npm run worker
```

## Деплой

См. [deploy/README.md](deploy/README.md).

## Структура

```
src/
  app/
    (app)/                     # авторизованная зона (group route, без сегмента в URL)
      dashboard/page.tsx
      calls/page.tsx
      calls/[id]/page.tsx
      settings/page.tsx
      layout.tsx               # shell с сайдбаром и проверкой сессии
    login/page.tsx
    api/
      auth/{login,logout}/
      webhook/bitrix/          # приём событий из Битрикса
      calls/
      calls/[id]/
      calls/[id]/process/      # ручной перезапуск обработки
      recordings/[id]/         # стриминг mp3 для плеера
      script/                  # сохранение эталонного скрипта продаж
      stats/
    page.tsx                   # redirect → /dashboard или /login
    layout.tsx
    globals.css
  lib/
    db.ts                      # SQLite + миграции
    auth.ts                    # cookie-сессии
    bitrix.ts                  # REST клиент к Битрикс24
    transcribe.ts              # Whisper
    analyzer.ts                # Claude
    pipeline.ts                # полный pipeline одного звонка
scripts/
  migrate.ts
  worker.ts                    # отдельный PM2 процесс — обработчик очереди
data/                          # SQLite файлы (в .gitignore)
storage/recordings/            # mp3 записи (в .gitignore)
deploy/
  nginx-snippet.conf
  README.md
ecosystem.config.js            # PM2 конфиг (2 процесса: web + worker)
next.config.ts                 # basePath: '/call-agent'
```

## API

| Метод | Путь | Описание |
|---|---|---|
| `POST` | `/api/webhook/bitrix?token=...` | Приём событий Битрикса (`OnVoximplantCallEnd`, `ONCRMACTIVITYADD`) |
| `POST` | `/api/auth/login` | Логин (cookie сессия) |
| `POST` | `/api/auth/logout` | Логаут |
| `GET`  | `/api/calls?status=&sentiment=&q=` | Список звонков с фильтрами |
| `GET`  | `/api/calls/:id` | Звонок + транскрипт + анализ |
| `POST` | `/api/calls/:id/process` | Перезапуск обработки звонка |
| `GET`  | `/api/recordings/:id` | mp3 для плеера |
| `POST` | `/api/script` | Сохранить эталонный скрипт продаж |
| `GET`  | `/api/stats` | Сводные метрики для дашборда |

## БД (SQLite)

`calls`, `transcripts` (+ FTS5), `analyses`, `managers`, `sales_scripts`, `settings`, `sessions`.
