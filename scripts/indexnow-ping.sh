#!/usr/bin/env bash
# Ping IndexNow (Bing, Yandex, Seznam, Naver) with the public URLs of
# mergewatch.ai so they re-crawl after a deploy. Safe to run on every
# production dashboard deploy — IndexNow is rate-limited per host by
# the receiving engines, not by us.
#
# Usage: scripts/indexnow-ping.sh

set -euo pipefail

HOST="mergewatch.ai"
KEY="24b8ed55a4509f9e4a6254ddfc92033d"
KEY_LOCATION="https://${HOST}/${KEY}.txt"

URLS=(
  "https://${HOST}/"
  "https://${HOST}/pricing"
  "https://${HOST}/about"
  "https://${HOST}/privacy"
  "https://${HOST}/terms"
)

PAYLOAD=$(cat <<EOF
{
  "host": "${HOST}",
  "key": "${KEY}",
  "keyLocation": "${KEY_LOCATION}",
  "urlList": $(printf '%s\n' "${URLS[@]}" | jq -R . | jq -s .)
}
EOF
)

echo "Pinging IndexNow for ${HOST}..."
curl -fsSL -X POST "https://api.indexnow.org/indexnow" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d "${PAYLOAD}"
echo
echo "Done."
