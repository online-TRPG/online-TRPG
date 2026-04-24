# /be/Dockerfile — NestJS 백엔드 (npm workspaces 모노레포, 빌드 컨텍스트=레포 루트)

# 1. 빌드 스테이지
FROM node:20-alpine AS builder
WORKDIR /app

# workspace 정의 + 루트 lock + 각 workspace 의 package.json 만 먼저 복사 (의존성 레이어 캐시)
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared-types/package.json ./shared-types/
COPY be/package.json ./be/
COPY fe/package.json ./fe/

# 전체 workspace 의존성 설치 (hoisted 된 node_modules 가 루트에 생성됨)
RUN npm ci

# shared-types 소스 + 빌드 (be 가 dist 를 참조)
COPY shared-types/ ./shared-types/
RUN npm run build -w @trpg/shared-types

# backend 소스 복사
COPY be/ ./be/

# Prisma 클라이언트 생성 (NestJS 컴파일 시 타입 필요)
RUN npm run prisma:generate -w @trpg/be

# backend 빌드
RUN npm run build -w @trpg/be

# 2. 런타임 스테이지 — prod 의존성만 재설치해서 이미지 최소화
FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY shared-types/package.json ./shared-types/
COPY be/package.json ./be/
COPY fe/package.json ./fe/
RUN npm ci --omit=dev && npm cache clean --force

# 빌드 산출물 복사
COPY --from=builder --chown=node:node /app/shared-types/dist ./shared-types/dist
COPY --from=builder --chown=node:node /app/be/dist ./be/dist
# Prisma generated client (schema 기반 생성 코드)
COPY --from=builder --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
# Prisma CLI 도 포함 — `docker compose exec backend npx prisma db push` 등 마이그레이션 명령을 위해
COPY --from=builder --chown=node:node /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder --chown=node:node /app/node_modules/.bin/prisma ./node_modules/.bin/prisma
# Prisma schema
COPY --from=builder --chown=node:node /app/be/prisma ./be/prisma

WORKDIR /app/be

# 루트 대신 node 유저로 실행 (보안)
USER node

EXPOSE 8080

# NestJS 서버 실행 (package.json 에 start:prod 없음 → 직접 실행)
CMD ["node", "dist/main.js"]
