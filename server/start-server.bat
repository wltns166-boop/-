@echo off
chcp 65001 >nul
title 쇼츠 자동 업로드 서버
cd /d "%~dp0"
if not exist "server.js" cd /d "%USERPROFILE%\OneDrive\Desktop\인트라넷\프로젝트\--claude-vigilant-thompson-f9r2pz\server"
if not exist "server.js" (
  echo.
  echo 서버 폴더를 찾을 수 없습니다. 이 파일을 server.js가 있는 폴더에 두고 실행하세요.
  echo.
  pause
  exit /b 1
)
:start
echo.
echo [%date% %time%] 서버를 시작합니다. 이 창을 닫으면 업로드가 멈춥니다.
echo.
node server.js
echo.
echo [%date% %time%] 서버가 종료되었습니다. 5초 뒤 다시 켭니다. (완전히 끄려면 이 창을 닫으세요)
timeout /t 5 /nobreak >nul
goto start
