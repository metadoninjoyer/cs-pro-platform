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