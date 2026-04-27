# Nginx 이미지: FE 정적파일 + 설정 파일을 모두 이미지에 포함
# 빌드 컨텍스트는 레포 루트 (docker-compose.yml 에서 지정)
# 런타임 bind mount 없음 → DooD(Jenkins) 환경에서도 안전하게 동작

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

# FE 정적파일
COPY --from=fe-builder /app/fe/dist /usr/share/nginx/html

# nginx 설정 템플릿 (HTTP-only / HTTPS 두 가지) + 선택 스크립트
# /docker-entrypoint.d/ 의 *.sh 는 nginx 공식 이미지가 기동 직전 자동 실행
COPY infra/nginx/default.conf      /etc/nginx/templates/http-only.conf
COPY infra/nginx/default-ssl.conf  /etc/nginx/templates/https.conf
COPY infra/nginx/select-config.sh  /docker-entrypoint.d/40-select-config.sh
RUN chmod +x /docker-entrypoint.d/40-select-config.sh
