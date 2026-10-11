#!/usr/bin/env bash
set -euo pipefail
if [[ $# -ne 3 ]]; then
  echo "Usage: bash scripts/scenario.sh <dedicated-rg> <aks-payment-name> <healthy|dependency-slow|payment-exception|unavailable|image-pull-failure>" >&2
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
require_payment_group
RELEASE_DIR=${PAYMENT_RELEASE_DIR:-"$ROOT/artifacts"}
IMAGE=$(node -e '
const fs=require("node:fs");const r=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
if(r.resourceGroup!==process.argv[2]||r.cluster!==process.argv[3]||
 !/^[a-z0-9]+\.azurecr\.io\/payment-api@sha256:[a-f0-9]{64}$/.test(r.image))
 throw new Error("Release artifact does not identify this target and its immutable image");
process.stdout.write(r.image);' "$RELEASE_DIR/release-$CLUSTER.json" "$RG" "$CLUSTER")
connect_isolated
for component in payment-api payment-provider; do
  kubectl -n payments get deployment "$component" -o json | node -e '
let text="";process.stdin.on("data",c=>text+=c);process.stdin.on("end",()=>{
 if(JSON.parse(text).metadata.labels.application!=="payments")throw new Error("Not a payment deployment");
});'
done
if [[ "$SCENARIO" == "image-pull-failure" ]]; then
  TAG=$(node -e 'process.stdout.write(require("node:crypto").randomBytes(20).toString("hex"))')
  REGISTRY="${IMAGE%%.azurecr.io*}"
  az acr repository show-tags --name "$REGISTRY" --repository payment-api -o json |
    node -e 'let t="";process.stdin.on("data",c=>t+=c);process.stdin.on("end",()=>{
     const tags=JSON.parse(t);if(!Array.isArray(tags)||tags.includes(process.argv[1]))throw new Error("Image tag already exists");
    });' "$TAG"
  kubectl -n payments set image deployment/payment-api "payment-api=${IMAGE%%@*}:$TAG"
  for attempt in $(seq 1 36); do
    if kubectl -n payments get pods -l app=payment-api -o json | node -e '
let text="";process.stdin.on("data",c=>text+=c);process.stdin.on("end",()=>{
 const p=JSON.parse(text);process.exit(p.items.some(p=>(p.status.containerStatuses||[]).some(c=>
 ["ImagePullBackOff","ErrImagePull"].includes(c.state.waiting?.reason)))?0:1);
});'; then
      echo "Image pull failure observed; check whether previous Pods still serve requests."
      exit 0
    fi
    sleep 5
  done
  echo "Image pull failure was not observed; inspect Pod events." >&2
  exit 1
fi
if [[ "$SCENARIO" == "healthy" ]]; then
  for component in payment-api payment-provider; do
    kubectl -n payments set image "deployment/$component" "$component=$IMAGE"
  done
  kubectl -n payments set env deployment/payment-api CARD_MERCHANT_ACCOUNT=merchant-card \
    BANK_MERCHANT_ACCOUNT=merchant-bank PAYMENT_PROVIDER_URL=http://payment-provider.payments.svc.cluster.local:8081
  kubectl -n payments set env deployment/payment-provider SIGNATURE_ITERATIONS=60000
  kubectl -n payments scale deployment/payment-provider --replicas=2
elif [[ "$SCENARIO" == "dependency-slow" ]]; then
  kubectl -n payments set env deployment/payment-provider SIGNATURE_ITERATIONS=16000000
elif [[ "$SCENARIO" == "payment-exception" ]]; then
  kubectl -n payments set env deployment/payment-api CARD_MERCHANT_ACCOUNT=
elif [[ "$SCENARIO" == "unavailable" ]]; then
  kubectl -n payments scale deployment/payment-provider --replicas=0
fi
for component in payment-api payment-provider; do
  kubectl -n payments rollout status "deployment/$component" --timeout=240s
done
kubectl -n payments get deployments,pods -l application=payments
echo "Configuration applied. Verify actual requests and reconnect port-forward if its Pod was replaced."
