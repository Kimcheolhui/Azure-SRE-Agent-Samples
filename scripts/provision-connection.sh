#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 3 || $# -gt 4 || ( "$1" != "grafana" && "$1" != "keyvault" ) ]]; then
  echo "Usage: bash scripts/provision-connection.sh <grafana|keyvault> <suffix> <region> [--what-if]" >&2
  exit 2
fi
SERVICE=$1
SUFFIX=$2
LOCATION=$3
if [[ ! "$SUFFIX" =~ ^[a-z0-9]{3,15}$ || ! "$LOCATION" =~ ^[a-z0-9]+$ ]]; then
  echo "Use a 3-15 character lowercase/digit suffix and an Azure region name." >&2
  exit 2
fi
if [[ "$SERVICE" == "keyvault" && ! "${AGENT_PRINCIPAL:-}" =~ ^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$ ]]; then
  echo "Set AGENT_PRINCIPAL to the connector execution managed identity object ID." >&2
  exit 2
fi
ROOT=$(cd "$(dirname "$0")/.." && pwd)
source "$ROOT/scripts/lib/aks.sh"
RG="rg-payment-$SERVICE-$SUFFIX"
COMMAND=create
if [[ $# == 4 ]]; then
  if [[ "$4" != "--what-if" ]]; then echo "Fourth argument must be --what-if." >&2; exit 2; fi
  COMMAND=what-if
fi
for tool in az node; do
  command -v "$tool" >/dev/null || { echo "Missing tool: $tool" >&2; exit 1; }
done
if [[ "$(az group exists -n "$RG" -o tsv)" == "true" ]]; then
  require_payment_group
elif [[ "$COMMAND" == "what-if" ]]; then
  echo "Create the dedicated $RG group first; what-if does not create resource groups." >&2
  exit 1
else
  az group create -n "$RG" -l "$LOCATION" --tags application=payments -o none
fi
PARAMETERS=(location="$LOCATION")
if [[ "$SERVICE" == "grafana" ]]; then
  PARAMETERS+=(grafanaName="amg-sre-$SUFFIX")
else
  DEPLOYER=$(az ad signed-in-user show --query id -o tsv)
  if [[ -z "$DEPLOYER" ]]; then echo "A signed-in user's object ID is required for secret upload." >&2; exit 1; fi
  PARAMETERS+=(vaultName="kv-sre-$SUFFIX" agentPrincipalId="$AGENT_PRINCIPAL" deployerPrincipalId="$DEPLOYER")
fi
az deployment group "$COMMAND" -g "$RG" --name "payment-$SERVICE" \
  --template-file "$ROOT/infra/$SERVICE.bicep" --parameters "${PARAMETERS[@]}"
