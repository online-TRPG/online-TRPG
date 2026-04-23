# /be/Dockerfile

# 1. 빌드 환경 (Node.js)
FROM node:20-alpine AS builder
WORKDIR /app

# shared-types는 be가 의존하므로 먼저 복사
COPY shared-types/ ./shared-types/

# 의존성 파일만 먼저 복사해서 npm 캐시 레이어를 유지 (소스 변경 시 재설치 방지)
COPY be/package.json be/package-lock.json* ./be/
WORKDIR /app/be
RUN npm ci

# 소스 복사 후 빌드
COPY be/ /app/be/
RUN npm run build

# devDependencies 제거 (런타임에 필요 없음)
RUN npm prune --omit=dev

# 2. 실행 환경 (가벼운 이미지로 새로 시작)
FROM node:20-alpine
WORKDIR /app/be

ENV NODE_ENV=production

# 빌드 결과물과 프로덕션 node_modules만 복사
COPY --from=builder --chown=node:node /app/be/dist ./dist
COPY --from=builder --chown=node:node /app/be/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/be/package.json ./

# 루트 대신 node 유저로 실행 (보안)
USER node

EXPOSE 8080

# NestJS 서버 실행
CMD ["npm", "run", "start:prod"]
