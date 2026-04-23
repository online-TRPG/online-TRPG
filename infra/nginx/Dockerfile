# Nginx 이미지: FE 정적파일을 빌드해서 포함 + 프록시 게이트웨이
# 빌드 컨텍스트는 레포 루트 (docker-compose.yml 에서 지정)

# =============== 1. FE 빌더 ===============
FROM node:20-alpine AS fe-builder

WORKDIR /fe

# 의존성 레이어 캐싱 (fe 소스 변경과 분리)
COPY fe/package*.json ./
RUN npm ci

# FE 소스 복사 후 빌드
COPY fe/ ./
RUN npm run build
# 결과물: /fe/dist


# =============== 2. Nginx 런타임 ===============
FROM nginx:alpine

# 빌드된 정적파일을 기본 Nginx html 경로에 배치
COPY --from=fe-builder /fe/dist /usr/share/nginx/html

# default.conf 는 compose 에서 볼륨으로 마운트 → 설정만 바꿀 땐 이미지 재빌드 불필요
