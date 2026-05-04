// Jenkinsfile — EC2 동일 호스트에서 docker compose 로컬 배포
//
// 사전 요건 (Jenkins 관리자 설정):
//  1) Jenkins 컨테이너에 docker.sock 마운트 + docker CLI 설치 (되어 있음)
//  2) Jenkins Credentials 에 Secret file 3종 등록:
//       - env-root      → 루트 .env
//       - env-backend   → .env.backend
//       - env-ai        → .env.ai
//  3) Jenkins Job → Pipeline from SCM → GitLab(lab.ssafy.com) 연결 + Webhook 설정
//     트리거: Push to develop / Merge Request events
//
// 주: FE 빌드는 nginx 멀티스테이지 Dockerfile 안에서 수행 (docker compose build 시 자동).
//     Jenkins 컨테이너의 workspace 경로 ≠ 호스트 경로인 DooD 환경에서도 compose 빌드는 문제없음.

pipeline {
    agent any

    options {
        timestamps()
        timeout(time: 30, unit: 'MINUTES')
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '20'))
    }

    environment {
        DOCKER_BUILDKIT = '1'
        COMPOSE_DOCKER_CLI_BUILD = '1'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
                sh 'git rev-parse --short HEAD'
            }
        }

        stage('Prepare env files') {
            steps {
                withCredentials([
                    file(credentialsId: 'env-root',    variable: 'ENV_ROOT'),
                    file(credentialsId: 'env-backend', variable: 'ENV_BACKEND'),
                    file(credentialsId: 'env-ai',      variable: 'ENV_AI')
                ]) {
                    sh '''
                        cp "$ENV_ROOT"    .env
                        cp "$ENV_BACKEND" .env.backend
                        cp "$ENV_AI"      .env.ai
                    '''
                }
            }
        }

        stage('Compose: build images') {
            steps {
                sh 'docker compose build --pull'
            }
        }

        stage('Deploy (develop only)') {
            when { branch 'develop' }
            steps {
                // 1) 데이터 계층부터 기동 (postgres healthy 까지 대기)
                sh 'docker compose up -d --wait postgres redis ai-server'

                // 2) prod DB 백업 — db push 직전에 pg_dump 떨굼.
                //    --accept-data-loss 가 데이터를 날렸을 때 이 dump 로 pg_restore.
                //    last 20 만 유지 (Jenkins buildDiscarder 와 정렬). 백업 실패 시 stage abort.
                //    저장 위치: db_backups named volume (host bind mount X — DooD 정책).
                sh '''
                    set -e
                    SHORT_SHA=$(git rev-parse --short HEAD)
                    BACKUP_NAME="pre-deploy-${BRANCH_NAME}-${BUILD_NUMBER}-${SHORT_SHA}.dump"
                    docker compose exec -T postgres sh -c "
                        pg_dump -U \\$POSTGRES_USER -d \\$POSTGRES_DB -Fc -f /backups/${BACKUP_NAME} \
                        && ls -t /backups/pre-deploy-*.dump 2>/dev/null | tail -n +21 | xargs -r rm -f
                    "
                    echo "Backup created: ${BACKUP_NAME}"
                '''

                // 3) Prisma schema → DB 동기화 (backend 컨테이너 임시 실행 후 삭제)
                //    마이그레이션 파일이 없어 `db push` 사용. 초기 개발 단계라 허용.
                sh 'docker compose run --rm --entrypoint "" backend sh -c "cd /app/be && npx prisma db push --schema prisma/schema.prisma --skip-generate --accept-data-loss"'

                // 4) 나머지 (backend + nginx + certbot) 기동
                sh 'docker compose up -d'
                sh 'docker compose ps'

                // 5) 배포 후 smoke — nginx / ai-health / backend 셋 다 응답하는지 확인.
                //    ai-server 가 startup 시 google-genai 초기화로 시간 걸리므로 잠시 대기.
                //    실패 시 stage fail (set -e) → Jenkins 알림으로 빠른 인지.
                sh '''
                    set -e
                    sleep 8

                    NGINX_CODE=$(curl -fsS -o /dev/null -w "%{http_code}" -m 10 https://k14a201.p.ssafy.io/)
                    echo "smoke nginx_root=${NGINX_CODE}"

                    docker compose exec -T ai-server python -c "import urllib.request; r=urllib.request.urlopen('http://localhost:8000/internal/ai/health', timeout=5); print('smoke ai_health=' + str(r.status))"

                    # backend 는 인증 필요 endpoint 라 4xx 정상. node fetch 는 status code 받으면 응답으로 인식, network 실패 시만 throw.
                    docker compose exec -T backend node -e "fetch('http://localhost:8080/api/v1/users/me').then(r=>console.log('smoke backend_users_me=' + r.status)).catch(e=>{console.error('backend_smoke_error',e.message);process.exit(1)})"
                '''
            }
        }
    }

    post {
        always {
            sh 'docker image prune -f || true'
            // .env* 는 workspace 에 유지. 파이프라인 외부에서 `docker compose restart/ps/logs`
            // 실행 시 compose 가 env_file 을 파싱할 수 있어야 하므로 삭제 금지.
            // credentials 로부터 매 빌드마다 덮어써지므로 stale 이슈 없음.
        }
        success {
            echo "Pipeline success: ${env.BRANCH_NAME}"
        }
        failure {
            echo "Pipeline failed: ${env.BRANCH_NAME}"
        }
    }
}
