@echo off
chcp 65001 >nul
title ryokan-forecast Dev Environment

echo ============================================
echo   ryokan-forecast 開発環境 一括起動
echo ============================================
echo.

:: Docker確認
docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker Desktop が起動していません。先に起動してください。
    pause
    exit /b 1
)
echo [OK] Docker Desktop

:: Supabase起動
echo.
echo [1/3] Supabase を起動中...
cd /d "%~dp0"
npx supabase start
if errorlevel 1 (
    echo [ERROR] Supabase の起動に失敗しました。
    pause
    exit /b 1
)
echo [OK] Supabase (Studio: http://127.0.0.1:54423)

:: Next.js devサーバー（新しいウィンドウ）
echo.
echo [2/3] Next.js dev サーバーを起動中...
start "ryokan-forecast: Next.js" cmd /k "cd /d %~dp0 && npm run dev"
echo [OK] Next.js (http://localhost:3000)

:: Pythonワーカー（新しいウィンドウ）
echo.
echo [3/3] Python ワーカーを起動中...
start "ryokan-forecast: Worker" cmd /k "cd /d %~dp0worker && .venv\Scripts\activate && python worker.py"
echo [OK] Python Worker

echo.
echo ============================================
echo   全サービス起動完了
echo ============================================
echo.
echo   Supabase Studio : http://127.0.0.1:54423
echo   Next.js         : http://localhost:3000
echo   テストアカウント : test@ryokan.jp / password123
echo.
echo   停止: 各ウィンドウで Ctrl+C、その後 npx supabase stop
echo ============================================
pause
