# Azure SRE Agent AKS self-study samples

AKS에 결제 앱을 컨테이너로 배포하고 장애 재현·조사·복구를 직접 확인하는 한국어 워크샵입니다.
[HTML 워크샵](docs/workshop.html)을 로컬 브라우저에서 열고 개념 설명 → Lab 0부터 진행하세요.
노트 작성 과제, 학습자 채점과 원본 절 번호 매핑은 없습니다.

## 구성

| 경로 | 용도 |
|---|---|
| [docs/workshop.html](docs/workshop.html) | AKS/Portal/CLI 설정, 실제 결과 예시, 공식 이미지, 복구·정리 |
| [infra/main.bicep](infra/main.bicep) | AKS, ACR, VNet, 관리 ID/RBAC, Log Analytics, App Insights |
| [k8s/workload.yaml](k8s/workload.yaml) | namespace, 2-replica Deployment, ClusterIP Service |
| [samples/payment-api](samples/payment-api) | 별도 API/provider HTTP 서비스, Dockerfile |
| [scripts/deploy.sh](scripts/deploy.sh) | ACR remote build, SHA→digest 고정, Secret 주입과 rollout |
| [scripts/connect.sh](scripts/connect.sh) | 전용 kubeconfig에 Entra/Azure CLI 로그인 연결 |
| [scripts/monitoring.sh](scripts/monitoring.sh) | 실패 경고/action group, Disabled 동적 경고, Kubernetes audit를 Bicep으로 생성 |
| [scripts/provision-connection.sh](scripts/provision-connection.sh) | 선택 실습의 Grafana/Key Vault와 secret 접근 역할 생성 |
| [scripts/scenario.sh](scripts/scenario.sh) | Deployment env 장애와 ImagePullBackOff 재현·정상 digest 복구 |
| [scripts/export-agent-source.mjs](scripts/export-agent-source.mjs) | 선택적으로 런타임 코드 snapshot 생성 (Lab 7 연결에는 필요 없음) |
| [scripts/traffic.mjs](scripts/traffic.mjs) | 카드/계좌 요청 실패율·p95 검증 |
| [queries](queries) | App Insights/Kubernetes 로그·이벤트 조회 |
| [tools](tools) | 측정값 통계와 Pod 상태 요약 Python 도구 (Lab 6-3·6-4 선택 실습) |
| [operations](operations) | 운영 문서, Skill, 선택적 incident report 양식 |

본문·17개 결과 예시와105개 주제 설명은 오프라인에서 읽을 수 있습니다.
MS Learn 공식 이미지15개는 원본 URL을 사용하므로 인터넷이 필요합니다.
확대/원문 보기와 실패 안내를 제공하며 출처는 [image-sources.json](docs/image-sources.json)에 있습니다.
공식 화면은 이 실습을 수행한 증거가 아니므로 실제 결과와 구분하세요.

## SRE Agent 생성 값

[워크샵 Lab 0-3](docs/workshop.html#agent-setup)에 Portal에서 입력할 항목을 단계별로 정리했습니다.
현재 AKS의 `eastus2` 리전과 같은 구독에서 다음 값을 사용합니다.

| 항목 | 값 (`kch01x7` 기준) |
|---|---|
| Agent RG | `rg-payment-agent-kch01x7` |
| Agent 이름 | `sre-payments-kch01x7` |
| 리전 | East US 2 (`eastus2`) |
| 모델 공급자 | Anthropic 선택, 개별 모델은 서비스가 자동 선택 |
| Application Insights | 필수 항목에서 **Create new** 선택, Agent 배포 시 자동 생성 |
| Agent workspace | 위 App Insights에 연결되는 LAW 자동 생성 |
| 조사 대상 | `rg-payment-kch01x7` |
| 초기 permission / mode | Reader / Review |
| 월 active-flow 한도 초기값 | 5,000 AAU |

SRE Agent 생성 화면에서 Resource group → **Create new**로 Agent 전용 RG를 만듭니다.
Application Insights → **Create new**를 선택하면 App Insights와 연결된 LAW도 배포 과정에서 자동 생성됩니다.
RG·App Insights·LAW를 Azure Portal에서 미리 만들 필요는 없습니다.
배포 후 Agent → Monitor → Logs에서 실제 관측 리소스와 연결된 LAW를 확인합니다.
이미 만들어 둔 Agent용 App Insights가 있다면 기존 리소스 선택도 가능하며 자동 생성과는 대안입니다.
앱 관측용 `appi-aks-payment-kch01x7`의 연결 문자열이나 Kubernetes Secret은 바꾸지 않습니다.
East US 2의 Model provider에서 Anthropic을 선택하고, 기본값이 Anthropic이면 유지합니다.
별도 Anthropic API key나 모델 배포를 준비할 필요는 없습니다.
Agent 이름에는 `sre-`, 리소스 그룹에는 `rg-` 접두사를 사용하고 자동 생성되는 관측 리소스의 이름은 배포 후 확인합니다.
워크샵은 생성 절차를 안내할 뿐 위 Agent 리소스를 자동 생성하지 않습니다.
평가 전에는 코드·지식·인시던트·예약 연결을 추가하지 않고 실제 읽기 조회를 먼저 확인합니다.
Azure 리소스에서 RG를 Reader로 성공적으로 추가하면 같은 RG의 LAW/App Insights에
Log Analytics Reader/Monitoring Reader 등 상속 권한이 적용됩니다. 실제 실행 UAMI의 IAM 역할은 확인해야 합니다.
초기 **로그 +** 카드는 원본 지정뿐 아니라 저장 시 필요한 Log Analytics Reader/Monitoring Reader 역할도 자동 할당합니다.
Configure logging provider → Log Analytics Workspace → Next에서
`law-aks-payment-kch01x7`과 현재 지원되는 경우 `appi-aks-payment-kch01x7`을 선택합니다.
Agent 생성 시 자동 생성한 감사용 App Insights/LAW를 workload 로그 원본으로 대신 선택하지 않습니다.
동일 RG에 이미 권한이 있으면 역할 효과는 겹칠 수 있습니다. 실제 연결 관리 ID와 적용 scope/저장 결과를 확인합니다.
로그 카드 표시와 실제 query 성공은 다르므로 다른 RG의 workspace, access mode/네트워크, 별도 connector 신원을 구분합니다.
SRE Agent의 Reader 권한 수준은 일반 Azure Reader 역할 하나와 다릅니다.
AKS가 있는 RG 연결에서 Cluster User와 AKS RBAC Reader도 자동 할당될 수 있으므로,
Pod 접근은 **자동 역할·상속 확인 → 실제 조회** 순서로 진행합니다.
이미 적용된 역할이 있으면 수동 추가는 하지 않으며, 부족한 역할이 실제 확인될 때만 예외 절차를 사용합니다.

## 로컬 실행

Node.js **22 이상**, npm이 필요합니다.

```bash
git clone https://github.com/Kimcheolhui/Azure-SRE-Agent-Samples.git
cd Azure-SRE-Agent-Samples/samples/payment-api
npm ci
npm test
npm start
```

다른 터미널에서 provider도 실행합니다.

```bash
cd Azure-SRE-Agent-Samples/samples/payment-api
npm run start:provider
```

그다음 저장소 루트에서:

```bash
node scripts/traffic.mjs http://127.0.0.1:8080 20 healthy
```

API와 provider는 별도 서버입니다. 실제 은행/DB나 고객 데이터는 사용하지 않습니다.

## GitHub 저장소 연결

런타임에는 장애 모드/시뮬레이션 switch, 인위적 sleep, 장애 이름의 로그·응답 필드가 없습니다.
API는 일반 merchant/endpoint/timeout 설정을 사용하고 provider는 실제 카드 서명 연산을 합니다.
리소스 이름/태그는 `rg-payment-*`, `aks-payment-*`, `application=payments`, namespace `payments`입니다.
`healthy-image` 같은 Kubernetes annotation도 없으며 복구용 digest는 학습자 로컬 `artifacts/release-<cluster>.json`에만 있습니다.

Lab 7에서는 **Builder → Code Access → GitHub**에서 다음 저장소 전체를 읽기 권한으로 연결합니다.
런타임 파일 추출이나 별도 코드 저장소 준비는 필요하지 않습니다.

```text
https://github.com/Kimcheolhui/Azure-SRE-Agent-Samples
```

Owner는 `Kimcheolhui`, Repository는 `Azure-SRE-Agent-Samples`, 기본 브랜치는 `main`입니다.
앱 코드뿐 아니라 이 저장소의 문서·테스트·배포 스크립트도 연결 범위에 포함됩니다.

원인을 알려 주지 않는 질문 예: “카드 결제가 느리다는 보고가 있어. 원인과 영향 범위를 조사해 줘.”
scenario 이름, 변경한 변수/값, 예상 RCA나 복구 명령은 질문에 넣지 않습니다.

Lab 7-2·7-3의 BYO GitHub App/Key Vault, Lab 8의 Agent 복구 실행,
Lab 9-4의 PostToolUse는 `(Optional)`입니다.
Lab 9-1은 본인에게 테스트 메일을 보낸 뒤, 실제 경고의 조사 스레드에서
원인 분석과 권장 조치 방법을 메일로 전달하는 실습입니다. 메일 전송과 서비스 복구는 별개입니다.

## Lab 3 이후 반복 가능한 Azure 설정

저장소 루트에서 기존 `RG`, `CLUSTER`, `SUFFIX`, `LOCATION` 변수를 사용합니다.
AKS를 다시 배포하지 않습니다.

```bash
bash scripts/monitoring.sh "$RG" "$CLUSTER" alerts --what-if
bash scripts/monitoring.sh "$RG" "$CLUSTER" alerts
bash scripts/monitoring.sh "$RG" "$CLUSTER" audit
```

- 실패 경고는 LAW의 `FailedRequests > 5`, 5분 window/1분 평가, Sev2, 자동 해제입니다.
- 같은 이름의 action group이 있으면 수신자를 유지합니다. 새 그룹은 이메일/Webhook 없이 만듭니다.
- Lab 3은 Azure Monitor 경고 → response plan → Custom Agent 조사 경로만 실습합니다.
- HTTP Trigger와 동적 임계값 실습은 제외합니다. 동적 경고용 Bicep/스크립트는 참고용으로 유지하며 기본 Disabled입니다.
- 조사 후 정상 복구와 경고 Resolved를 확인한 뒤, 실습 경고를 Disabled와 response plan을 Off로 종료합니다.
- audit는 `AKSAuditAdmin`에 저장합니다. 설정 이전 변경은 소급 수집되지 않습니다.
- Azure Monitor 경고 수집은 구독 범위입니다. 관리 RG의 조사 권한과 response plan의 선택 필터는 별개입니다.

Grafana/Key Vault는 선택 실습이며 추가 비용과 역할 할당 권한이 필요합니다.
Grafana는 SRE Agent의 **Azure Managed Grafana 전용 커넥터**에서 기존 인스턴스와
**Viewer (read-only)**를 선택합니다. 별도 MCP URL/service account token은 필요 없습니다.
이미 만든 Grafana는 재배포하지 않고 사용합니다. 새 리소스 템플릿은 API key를 비활성화합니다.
Key Vault의 `AGENT_PRINCIPAL`은 실제 connector 실행 UAMI의 Object ID를 지정합니다.
PEM은 template에 넣지 않고 `az keyvault secret set --file ... -o none`으로 업로드합니다.

```bash
bash scripts/provision-connection.sh grafana "$SUFFIX" "$LOCATION"
bash scripts/provision-connection.sh keyvault "$SUFFIX" "$LOCATION"
```

private AKS는 먼저 인프라만 생성한 뒤 새 VNet에 접근할 관리 호스트에서 workload를 배포합니다.

```bash
bash scripts/deploy.sh rg-payment-private-kch01x7 \
  aks-payment-private-kch01x7 acrpaymentprivatekch01x7 eastus2 private --infra-only
```

코드 연결은 Lab 7에서 Samples 저장소 전체로 진행합니다.
배포 코드 대조에는 실제 `/version`의 SHA를 사용하며 최신 `main`과 동일하다고 가정하지 않습니다.

## Azure AKS 배포

필요 도구: Azure CLI, Git, Node.js22+, kubectl, kubelogin.
AKS/ACR/VNet 생성과 역할 할당을 위해 실습 RG에 Owner 또는 Contributor + User Access Administrator가 필요합니다.
배포 스크립트는 현재 Entra 사용자를 해당 실습 AKS의 RBAC Cluster Admin으로 할당합니다.
SRE Agent에는 별도의 namespace-scoped 읽기/쓰기 권한을 설정합니다.
이미지는 `az acr build`가 빌드하므로 로컬 Docker daemon은 필수가 아닙니다.

```bash
az login
az account set --subscription "<YOUR_SUBSCRIPTION_ID>"
export RG=rg-payment-kch01x7
export CLUSTER=aks-payment-kch01x7
export ACR=acrpaymentkch01x7
bash scripts/deploy.sh "$RG" "$CLUSTER" "$ACR" eastus2
bash scripts/connect.sh "$RG" "$CLUSTER"
export KUBECONFIG="$PWD/artifacts/kubeconfig-$CLUSTER"
kubectl -n payments port-forward service/payment-api 8080:8080
```

이름의 접미사는 고유한 소문자/숫자로 바꿉니다. 특히 ACR 이름은 전역 고유이고 하이픈 없이 지정합니다.
위 port-forward 터미널은 유지하고 다른 터미널에서:

```bash
export APP_URL=http://127.0.0.1:8080
curl --fail "$APP_URL/version"
node scripts/traffic.mjs "$APP_URL" 20 healthy
bash scripts/scenario.sh "$RG" "$CLUSTER" dependency-slow
```

**rollout 뒤 기존 port-forward의 Pod가 교체될 수 있습니다.**
port-forward를 다시 실행하고 `/version`과 traffic을 확인하세요.
Service port-forward는 한 Pod에 연결되므로 전체 replica 부하 분산을 측정한 것은 아닙니다.
앱은 외부 LoadBalancer/Ingress 없이 ClusterIP로만 노출합니다.

## 리소스와 비용

- AKS Standard control-plane tier, Linux `Standard_D4s_v6` 노드3대, Azure CNI Overlay.
- ACR Standard(admin disabled), kubelet identity의 AcrPull, digest 고정 이미지.
- VNet `10.70.0.0/16`: AKS node subnet `/24`, Agent용 별도 `/27` 위임 subnet.
- App Insights/Log Analytics30일 보존, 관리 ID 인증 Container Insights addon + 명시적 DCR/association.
- 비용 최소화보다 실습의 실행 여유를 우선한 기본 구성입니다. AKS Standard control plane과 VM·디스크·ACR·네트워크·로그는 유료입니다.
- SRE Agent/Grafana/Key Vault는 필요할 때 별도로 생성합니다.
- `private` 다섯 번째 인자는 새 AKS의 private API 생성 옵션입니다.
  VNet 관리 호스트가 필요하며 기존 public cluster의 toggle이라고 가정하지 않습니다.
- AKS 지원 버전은 생성 시 서비스가 선택하며, 지역의 VM availability/vCPU quota를 먼저 확인하세요.

노드 기본 용량은 합계12 vCPU/48GiB 메모리입니다. 노드 업데이트의 surge 용량도 고려해 구독 quota를 확인하세요.
기존 클러스터의 동일한 node pool에 다른 VM 크기를 지정하는 재배포는 지원되지 않습니다.
기존 pool이 다른 VM 크기로 생성됐다면 새 v6 node pool로 이전하거나 새 이름의 실습 클러스터를 만드세요.
`deploy.sh`는 이미지 빌드와 워크로드 재배포도 수행하므로 기존 장애 상태와 변경을 먼저 확인하세요.

### Container Insights 배포 오류

일부 AKS의 `addonProfiles.omsagent` 응답에는 `enabled/config`만 있고 별도 `identity`가 없습니다.
템플릿은 이 선택적 필드를 참조하거나 임의의 다른 identity에 수집 권한을 할당하지 않습니다.
이 구성에서는 AKS가 제공하는 addon 인증과 DCR 연결을 사용합니다.
`omsagent.identity` 관련 `InvalidTemplate` 오류가 나온다면 이전 템플릿인지 확인하세요.
AKS 자체가 `Succeeded`여도 전체 ARM 배포는 추가 역할 할당 때문에 실패할 수 있습니다.

수집 상태는 AKS의 `ama-logs` Ready 상태와 workspace의 실제 `KubePodInventory`,
`KubeEvents`, 앱 배포 후 `ContainerLogV2` 데이터를 확인합니다.
수집이 안 되면 addon/DCR 연결/네트워크를 조사하며, 다른 관리 ID로 자동 대체하거나 수집 성공으로 처리하지 않습니다.

## 장애와 복구

| 시나리오 | 관측 |
|---|---|
| `healthy` | 카드/계좌200, 각 p95≤1000ms |
| `dependency-slow` | provider SIGNATURE_ITERATIONS 증가로 실제 PBKDF2 CPU 계산량/카드 지연 증가 |
| `payment-exception` | 카드500 + 명시적 예외, 계좌200 |
| `unavailable` | provider replica0 → 실제 HTTP 의존 호출 실패로 카드·계좌503, API health/version200 |
| `image-pull-failure` | 새 Pod ErrImagePull/ImagePullBackOff; 기존 정상 Pod는 유지될 수 있음 |

위 이름들은 **학습자 스크립트 인자**일 뿐 워크로드에 저장되지 않습니다.
카드 오류는 merchant 설정 누락, 의존 중단은 provider replica0으로 만듭니다.
이미지 실패는 없는40자리 tag를 사용하고 fault/missing이라는 이름을 붙이지 않습니다.
`scenario.sh ... healthy`는 로컬 release artifact digest, merchant 값, provider 연산 설정/replica를 복원합니다.
Deployment 2 updated/available replicas와 실제20쌍 요청(실패0, 각 p95≤1000)을 모두 확인합니다.
`rollout undo`는 Deployment revision만 바꾸고 Secret 값을 복원하지 않습니다.
probes는 `/version`으로 프로세스를 확인합니다. Pod Ready는 결제 성공 보장이 아닙니다.

## 진단과 권한

앱 telemetry에는 `paymentMethod`, `sourceCommit`, `traceId`, `podName`, `namespace`만 있고 scenario 정답 필드는 없습니다.
`/version`과 Deployment image, Pod imageID digest, GitHub 배포 SHA 코드를 대조합니다.
App Insights requests/dependencies/exceptions와 ContainerLogV2/KubePodInventory/KubeEvents는 다른 데이터입니다.
Kubernetes API 변경은 AKS audit diagnostics로 확인하고 Azure Activity Log와 혼동하지 않습니다.

App Insights 연결 문자열은 `payment-telemetry` Secret에 stdin으로 주입하며 Git이나 kubeconfig에 넣지 않습니다.
Secret 내용, kubeconfig, 인증 토큰을 공개하거나 `kubectl get secret -o yaml`로 출력하지 마세요.
namespace RBAC Writer는 Secret도 접근할 수 있으므로 전용 실습 namespace에서만 사용합니다.
운영 환경의 좁은 workload 권한은 별도 custom RBAC가 필요합니다.

## 검증

```bash
node scripts/verify-workshop.mjs
node --test scripts/test/*.test.mjs
python3 -m unittest discover -s tools/tests -v
bash -n scripts/deploy.sh scripts/connect.sh scripts/scenario.sh scripts/lib/aks.sh
az bicep build --file infra/main.bicep --stdout
cd samples/payment-api && npm test
```

단위/HTTP/SDK 테스트, 격리된 mock Azure·kubectl script tests와 manifest 정적 검사입니다.
실제 Azure 배포·AKS tool/RBAC/DNS를 실행한 검증은 학습자 구독에서 따로 수행해야 합니다.
참고 설명 갱신은 `node scripts/build-curriculum.mjs`로 단일 HTML에 반영합니다.

## 정리

Agent의 반복 트리거/task/report를 먼저 중지합니다. 전용 RG의 목록을 직접 확인한 뒤 삭제합니다.

```bash
az group show --name "$RG" --query '{name:name,tags:tags}' -o json
az resource list --resource-group "$RG" -o table
az group delete --name "$RG"
```

AKS 삭제 후 자동 node resource group도 제거됐는지 확인합니다.
Agent/Grafana/private-cluster 등 별도 실습 RG와 권한도 각각 정리합니다.
자신이 만든 전용 kubeconfig 파일은 삭제할 수 있지만 기존 사용자 kubeconfig는 변경/삭제하지 마세요.
