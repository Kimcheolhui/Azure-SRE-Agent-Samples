#!/usr/bin/env bash
set -euo pipefail
if [[ $# -ne 2 ]]; then
  echo "Usage: bash scripts/connect.sh <dedicated-rg> <aks-sre-name>" >&2
  exit 2
fi
ROOT=$(cd "$(dirname "$0")/.." && pwd)
source "$ROOT/scripts/lib/aks.sh"
validate_target "$1" "$2"
require_payment_group
umask 077
mkdir -p "$ROOT/artifacts"
export KUBECONFIG="$ROOT/artifacts/kubeconfig-$CLUSTER"
az aks get-credentials -g "$RG" -n "$CLUSTER" --file "$KUBECONFIG" --overwrite-existing -o none
kubelogin convert-kubeconfig -l azurecli
kubectl -n payments get pods -l application=payments
printf '\nUse in this terminal:\nexport KUBECONFIG=%q\n' "$KUBECONFIG"
