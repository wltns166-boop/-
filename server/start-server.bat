@echo off
chcp 65001 >nul
title 쇼츠 자동 업로드 서버
cd /d "%~dp0"
:start
echo.
echo [%date% %time%] 서버를 시작합니다. 이 창을 닫으면 업로드가 멈춥니다.
echo.
node server.js
echo.
echo [%date% %time%] 서버가 종료되었습니다. 5초 뒤 다시 켭니다. (완전히 끄려면 이 창을 닫으세요)
timeout /t 5 /nobreak >nul
goto start
