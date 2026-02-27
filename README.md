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