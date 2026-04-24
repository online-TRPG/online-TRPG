# Nginx 이미지: FE 정적파일을 빌드해서 포함 + 프록시 게이트웨이
# 빌드 컨텍스트는 레포 루트 (docker-compose.yml 에서 지정)
# npm workspaces 모노레포 — fe 는 @trpg/shared-types 에 의존

# =============== 1. FE 빌더 ===============
FROM node:20-alpine AS fe-builder
WORKDIR /app

# workspace 정의 + 루트 lock + 루트 tsconfig + 각 workspace package.json (의존성 레이어 캐시)
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared-types/package.json ./shared-types/
COPY be/package.json ./be/
COPY fe/package.json ./fe/

RUN npm ci

# shared-types 빌드 (fe 가 dist 를 참조)
COPY shared-types/ ./shared-types/
RUN npm run build -w @trpg/shared-types

# fe 소스 복사 후 빌드
COPY fe/ ./fe/
RUN npm run build -w @trpg/fe
# 결과물: /app/fe/dist


# =============== 2. Nginx 런타임 ===============
FROM nginx:alpine

# 빌드된 정적파일을 기본 Nginx html 경로에 배치
COPY --from=fe-builder /app/fe/dist /usr/share/nginx/html

# default.conf 는 compose 에서 볼륨으로 마운트 → 설정만 바꿀 땐 이미지 재빌드 불필요
