#!/usr/bin/env bash
# Build in a disposable Node container; deploy only manifests and bundles.
set -euo pipefail
cms_container="${1:-directus_cms}"
repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
build_dir="$(mktemp -d -t ura-extensions.XXXXXXXX)"
cleanup() {
  case "$build_dir" in /tmp/ura-extensions.*) rm -rf -- "$build_dir" ;; esac
}
trap cleanup EXIT

docker inspect "$cms_container" >/dev/null
docker run --rm --memory=768m \
  -v "$repo_dir/directus-extensions:/source:ro" \
  -v "$build_dir:/build" -w /build node:24-alpine sh -ec '
    for extension in panel-external-embed ura-interfaces; do
      mkdir "$extension"
      cp /source/"$extension"/package*.json "$extension"/
      cp -R /source/"$extension"/src "$extension"/
      npm --prefix "$extension" ci --no-audit --no-fund
      npm --prefix "$extension" run build
    done
  '

for extension in panel-external-embed ura-interfaces; do
  target="/directus/extensions/directus-extension-$extension"
  docker exec "$cms_container" mkdir -p "$target/dist"
  docker cp "$build_dir/$extension/dist/." "$cms_container:$target/dist/"
  docker cp "$build_dir/$extension/package.json" "$cms_container:$target/package.json"
done
echo "Custom extension bundles installed; restart Directus to load them."
