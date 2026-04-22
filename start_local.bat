@echo off
setlocal
cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm が見つかりません。Node.js をインストールしてください。
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [INFO] 依存関係をインストールします...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install に失敗しました。
    pause
    exit /b 1
  )
)

echo [INFO] Netlify 開発サーバーを起動します...
call npm run dev:netlify
