Для сборки winax под 32 бита:
```powershell
$env:PATH = "D:\work\laminaticus\node32;" + $env:PATH
npm i
npm rebuild --arch=ia32
```

Set-ExecutionPolicy RemoteSigned -Scope Process
.\install.ps1