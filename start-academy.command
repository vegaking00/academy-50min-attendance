#!/bin/bash
cd "$(dirname "$0")"

if [ ! -d "node_modules" ]; then
  echo "처음 실행입니다. 필요한 패키지를 설치합니다..."
  npm install
fi

if [ ! -d "dist" ]; then
  echo "화면 파일을 준비합니다..."
  npm run build
fi

echo ""
echo "서버를 시작합니다. 이 창을 닫지 마세요!"
node server.js
