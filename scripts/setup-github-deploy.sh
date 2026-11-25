#!/usr/bin/env bash
# Point this repo's deploy workflow at lean.interlinea.io: copies the Terraform outputs from Interlinea-proto into
# this repo's Actions variables. Run once after the apply that adds infra/terraform/lean.tf (and again if they change).
# Needs: gh signed in (gh auth login), an AWS login that can read the Terraform state, Interlinea-proto checked out.
#   scripts/setup-github-deploy.sh [path/to/Interlinea-proto]
set -euo pipefail
proto="${1:-../Interlinea-proto}"
tf="$proto/infra/terraform"
repo="roboticminstrel/Leangame"
[ -d "$tf" ] || { echo "No Terraform at $tf; pass the Interlinea-proto path." >&2; exit 1; }
terraform -chdir="$tf" init -input=false >/dev/null
out() { terraform -chdir="$tf" output -raw "$1" 2>/dev/null | tr -d '\r' || true; }

role="$(out lean_deploy_role_arn)"
[ -n "$role" ] || { echo "No lean_deploy_role_arn output yet: apply lean.tf first." >&2; exit 1; }
gh variable set AWS_REGION -R "$repo" -b "$(out region)"
gh variable set LEAN_BUCKET -R "$repo" -b "$(out lean_bucket_name)"
gh variable set LEAN_DISTRIBUTION_ID -R "$repo" -b "$(out lean_distribution_id)"
gh variable set AWS_DEPLOY_ROLE_ARN -R "$repo" -b "$role"
echo "Done. Push to main (or run Actions → Deploy) to publish https://lean.interlinea.io"
