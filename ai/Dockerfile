# syntax=docker/dockerfile:1.6
# uv 기반 멀티스테이지. context 는 레포 루트 (docker-compose.yml 에서 지정).

# =============== 1. 빌더: 의존성 설치 ===============
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS builder

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

WORKDIR /app

# 의존성 먼저 (lock 변경 없을 때 레이어 캐시 재사용)
COPY ai/pyproject.toml ai/uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev

# 소스 복사
COPY ai/ ./

# Syntax 검증 (머지 잔재로 인한 SyntaxError 가 build 시점에 잡히도록)
RUN python -m compileall -q app


# =============== 2. 런타임: 슬림 이미지 ===============
FROM python:3.12-slim-bookworm AS runtime

# 비루트 유저
RUN groupadd --system app && useradd --system --gid app --home-dir /app app

COPY --from=builder --chown=app:app /app /app

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app
USER app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
