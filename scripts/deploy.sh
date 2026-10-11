#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 3 ]]; then
  echo "Usage: bash scripts/deploy.sh <dedicated-resource-group> <unique-app-name> <azure-region>" >&2
  exit 2
fi
RG=$1
APP=$2
LOCATION=$3
ROOT=$(cd "$(dirname "$0")/.." && pwd)
if [[ ! "$RG" =~ ^rg-sre-workshop-[a-z0-9-]+$ ]]; then
  echo "Use a dedicated resource group named rg-sre-workshop-<suffix>." >&2
  exit 2
fi
if [[ ! "$APP" =~ ^[a-z][a-z0-9-]{1,39}$ ]]; then
  echo "App name must be 2-40 lowercase characters, start with a letter and use only letters/digits/hyphens." >&2
  exit 2
fi
for tool in az git zip; do
  command -v "$tool" >/dev/null || { echo "Missing tool: $tool" >&2; exit 1; }
done
az account show --query '{subscription:name,id:id}' -o table
COMMIT=$(git -C "$ROOT" rev-parse HEAD)
if [[ -n "$(git -C "$ROOT" status --porcelain -- samples/payment-api infra scripts)" ]]; then
  echo "Commit sample/deployment changes first so SOURCE_COMMIT identifies the deployed code." >&2
  exit 1
fi
az group create --name "$RG" --location "$LOCATION" --tags workshop=azure-sre-agent -o none
az deployment group create --resource-group "$RG" --name payment-workshop \
  --template-file "$ROOT/infra/main.bicep" \
  --parameters appName="$APP" location="$LOCATION" sourceCommit="$COMMIT" -o none
ZIP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/sre-workshop.XXXXXX")
ZIP_FILE="$ZIP_DIR/payment.zip"
trap 'rm -f "$ZIP_FILE"; rmdir "$ZIP_DIR"' EXIT
(
  cd "$ROOT/samples/payment-api"
  zip -q -r "$ZIP_FILE" package.json package-lock.json src
)
az webapp deploy --resource-group "$RG" --name "$APP" --src-path "$ZIP_FILE" --type zip -o none
HOST=$(az webapp show --resource-group "$RG" --name "$APP" --query defaultHostName -o tsv)
curl --fail --silent --show-error --retry 12 --retry-delay 10 --retry-all-errors --max-time 20 "https://$HOST/version"
printf '\nVerify healthy traffic: node scripts/traffic.mjs https://%s 10 healthy\n' "$HOST"
