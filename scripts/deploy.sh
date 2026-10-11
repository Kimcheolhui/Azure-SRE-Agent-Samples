#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 4 || $# -gt 5 ]]; then
  echo "Usage: bash scripts/deploy.sh <dedicated-rg> <aks-payment-name> <unique-acr-name> <azure-region> [private]" >&2
  exit 2
fi
ROOT=$(cd "$(dirname "$0")/.." && pwd)
source "$ROOT/scripts/lib/aks.sh"
validate_target "$1" "$2"
REGISTRY=$3
LOCATION=$4
PRIVATE=false
if [[ $# == 5 ]]; then
  if [[ "$5" != "private" ]]; then echo "Fifth argument must be private." >&2; exit 2; fi
  PRIVATE=true
fi
if [[ ! "$REGISTRY" =~ ^[a-z][a-z0-9]{4,49}$ ]]; then
  echo "ACR name must be 5-50 lowercase letters/digits, starting with a letter." >&2
  exit 2
fi
az account show --query '{subscription:name,id:id}' -o table
COMMIT=$(git -C "$ROOT" rev-parse HEAD)
if [[ -n "$(git -C "$ROOT" status --porcelain -- samples/payment-api infra k8s scripts)" ]]; then
  echo "Commit application/deployment changes first so the image identifies deployed code." >&2
  exit 1
fi
DEPLOYER=$(az ad signed-in-user show --query id -o tsv)
if [[ "$(az group exists --name "$RG" -o tsv)" == "true" ]]; then
  require_payment_group
fi
az group create --name "$RG" --location "$LOCATION" --tags application=payments -o none
az deployment group create --resource-group "$RG" --name payment-platform \
  --template-file "$ROOT/infra/main.bicep" \
  --parameters clusterName="$CLUSTER" registryName="$REGISTRY" deployerObjectId="$DEPLOYER" \
    location="$LOCATION" privateCluster="$PRIVATE" -o none
az acr build --registry "$REGISTRY" --image "payment-api:$COMMIT" --platform linux/amd64 \
  --build-arg SOURCE_COMMIT="$COMMIT" "$ROOT/samples/payment-api"
LOGIN_SERVER=$(az acr show --name "$REGISTRY" --query loginServer -o tsv)
DIGEST=$(az acr repository show --name "$REGISTRY" --image "payment-api:$COMMIT" --query digest -o tsv)
if [[ ! "$DIGEST" =~ ^sha256:[a-f0-9]{64}$ ]]; then
  echo "ACR did not return a valid image digest; refusing to deploy an unverified image." >&2
  exit 1
fi
IMAGE="$LOGIN_SERVER/payment-api@$DIGEST"
connect_isolated
for attempt in $(seq 1 24); do
  if kubectl get namespaces >/dev/null; then break; fi
  if [[ "$attempt" == 24 ]]; then echo "AKS RBAC access did not become effective." >&2; exit 1; fi
  echo "Waiting for the deployer's AKS RBAC role to propagate ($attempt/24)..." >&2
  sleep 10
done
kubectl create namespace payments --dry-run=client -o yaml | kubectl apply --server-side -f -
az resource show -g "$RG" -n "appi-$CLUSTER" --resource-type Microsoft.Insights/components \
  --api-version 2020-02-02 --query properties.ConnectionString -o tsv |
  node -e '
    let value=""; process.stdin.on("data", chunk=>value+=chunk);
    process.stdin.on("end", ()=>{
      value=value.trim();
      if(!value)throw new Error("Application Insights connection string is empty");
      console.log(JSON.stringify({apiVersion:"v1",kind:"Secret",metadata:{name:"payment-telemetry",namespace:"payments"},type:"Opaque",data:{"connection-string":Buffer.from(value).toString("base64")}}));
    });' | kubectl apply --server-side --field-manager=deployment -f -
sed "s|PAYMENT_IMAGE|$IMAGE|g" "$ROOT/k8s/workload.yaml" | kubectl apply -f -
for component in payment-api payment-provider; do
  kubectl -n payments rollout status "deployment/$component" --timeout=240s
done
kubectl -n payments get pods -l application=payments -o wide
RELEASE_DIR=${PAYMENT_RELEASE_DIR:-"$ROOT/artifacts"}
mkdir -p "$RELEASE_DIR"
node -e 'const fs=require("node:fs");fs.writeFileSync(process.argv[1],JSON.stringify({
 resourceGroup:process.argv[2],cluster:process.argv[3],image:process.argv[4],sourceCommit:process.argv[5]
},null,2)+"\n",{mode:0o600});' "$RELEASE_DIR/release-$CLUSTER.json" "$RG" "$CLUSTER" "$IMAGE" "$COMMIT"
printf '\nImage deployed: %s\n' "$IMAGE"
printf 'Next: bash scripts/connect.sh %s %s\n' "$RG" "$CLUSTER"
printf 'Then run the printed export and kubectl -n payments port-forward service/payment-api 8080:8080\n'
