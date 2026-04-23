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
                // nginx 이미지 빌드 시 내부적으로 FE(node:20-alpine)도 빌드되어 dist 포함됨.
                // fe/ 스캐폴딩 단계(package.json 없음)에서는 nginx 빌드만 실패.
                // 그 경우 backend/ai-server 만 선별 빌드:
                //   sh 'docker compose build --pull backend ai-server'
                sh 'docker compose build --pull'
            }
        }

        stage('Deploy (develop only)') {
            when { branch 'develop' }
            steps {
                sh 'docker compose up -d'
                sh 'docker compose ps'
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
