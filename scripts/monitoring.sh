#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 3 || $# -gt 4 ]]; then
  echo "Usage: bash scripts/monitoring.sh <dedicated-rg> <aks-payment-name> <alerts|dynamic|audit> [--what-if]" >&2
  exit 2
fi
ROOT=$(cd "$(dirname "$0")/.." && pwd)
source "$ROOT/scripts/lib/aks.sh"
validate_target "$1" "$2"
require_payment_group
MODE=$3
if [[ "$MODE" != "alerts" && "$MODE" != "dynamic" && "$MODE" != "audit" ]]; then
  echo "Third argument must be alerts, dynamic or audit." >&2
  exit 2
fi
COMMAND=create
if [[ $# == 4 ]]; then
  if [[ "$4" != "--what-if" ]]; then
    echo "Fourth argument must be --what-if." >&2
    exit 2
  fi
  COMMAND=what-if
fi
LOCATION=$(az aks show -g "$RG" -n "$CLUSTER" --query location -o tsv)
if [[ -z "$LOCATION" ]]; then
  echo "AKS did not return a location; refusing monitoring deployment." >&2
  exit 1
fi
az monitor log-analytics workspace show -g "$RG" -n "law-$CLUSTER" --query name -o tsv
PARAMETERS=(clusterName="$CLUSTER")
if [[ "$MODE" == "alerts" || "$MODE" == "dynamic" ]]; then
  SUFFIX=${CLUSTER#aks-payment-}
  ALERT="payment-failures-$SUFFIX"
  ACTION_GROUP="ag-payments-$SUFFIX"
  EXISTING=$(az resource list -g "$RG" --resource-type Microsoft.Insights/actionGroups \
    --query "[?name=='$ACTION_GROUP'].name" -o tsv)
  if [[ "$MODE" == "dynamic" ]]; then
    if [[ -z "$EXISTING" ]]; then
      echo "Deploy alerts first to create the dedicated action group." >&2
      exit 1
    fi
    PARAMETERS+=(alertName="payment-latency-dynamic-$SUFFIX" actionGroupName="$ACTION_GROUP")
  else
    CREATE_GROUP=true
    if [[ -n "$EXISTING" ]]; then
      CREATE_GROUP=false
      echo "Reusing $ACTION_GROUP without changing its notification receivers."
    fi
    PARAMETERS+=(alertName="$ALERT" actionGroupName="$ACTION_GROUP" createActionGroup="$CREATE_GROUP" location="$LOCATION")
  fi
fi
az deployment group "$COMMAND" -g "$RG" --name "payment-$MODE" \
  --template-file "$ROOT/infra/$MODE.bicep" --parameters "${PARAMETERS[@]}"
if [[ "$COMMAND" == "create" && "$MODE" == "alerts" ]]; then
  az resource show -g "$RG" -n "$ALERT" --resource-type Microsoft.Insights/scheduledQueryRules \
    --api-version 2023-12-01 \
    --query '{name:name,enabled:properties.enabled,severity:properties.severity,window:properties.windowSize,frequency:properties.evaluationFrequency,autoMitigate:properties.autoMitigate}' -o table
  echo "Alert deployed. New action groups have no notifications; existing receivers are preserved."
fi
