# InsureNet 서버 — 어디서나 동작하는 컨테이너 이미지
# (Railway, Fly.io, Google Cloud Run, 사내 서버 등)
FROM node:20-alpine

WORKDIR /app

# 의존성 먼저 설치 (캐시 활용)
COPY server/package*.json ./server/
RUN cd server && npm install --omit=dev

# 앱 소스 (프론트엔드 HTML/PWA 포함) 복사
COPY . .

# 데이터 저장 위치 (배포 플랫폼에서 볼륨을 여기에 마운트하면 영속화)
ENV DATA_DIR=/data
VOLUME ["/data"]

# 플랫폼이 PORT를 주입하면 그것을 사용, 없으면 4000
ENV PORT=4000
EXPOSE 4000

# JWT_SECRET 은 배포 환경변수로 주입하세요 (미지정 시 재시작마다 로그인 풀림)
CMD ["node", "server/server.js"]
