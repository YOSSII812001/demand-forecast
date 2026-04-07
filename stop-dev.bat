@echo off
chcp 65001 >nul
title ryokan-forecast 停止

echo ============================================
echo   ryokan-forecast 開発環境 停止
echo ============================================
echo.

cd /d "%~dp0"

echo Supabase を停止中...
npx supabase stop
echo [OK] Supabase 停止完了（Docker メモリ解放）

echo.
echo Next.js / Worker のウィンドウは手動で閉じてください（Ctrl+C）。
echo ============================================
pause
