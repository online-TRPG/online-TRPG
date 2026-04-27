#!/bin/sh
# nginx 기동/리로드 직전 호출 — 인증서 존재 여부에 따라 HTTP-only / HTTPS 설정 선택.
# Phase 1 (인증서 없음): http-only 설정 → certbot 챌린지만 통과시킴
# Phase 2 (인증서 있음): https 설정 → 80→443 리다이렉트 + TLS 활성화
set -e

DOMAIN="${NGINX_DOMAIN:-k14a201.p.ssafy.io}"
CERT_PATH="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
TARGET="/etc/nginx/conf.d/default.conf"

if [ -f "$CERT_PATH" ]; then
  cp /etc/nginx/templates/https.conf "$TARGET"
  echo "[nginx-config] cert found → HTTPS mode"
else
  cp /etc/nginx/templates/http-only.conf "$TARGET"
  echo "[nginx-config] no cert → HTTP-only mode (ACME challenge ready)"
fi
