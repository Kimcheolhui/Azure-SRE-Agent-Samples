#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 3 ]]; then
  echo "Usage: bash scripts/scenario.sh <dedicated-resource-group> <app-name> <healthy|dependency-slow|payment-exception|unavailable>" >&2
  exit 2
fi
RG=$1
APP=$2
SCENARIO=$3
for tool in az node curl; do
  command -v "$tool" >/dev/null || { echo "Missing tool: $tool" >&2; exit 1; }
done
if [[ ! "$RG" =~ ^rg-sre-workshop-[a-z0-9-]+$ ]]; then
  echo "Refusing a non-workshop resource group." >&2
  exit 2
fi
case "$SCENARIO" in
  healthy|dependency-slow|payment-exception|unavailable) ;;
  *) echo "Unknown scenario: $SCENARIO" >&2; exit 2 ;;
esac
TAG=$(az group show --name "$RG" --query tags.workshop -o tsv)
if [[ "$TAG" != "azure-sre-agent" ]]; then
  echo "Resource group must have workshop=azure-sre-agent tag." >&2
  exit 2
fi
az webapp config appsettings set --resource-group "$RG" --name "$APP" \
  --settings SRE_SCENARIO="$SCENARIO" -o none
az webapp restart --resource-group "$RG" --name "$APP" -o none
HOST=$(az webapp show --resource-group "$RG" --name "$APP" --query defaultHostName -o tsv)
for attempt in $(seq 1 24); do
  if BODY=$(curl --fail --silent --show-error --max-time 10 "https://$HOST/version"); then
    if printf '%s' "$BODY" | node -e '
      let data=""; process.stdin.on("data", c => data+=c);
      process.stdin.on("end", () => {
        try { process.exit(JSON.parse(data).scenario === process.argv[1] ? 0 : 1); }
        catch (error) { console.error(error.message); process.exit(1); }
      });' "$SCENARIO"; then
      printf 'Scenario verified: %s\n%s\n' "$SCENARIO" "$BODY"
      exit 0
    fi
  fi
  sleep 5
done
echo "Timed out verifying $SCENARIO. Inspect App Service Log stream; no success claimed." >&2
exit 1
