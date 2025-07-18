Для сборки winax под 32 бита:
```powershell
$env:PATH = "D:\work\laminaticus\node32;" + $env:PATH
npm i
npm rebuild --arch=ia32
```

```powershell
Set-ExecutionPolicy RemoteSigned -Scope Process
.\install.ps1
```

  
## PostgreSQL Backend for Report Watcher

Сервис report-watcher теперь сохраняет данные отчёта в PostgreSQL вместо JSON-файла.

1. Запустите Postgres через Docker Compose:
   ```bash
   docker-compose up -d
   ```

2. Установите зависимости report-watcher:
   ```bash
   cd report-watcher
   npm install
   cd ..
   ```

3. Настройте подключение к БД через переменные среды (по умолчанию):
   - PGHOST=localhost
   - PGPORT=5432
   - PGUSER=laminaticus
   - PGPASSWORD=laminaticus_pass
   - PGDATABASE=laminaticus

5. Build electron:
   ```
   npm run package-win
   ```

6. run in manual mode:
      ```
      run-services.bat
      node32/node.exe one-s-rest/scheduler.js
      ```