@echo off
chcp 65001 > nul
title 리더스아트 50분 출석부 서버
cd /d "%~dp0"

if not exist "node_modules" (
  echo 처음 실행입니다. 필요한 패키지를 설치합니다...
  call npm install
)

if not exist "dist" (
  echo 화면 파일을 준비합니다...
  call npm run build
)

echo.
echo 서버를 시작합니다. 이 창을 닫지 마세요!
node server.js
pause
