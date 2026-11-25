#!/usr/bin/env bash
# Upload the static site to S3 and refresh CloudFront. Used by .github/workflows/deploy.yml; also works from your
# own machine with an AWS login:  BUCKET=... DISTRIBUTION_ID=... scripts/deploy.sh
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
: "${BUCKET:?set BUCKET (the lean site bucket)}"
: "${DISTRIBUTION_ID:?set DISTRIBUTION_ID (the lean CloudFront distribution)}"

site="$(mktemp -d)"
trap 'rm -rf "$site"' EXIT
cp "$root/index.html" "$root/styles.css" "$site/"
cp -r "$root/src" "$root/vendor" "$site/"

# Modules aren't fingerprinted, so keep their cache short; index.html is always revalidated.
aws s3 sync "$site/" "s3://$BUCKET/" --delete --exclude "index.html" --cache-control "public, max-age=300"
aws s3 cp "$site/index.html" "s3://$BUCKET/index.html" --cache-control "no-cache" --content-type "text/html; charset=utf-8"
MSYS_NO_PATHCONV=1 aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION_ID" --paths "/*" > /dev/null
echo "Deployed to s3://$BUCKET and refreshed CloudFront."
