# Azure SRE Agent self-study samples

Azure SRE Agent 학습 가이드 **1~7장 전체 105개 절**의 설명·구성·판단을 확인하는 한국어 워크샵입니다.
브라우저에서 [HTML 워크샵](docs/workshop.html)을 열고 **학습 A → Lab 0~13 → 학습 B → 학습 C → 회상 → 정리** 순서로 진행하세요.
GitHub의 HTML 소스 화면 대신 저장소를 clone한 뒤 로컬 파일을 열어야 합니다.

## 이해도 점검 기준

- **학습 A:** 1~2장 고객 영향/경쟁 가설, Monitor·Runbook·Agent·사람 역할, 상태별 증거와 인수인계.
- **Lab 0~13:** 3~6장의 실제 구성·조사·복구·통제·반복 운영. 유료 심화 구성을 생략해도 설계 과제와 회상은 필수입니다.
- **학습 B:** 7장 신뢰 한계/도입표, AAU 직접 계산과 필터별 CSV, 한도·Stop·Delete의 재개, 생성/scope 권한·리전·감사.
- **학습 C:** 기존 정답표 없이 새 사건 세 개, 생략 기능 설계, 실제 조사/복구와 1페이지 보고서. 20점 중 18점 이상이고 네 안전 항목 모두 2점.
- **105개 회상 카드:** 각 절의 설명 항목·원본 질문에 자신의 말로 답하고 적용·한계·실패 다음 행동을 설명해야 2점입니다. 해설에는 질문 답변뿐 아니라 각 설명 항목의 본문도 포함해 세부 개념을 대조할 수 있습니다.
- **24시간/7일 재시험:** 전체 회상과 사건 적용을 다시 확인합니다. 유료 리소스를 보관할 필요 없이 오프라인으로 복습할 수 있습니다.

Lab 완료 체크와 개념 자기점수는 별도로 저장됩니다.
모든 자기점수가 통과해도 실제 구성 검증·운영 승인·학습 인증을 자동 보증하지 않습니다.
미지원 기능은 “개념 확인, 실제 구성 미검증”으로 표시하세요.

## 예상 결과물과 참고 화면

각 Lab/학습 과제 마지막에 **18개 결과 예시 패널**이 있습니다.
상단 “예상 결과물” 목차에서 바로 열 수 있습니다.

- 리소스 목록과 `/version` JSON, 정상/장애 통계, KQL 결과 열
- RCA/회복/인수인계 보고서, Alert→Thread 연결표
- Python 도구의 실제 반환 계약, Hook 거부, private 조회 응답 형식
- 지식 수정 전후, 코드 SHA 대조, 예약/리포트, 평가/감사, DR/비용/정리 기록

정상과 세 장애의 수치 예시는 실제 로컬 샘플을 각 20쌍 실행한 결과입니다.
Azure 화면/보고서 형식 예시는 실제 Azure 실행 증거가 아니며, 자신의 ID/UTC/실측값으로 대조해야 합니다.
졸업 과제에는 새 사건 풀이 대신 제출 형식만 제공합니다.

MS Learn 공식 참고 이미지 **15개**를 관련 결과 패널에서 볼 수 있고 확대/원문 보기 기능을 제공합니다.
각 이미지에 출처·라이선스·어디를 봐야 하는지 설명을 붙였습니다.
이미지는 Microsoft Learn 원본 URL을 참조하므로 **인터넷이 필요**합니다.
오프라인/접근 실패 시 안내와 원문 링크를 표시하고 본문·출력 예시는 계속 읽을 수 있습니다.
이미지 출처와 공개 문서 소스 라이선스는 [image-sources.json](docs/image-sources.json)에 기록했습니다.
공식 스크린샷은 이 워크샵을 실행한 화면이 아니며 실제 ID/설정/사용량 증거로 제출하면 안 됩니다.

## 구성

| 경로 | 용도 |
|---|---|
| [docs/workshop.html](docs/workshop.html) | 클릭 경로, 생성 값, 프롬프트, 검증, 정리 절차를 포함한 오프라인 HTML |
| [docs/curriculum.json](docs/curriculum.json) | 원본 105개 절의 번호·주제·질문·해설과 출처 해시 |
| [docs/image-sources.json](docs/image-sources.json) | 공식 참고 이미지 URL, 원문/공개 소스와 라이선스 기록 |
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

- `node scripts/verify-workshop.mjs`: 1~7장 105개 절의 과제/회상 매핑, 20개 체크와 통합 채점표/HTML 검증.
- `node --test scripts/test/*.test.mjs`: 누락·중복 매핑과 해설 HTML 생성 검증.
- `npm test`: 카드만 지연되는지(>=1,700 ms), 계좌는 빠른지(<1,000 ms), 예외/503/입력 오류를 검증합니다.
- 실제 SDK의 요청·종속성·예외 envelope도 로컬 HTTPS 수집기로 검증합니다.
  이 테스트는 설치된 OpenSSL로 임시 인증서를 만들고 종료 시 정리하며, Azure에 전송하지 않습니다.
- `node scripts/traffic.mjs ... 20 healthy`: 양쪽 0% 실패, 각 p95 <=1,000 ms가 복구 기준입니다.
- `az bicep build --file infra/main.bicep --stdout`: IaC 구문 검증.
- 장애 변경에는 `rg-sre-workshop-*` 이름과 `workshop=azure-sre-agent` 태그를 요구합니다.
- 공개 HTTP 장애 제어 엔드포인트는 없습니다. App Service 구성 변경 권한이 있어야 장애를 바꿀 수 있습니다.
- App Insights 연결 문자열, HTTP Trigger URL, GitHub 키/토큰은 Git에 저장하지 마세요.
- 리소스를 실제 Azure에 배포하고 SRE Agent를 실행하는 검증은 학습자 구독에서 별도로 수행해야 합니다.

회상 카드는 `curriculum.json`에서 단일 HTML에 포함되므로 `file://`에서도 JSON fetch 없이 동작합니다.
원본 자료 변경 시 아래 생성기로 갱신합니다. 원본은 1~7장 각 절을 포함한 `study-content.json`이어야 합니다.

```bash
node scripts/build-curriculum.mjs ../Azure-SRE-Agent-Study/study-content.json
node scripts/verify-workshop.mjs
# JSON 변경 후 HTML 회상 부분만 다시 생성
node scripts/build-curriculum.mjs
```

## 정리

HTML의 정리 Lab을 먼저 진행해 예약 작업과 인시던트 수신을 중지하세요.
리소스 그룹을 삭제하면 그 안의 **모든** 리소스가 삭제되므로 이름과 태그를 직접 확인하고 실행합니다.

```bash
az group show --name rg-sre-workshop-kch01 --query '{name:name,tags:tags}' -o json
az group delete --name rg-sre-workshop-kch01
```

Agent/Grafana/네트워크를 별도 리소스 그룹에 만들었다면 그것도 별도로 정리해야 합니다.
