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
| [samples/payment-api](samples/payment-api) | Node.js 22 앱 + Dockerfile + 실제 loopback provider |
| [scripts/deploy.sh](scripts/deploy.sh) | ACR remote build, SHA→digest 고정, Secret 주입과 rollout |
| [scripts/connect.sh](scripts/connect.sh) | 전용 kubeconfig에 Entra/Azure CLI 로그인 연결 |
| [scripts/scenario.sh](scripts/scenario.sh) | Deployment env 장애와 ImagePullBackOff 재현·정상 digest 복구 |
| [scripts/traffic.mjs](scripts/traffic.mjs) | 카드/계좌 요청 실패율·p95 검증 |
| [queries](queries) | App Insights/Kubernetes 로그·이벤트 조회 |
| [tools](tools) | 측정값 통계와 Pod 상태 요약 Python 도구 |
| [operations](operations) | 운영 문서, Skill, 선택적 incident report 양식 |

본문·18개 결과 예시와105개 주제 설명은 오프라인에서 읽을 수 있습니다.
MS Learn 공식 이미지15개는 원본 URL을 사용하므로 인터넷이 필요합니다.
확대/원문 보기와 실패 안내를 제공하며 출처는 [image-sources.json](docs/image-sources.json)에 있습니다.
공식 화면은 이 실습을 수행한 증거가 아니므로 실제 결과와 구분하세요.

## 로컬 실행

Node.js **22 이상**, npm이 필요합니다.

```bash
git clone https://github.com/Kimcheolhui/Azure-SRE-Agent-Samples.git
cd Azure-SRE-Agent-Samples/samples/payment-api
npm ci
npm test
npm start
```

별도 터미널의 저장소 루트에서:

```bash
node scripts/traffic.mjs http://127.0.0.1:8080 20 healthy
```

서버를 Ctrl+C로 종료하고 `SRE_SCENARIO=dependency-slow npm start`처럼 다시 시작하면
로컬 앱 장애도 재현할 수 있습니다. 실제 은행/DB나 고객 데이터는 사용하지 않습니다.

## Azure AKS 배포

필요 도구: Azure CLI, Git, Node.js22+, kubectl, kubelogin.
AKS/ACR/VNet 생성과 역할 할당을 위해 실습 RG에 Owner 또는 Contributor + User Access Administrator가 필요합니다.
배포 스크립트는 현재 Entra 사용자를 해당 실습 AKS의 RBAC Cluster Admin으로 할당합니다.
SRE Agent에는 별도의 namespace-scoped 읽기/쓰기 권한을 설정합니다.
이미지는 `az acr build`가 빌드하므로 로컬 Docker daemon은 필수가 아닙니다.

```bash
az login
az account set --subscription "<YOUR_SUBSCRIPTION_ID>"
export RG=rg-sre-workshop-kch01x7
export CLUSTER=aks-sre-kch01x7
export ACR=acrsrekch01x7
bash scripts/deploy.sh "$RG" "$CLUSTER" "$ACR" eastus2
bash scripts/connect.sh "$RG" "$CLUSTER"
export KUBECONFIG="$PWD/artifacts/kubeconfig-$CLUSTER"
kubectl -n sre-workshop port-forward service/payment-api 8080:8080
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

- AKS Free control-plane tier, Linux `Standard_D2s_v5` 노드1대, Azure CNI Overlay.
- ACR Basic(admin disabled), kubelet identity의 AcrPull, digest 고정 이미지.
- VNet `10.70.0.0/16`: AKS node subnet `/24`, Agent용 별도 `/27` 위임 subnet.
- App Insights/Log Analytics30일 보존, Container Insights addon + 명시적 DCR/association과 로그 수집 identity 역할.
- **VM·디스크·ACR·outbound 네트워크·로그는 유료**이고 AKS Free는 무료 전체 실습이 아닙니다.
- SRE Agent/Grafana/Key Vault는 필요할 때 별도로 생성합니다.
- `private` 다섯 번째 인자는 새 AKS의 private API 생성 옵션입니다.
  VNet 관리 호스트가 필요하며 기존 public cluster의 toggle이라고 가정하지 않습니다.
- AKS 지원 버전은 생성 시 서비스가 선택하며, 지역의 VM availability/vCPU quota를 먼저 확인하세요.

## 장애와 복구

| 시나리오 | 관측 |
|---|---|
| `healthy` | 카드/계좌200, 각 p95≤1000ms |
| `dependency-slow` | 카드 provider1800ms 대기, 계좌 정상 |
| `payment-exception` | 카드500 + 명시적 예외, 계좌200 |
| `unavailable` | 카드·계좌·health503, version200 |
| `image-pull-failure` | 새 Pod ErrImagePull/ImagePullBackOff; 기존 정상 Pod는 유지될 수 있음 |

`image-pull-failure`는 Kubernetes 전용이고 앱의 SRE_SCENARIO 값이 아닙니다.
`scenario.sh ... healthy`는 저장한 정상 digest와 healthy env를 복원합니다.
Deployment 2 updated/available replicas와 실제20쌍 요청(실패0, 각 p95≤1000)을 모두 확인합니다.
`rollout undo`는 Deployment revision만 바꾸고 Secret 값을 복원하지 않습니다.
probes는 `/version`으로 프로세스를 확인합니다. Pod Ready는 결제 성공 보장이 아닙니다.

## 진단과 권한

앱 telemetry에는 `paymentMethod`, `scenario`, `sourceCommit`, `traceId`, `podName`, `namespace`가 있습니다.
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
