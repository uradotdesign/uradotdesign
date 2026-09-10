#!/usr/bin/env bash
set -euo pipefail
# Credentials stay in the CMS container; only CSS class tokens reach the build.
task_container="${1:-directus_cms}"
mkdir -p .cms-build
docker exec "$task_container" mkdir -p /tmp/ura-css/lib
docker cp scripts/scan-cms-tailwind.mjs "$task_container:/tmp/ura-css/scan-cms-tailwind.mjs" >/dev/null
docker cp scripts/lib/cms-tailwind.mjs "$task_container:/tmp/ura-css/lib/cms-tailwind.mjs" >/dev/null
docker exec "$task_container" node /tmp/ura-css/scan-cms-tailwind.mjs --output=/tmp/ura-css/classes.html
docker cp "$task_container:/tmp/ura-css/classes.html" .cms-build/classes.html.next >/dev/null
mv .cms-build/classes.html.next .cms-build/classes.html
