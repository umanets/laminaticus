- main.js
    - Подключён electron-updater, добавлены события update-available, download-progress, update-downloaded и IPC start-update.
    - Миграция .env и data в userData; чтение .env из userData.
    - Логи в userData/data/app.log.
    - Пути для runner и docker-compose.yml берутся из process.resourcesPath в проде.
    - IPC get-paths для передачи пути dataDir в renderer.
- renderer.js
    - Запрашивает у main путь dataDir и использует его для error.log и папки data/prices.
    - Обновляет UI при событиях апдейта и дергает start-update по кнопке.
- index.html
    - Добавлены элементы: кнопка “Оновити додаток” и статус обновления.
- package.json
    - Добавлены electron-builder и electron-updater.
    - Скрипты: dist и publish.
    - Секция build с nsis для Windows и extraResources для необходимых папок/файлов.
    - В publish указаны плейсхолдеры GitHub YOUR_GITHUB_OWNER/YOUR_REPO.

Что нужно сделать вам

- Обновить publish-конфиг:
    - В package.json замените YOUR_GITHUB_OWNER и YOUR_REPO на реальные.
    - В окружении перед публикацией укажите GH_TOKEN с токеном GitHub, имеющим доступ к Releases.
- Установить зависимости и собрать:
    - npm install
    - Для проверки локально: npm run dist
    - Для публикации релиза: npm run publish
- Порядок деплоя после перехода на автоапдейты:
    - Делаете фичу → повышаете версию → npm run publish (релиз уходит в GitHub Releases).
    - Клиентская апка при старте увидит обновление, скачает и предложит “Оновити”. Данные и .env сохранятся автоматически.

Примечания

- Старые пути __dirname/data больше не используются для рабочих данных. Если раньше клали файлы туда вручную, теперь используйте папку userData (апка покажет актуальные статусы/кнопки).
- В dev-режиме (npm start) проверка обновлений не сработает — она рассчитана на упакованную сборку.
- Если вы хотите вместо GitHub Releases оставить текущую схему “git pull + локальный билд на клиенте”, скажите — сделаю второй вариант, который делает backup → git fetch/pull → билд → restore автоматически по кнопке. Но вариант с electron-updater надёжнее и проще для пользователя.

Releas pipeline: 
- increse version in package.json
- npm run publish
