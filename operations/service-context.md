# Payment workshop service context

Owner: the learner. Environment: disposable Azure workshop only.

## Architecture

Local port-forward -> AKS ClusterIP Service `sre-workshop/payment-api` -> one Node.js Pod
-> HTTP `/provider` inside that same container.
The Deployment has two replicas. A Service port-forward selects one Pod; it does not measure
load balancing across replicas. Restart port-forward after rollout replaces its selected Pod.
The provider is an explicit local simulation, NOT a real bank, external payment system or database.
There are no real purchases, customer data, storage or payment secrets.

## Deployment identity

`GET /version` returns `sourceCommit`, `scenario`, `podName`, and `namespace`.
`SOURCE_COMMIT` is baked into the container image and must match the deployed Git commit.
The image is built with a Git-SHA tag and deployed by immutable ACR digest.
Compare the Deployment image, Pod `imageID`, and `/version`; do not infer deployment from repository HEAD.
`SRE_SCENARIO` is a Deployment container environment variable. Changing it creates a rollout.
Configuration change is the fault injection mechanism; code does not need to change between scenarios.

## Baseline and faults

- `healthy`: card/bank return 200; local `/provider` usually takes about 15 ms.
- `dependency-slow`: card provider waits 1,800 ms, bank stays fast; health stays 200.
- `payment-exception`: card returns 500 with `WORKSHOP_PAYMENT_CONFIG_ERROR`; bank stays 200.
- `unavailable`: both payment methods and `/health` return 503; `/version` stays 200 for diagnosis.
- `image-pull-failure`: Kubernetes-only fault; new image tag does not exist in ACR,
  so the new Pod cannot start (`ErrImagePull` / `ImagePullBackOff`). Old healthy Pods can continue
  serving because `maxUnavailable=0`; failed rollout does not necessarily mean service outage.

## Kubernetes readiness

Startup, readiness and liveness use `/version`, a process responsiveness check.
Injected business failures do not fail these probes. Pod Ready is not proof that payments succeed.
Do not tie liveness to intentional `/pay` or `/health` failures and create a restart loop.
Kubernetes namespace is fixed to `sre-workshop`, Deployment/Service to `payment-api`.

## Recovery criterion

Restore the saved healthy image digest and `SRE_SCENARIO=healthy`, wait for two updated/available replicas,
restart port-forward, verify `/version`, then run 20 paired rounds.
Both methods must have 0 failures and measured p95 <= 1,000 ms.
This local-workshop threshold is not an Azure latency guarantee.
Check fresh Application Insights evidence after ingestion; do not mistake historical errors for an ongoing fault.

## Boundaries

Review mode first. Never delete a resource or modify a non-workshop resource group.
Use namespace-scoped AKS data-plane permissions. Azure Reader/Contributor and Cluster User credentials
do not alone grant Kubernetes read/write. A namespace Writer can access Secrets: limit this to the disposable namespace.
Read-only diagnosis does not authorize changes. User approval does not grant missing Azure RBAC.
Do not disable an alert merely to make the incident look resolved.
Record UTC start/end, resource ID, scenario, commit, evidence, action, owner and remaining questions.
Collect app telemetry, `ContainerLogV2`, `KubePodInventory` and Pod events separately.
Kubernetes API writes need AKS audit diagnostics; Azure Activity Log is for ARM resource operations.
