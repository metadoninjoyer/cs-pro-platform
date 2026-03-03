# CS Pro Platform

Статический сайт на HTML/CSS/JS с автодеплоем на GitHub Pages.

## Локальный запуск

1. Открой проект:
   ```bash
   cd cs-pro-platform
   ```
2. Запусти локальный сервер:
   ```bash
   python -m http.server 5500
   ```
3. Открой в браузере:
   ```text
   http://localhost:5500/index.html
   ```

## Backend (MVP API)

В проект добавлен backend в папке `backend` с реальной авторизацией:

1. Установи зависимости backend:
   ```bash
   cd backend
   npm install
   ```
2. Запусти API:
   ```bash
   npm run dev
   ```
3. API будет доступен по адресу:
   ```text
   http://localhost:4000/api
   ```

Чтобы фронт + backend работали вместе локально:
- Терминал 1: `cd backend && npm run dev`
- Терминал 2 (в корне): `python -m http.server 5500`
- Открой: `http://localhost:5500/index.html`

### Настройка реального входа через Steam

1. Создай файл `.env` в папке `backend`:

   ```bash
   cd backend
   copy .env.example .env
   ```

2. Заполни переменные в `backend/.env`:

- `STEAM_API_KEY` — ключ Steam Web API
- `JWT_SECRET` — длинный случайный секрет для JWT (не оставляй `dev-secret-change-me`)
- `BACKEND_URL` — например `http://localhost:4000`
- `FRONTEND_URL` — например `http://localhost:5500`
- `CORS_ORIGINS` — список разрешённых origin через запятую (опционально), например `http://localhost:5500,http://127.0.0.1:5500`
- `SESSION_SECRET` — длинный случайный секрет для сессии (не оставляй `dev-session-secret-change-me`)
- `ACCESS_TOKEN_TTL` — TTL access token (по умолчанию `15m`)
- `REFRESH_TOKEN_TTL` — TTL refresh token (по умолчанию `30d`)
- `MAX_ACTIVE_REFRESH_TOKENS` — сколько активных refresh-сессий хранить на пользователя (по умолчанию `10`)

3. Переустанови зависимости backend (добавились новые пакеты):

   ```bash
   npm install
   ```

4. Запусти backend:

   ```bash
   npm run dev
   ```

Маршрут запуска Steam OAuth:

- `http://localhost:4000/api/auth/steam`

После успешного входа backend перенаправляет на [auth-callback.html](auth-callback.html),
страница сохраняет токен и выполняет редирект в профиль.

Проверка статуса безопасности:
- `GET /api/health` возвращает поле `secureSecrets`.
- Для production backend завершит запуск, если `JWT_SECRET`/`SESSION_SECRET` оставлены заглушками.
- На auth-маршрутах включён rate limit (защита от brute force), а также строгая валидация `nickname/email/password`.
- Для API включены security-заголовки (`helmet`), ограничение JSON payload и единый обработчик ошибок.
- Добавлена ротация refresh token: `access token` короткоживущий, при `401` фронт автоматически обновляет сессию через `/api/auth/refresh`.

Важно по безопасности:
- Если ключ Steam API уже попадал в чат/коммит, перевыпусти его в Steam и замени в `backend/.env`.
- Никогда не коммить `backend/.env` с реальными ключами.

## Деплой на GitHub Pages

В репозитории уже добавлен workflow:
- [.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml)

Что сделать в GitHub:
1. Открой репозиторий → `Settings` → `Pages`.
2. В `Build and deployment` выбери `Source: GitHub Actions`.
3. Сделай push в ветку `main`.
4. После успешного workflow сайт появится по адресу:
   ```text
   https://<your-username>.github.io/cs-pro-platform/
   ```

## Основные страницы

- `index.html`
- `news.html`
- `news-article.html`
- `profile.html`
- `settings.html`
- `top-players.html`