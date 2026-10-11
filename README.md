# Azure SRE Agent self-study samples

Azure SRE Agent 학습 가이드 **3~6장**을 직접 구성해 보는 한국어 워크샵입니다.
브라우저에서 [HTML 워크샵](docs/workshop.html)을 열고 Lab 0부터 순서대로 진행하세요.
GitHub의 HTML 소스 화면 대신 저장소를 clone한 뒤 로컬 파일을 열어야 합니다.

## 구성

| 경로 | 용도 |
|---|---|
| [docs/workshop.html](docs/workshop.html) | 클릭 경로, 생성 값, 프롬프트, 검증, 정리 절차를 포함한 오프라인 HTML |
| [samples/payment-api](samples/payment-api) | Node.js 결제 API + 실제 HTTP로 호출하는 로컬 provider stub |
| [infra/main.bicep](infra/main.bicep) | Linux B1 App Service, Log Analytics, Application Insights |
| [scripts/deploy.sh](scripts/deploy.sh) | 배포 commit 고정, 리소스 생성, ZIP 배포 |
| [scripts/scenario.sh](scripts/scenario.sh) | 환경 변수로 장애 설정 및 적용 확인 |
| [scripts/traffic.mjs](scripts/traffic.mjs) | 카드/계좌 요청과 실패율·p95 검증 |
| [queries/investigation.kql](queries/investigation.kql) | 요청·종속성·예외·상관관계 조회 |
| [operations](operations) | 업로드할 운영 맥락, Skill, 인시던트 기록 양식 |

## 로컬 실행

Node.js **22 이상**, npm이 필요합니다. 실제 결제나 외부 결제 시스템은 사용하지 않습니다.

```bash
git clone https://github.com/Kimcheolhui/Azure-SRE-Agent-Samples.git
cd Azure-SRE-Agent-Samples/samples/payment-api
npm ci
npm test
npm start
```

다른 터미널에서:

```bash
cd Azure-SRE-Agent-Samples
node scripts/traffic.mjs http://localhost:8080 20 healthy
```

장애를 로컬에서 실행하려면 기존 서버를 `Ctrl+C`로 종료하고 아래처럼 다시 시작합니다.

```bash
cd samples/payment-api
SRE_SCENARIO=dependency-slow npm start
```

각 장애별 검증 명령은 마지막 인자에 `dependency-slow`, `payment-exception`,
`unavailable`을 지정합니다. 지정한 장애에서 예상되는 500/503은 정상적인
**장애 재현 결과**이며, 실제 오류율은 출력에 그대로 남깁니다.
예상 장애를 지정하지 않은 실행은 모든 HTTP 오류에 대해 종료 코드 1을 반환합니다.

## Azure 배포

전용 실습 구독 또는 리소스 그룹만 사용하세요. B1 요금제와 SRE Agent는 유료입니다.
SRE Agent, Managed Grafana, VNet, Key Vault는 기본 Bicep에서 만들지 않습니다.
워크샵에서 필요한 단계에만 명시적으로 생성합니다.

```bash
az login
az account set --subscription "<YOUR_SUBSCRIPTION_ID>"
bash scripts/deploy.sh rg-sre-workshop-kch01 sre-pay-kch01x7 eastus2
bash scripts/scenario.sh rg-sre-workshop-kch01 sre-pay-kch01x7 dependency-slow
```

위 앱 이름의 접미사는 자신의 고유한 **소문자/숫자 접미사**로 바꿔야 합니다.
SRE Agent 지원 리전과 App Service/Log Analytics 배포 리전은 다를 수 있습니다.
포털에 표시되는 현재 지원 리전을 확인하세요.

## 진단 데이터

Application Insights Node SDK로 요청, HTTP 종속성, 예외를 명시적으로 전송합니다.
`customDimensions`에 `paymentMethod`, `scenario`, `sourceCommit`, `traceId`가 들어갑니다.
격리된 수동 TelemetryClient를 사용해 자동 요청/종속성 수집으로 인한 중복을 방지합니다.
종속성은 같은 App Service 프로세스의 `/provider`로 보내는 실제 loopback HTTP 요청입니다.
분산 시스템 전체를 구현한 샘플은 아니며, DB 병목이라고 주장하면 오답입니다.
SDK가 자동 생성한 `operation_Id`에 의존하지 않고 명시적 `traceId`로 조인하는 쿼리를 제공합니다.

## 검증과 안전

- `npm test`: 카드만 지연되는지(>=1,700 ms), 계좌는 빠른지(<1,000 ms), 예외/503/입력 오류를 검증합니다.
- 실제 SDK의 요청·종속성·예외 envelope도 로컬 HTTPS 수집기로 검증합니다.
  이 테스트는 설치된 OpenSSL로 임시 인증서를 만들고 종료 시 정리하며, Azure에 전송하지 않습니다.
- `node scripts/traffic.mjs ... 20 healthy`: 양쪽 0% 실패, 각 p95 <=1,000 ms가 복구 기준입니다.
- `az bicep build --file infra/main.bicep --stdout`: IaC 구문 검증.
- 장애 변경에는 `rg-sre-workshop-*` 이름과 `workshop=azure-sre-agent` 태그를 요구합니다.
- 공개 HTTP 장애 제어 엔드포인트는 없습니다. App Service 구성 변경 권한이 있어야 장애를 바꿀 수 있습니다.
- App Insights 연결 문자열, HTTP Trigger URL, GitHub 키/토큰은 Git에 저장하지 마세요.
- 리소스를 실제 Azure에 배포하고 SRE Agent를 실행하는 검증은 학습자 구독에서 별도로 수행해야 합니다.

## 정리

HTML의 정리 Lab을 먼저 진행해 예약 작업과 인시던트 수신을 중지하세요.
리소스 그룹을 삭제하면 그 안의 **모든** 리소스가 삭제되므로 이름과 태그를 직접 확인하고 실행합니다.

```bash
az group show --name rg-sre-workshop-kch01 --query '{name:name,tags:tags}' -o json
az group delete --name rg-sre-workshop-kch01
```

Agent/Grafana/네트워크를 별도 리소스 그룹에 만들었다면 그것도 별도로 정리해야 합니다.
