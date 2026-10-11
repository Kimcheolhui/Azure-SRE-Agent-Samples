#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 3 ]]; then
  echo "Usage: bash scripts/scenario.sh <dedicated-rg> <aks-sre-name> <healthy|dependency-slow|payment-exception|unavailable|image-pull-failure>" >&2
  exit 2
fi
ROOT=$(cd "$(dirname "$0")/.." && pwd)
source "$ROOT/scripts/lib/aks.sh"
validate_target "$1" "$2"
SCENARIO=$3
case "$SCENARIO" in
  healthy|dependency-slow|payment-exception|unavailable|image-pull-failure) ;;
  *) echo "Unknown scenario: $SCENARIO" >&2; exit 2 ;;
esac
require_workshop_group
connect_isolated
CURRENT=$(kubectl -n sre-workshop get deployment payment-api -o json)
IMAGE=$(printf '%s' "$CURRENT" | node -e '
let data="";process.stdin.on("data",c=>data+=c);process.stdin.on("end",()=>{
  const d=JSON.parse(data);
  if(d.metadata.labels.workshop!=="azure-sre-agent")throw new Error("Not a workshop deployment");
  const c=d.spec.template.spec.containers.find(c=>c.name==="payment-api");
  const image=d.metadata.annotations?.["workshop.azure-sre-agent/healthy-image"]||c.image;
  if(!/^[a-z0-9]+\.azurecr\.io\/payment-api@sha256:[0-9a-f]{64}$/.test(image))throw new Error("Expected verified immutable ACR image");
  process.stdout.write(image);
});')
kubectl -n sre-workshop annotate deployment payment-api "workshop.azure-sre-agent/healthy-image=$IMAGE" --overwrite
if [[ "$SCENARIO" == "image-pull-failure" ]]; then
  printf '%s' "$CURRENT" | node -e '
let data="";process.stdin.on("data",c=>data+=c);process.stdin.on("end",()=>{
 const d=JSON.parse(data),c=d.spec.template.spec.containers.find(c=>c.name==="payment-api");
 if(c.env.find(e=>e.name==="SRE_SCENARIO")?.value!=="healthy"||d.status.availableReplicas!==2)
  throw new Error("Restore healthy and two available replicas before injecting an image pull failure");
});'
  BAD_IMAGE="${IMAGE%%@*}:workshop-missing-tag"
  REGISTRY="${IMAGE%%.azurecr.io*}"
  az acr repository show-tags --name "$REGISTRY" --repository payment-api -o json |
    node -e '
let data="";process.stdin.on("data",c=>data+=c);process.stdin.on("end",()=>{
 const tags=JSON.parse(data);
 if(!Array.isArray(tags)||tags.includes("workshop-missing-tag"))throw new Error("Expected missing image tag is already present; refusing this fault");
});'
  kubectl -n sre-workshop set image deployment/payment-api "payment-api=$BAD_IMAGE"
  for attempt in $(seq 1 36); do
    PODS=$(kubectl -n sre-workshop get pods -l app=payment-api -o json)
    if printf '%s' "$PODS" | node -e '
let data="";process.stdin.on("data",c=>data+=c);process.stdin.on("end",()=>{
 const p=JSON.parse(data);process.exit(p.items.some(p=>(p.status.containerStatuses||[]).some(c=>c.state.waiting?.reason==="ImagePullBackOff"||c.state.waiting?.reason==="ErrImagePull"))?0:1);
});'; then
      echo "Image pull failure verified. With maxUnavailable=0, old healthy Pods can still serve traffic."
      kubectl -n sre-workshop get pods -l app=payment-api
      exit 0
    fi
    sleep 5
  done
  echo "Expected image pull failure was not observed; inspect Pod events. No success claimed." >&2
  exit 1
fi
kubectl -n sre-workshop set image deployment/payment-api "payment-api=$IMAGE"
kubectl -n sre-workshop set env deployment/payment-api "SRE_SCENARIO=$SCENARIO"
kubectl -n sre-workshop rollout status deployment/payment-api --timeout=240s
kubectl -n sre-workshop get deployment payment-api -o json |
  node -e '
let data="";process.stdin.on("data",c=>data+=c);process.stdin.on("end",()=>{
 const d=JSON.parse(data),c=d.spec.template.spec.containers.find(c=>c.name==="payment-api");
 if(c.env.find(e=>e.name==="SRE_SCENARIO")?.value!==process.argv[1]||
    d.status.observedGeneration<d.metadata.generation||d.status.updatedReplicas!==2||
    d.status.availableReplicas!==2)throw new Error("Rollout verification failed");
 console.log("Deployment scenario and 2 updated/available replicas verified: "+process.argv[1]);
});' "$SCENARIO"
echo "Restart any port-forward session if its Pod was replaced, then verify /version and traffic."
