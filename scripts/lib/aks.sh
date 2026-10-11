#!/usr/bin/env bash

validate_target() {
  RG=$1
  CLUSTER=$2
  if [[ ! "$RG" =~ ^rg-sre-workshop-[a-z0-9-]+$ || ! "$CLUSTER" =~ ^aks-sre-[a-z0-9-]+$ ]]; then
    echo "Use a dedicated rg-sre-workshop-* group and aks-sre-* cluster." >&2
    return 2
  fi
  for tool in az kubectl kubelogin node; do
    command -v "$tool" >/dev/null || { echo "Missing tool: $tool" >&2; return 1; }
  done
}

require_workshop_group() {
  local tag
  tag=$(az group show --name "$RG" --query tags.workshop -o tsv)
  if [[ "$tag" != "azure-sre-agent" ]]; then
    echo "Resource group must have workshop=azure-sre-agent tag." >&2
    return 2
  fi
}

connect_isolated() {
  umask 077
  CREDENTIAL_DIR=$(mktemp -d "${TMPDIR:-/tmp}/sre-aks.XXXXXX")
  export KUBECONFIG="$CREDENTIAL_DIR/config"
  trap 'rm -f "$CREDENTIAL_DIR/config"; rmdir "$CREDENTIAL_DIR"' EXIT
  az aks get-credentials --resource-group "$RG" --name "$CLUSTER" --file "$KUBECONFIG" -o none
  kubelogin convert-kubeconfig -l azurecli
}
