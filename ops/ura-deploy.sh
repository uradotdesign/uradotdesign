#!/usr/bin/env bash
# Called by the forced-command SSH entry point. Deploy only a main-branch SHA.
set -euo pipefail
umask 077
sha=${1:?verified revision required}
public_origin=${URA_SMOKE_ORIGIN:-https://ura.design}
[[ "$sha" =~ ^[a-f0-9]{40}$ ]] || exit 64
repo=/var/www/ura-prototype/uradotdesign
state=/var/lib/ura-deploy
install -d -m 700 "$state"
exec 8>/run/lock/ura-deploy.lock
flock -w 1200 8
cd "$repo"
git fetch --quiet origin main
git merge-base --is-ancestor "$sha" origin/main
git diff --quiet
git diff --cached --quiet
old_sha=$(git rev-parse HEAD)
git merge --ff-only "$sha" >/dev/null
test "$(git rev-parse HEAD)" = "$sha"

# stdin is the CI-built image archive; nothing is built on the shared VPS.
gzip -dc | docker load >/dev/null
image="ura-astro:$sha"
test "$(docker image inspect "$image" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')" = "$sha"
backend_hash=$(git ls-files Dockerfile.directus docker-compose.prod.yml directus-extensions scripts/patch-directus-picker.mjs scripts/verify-directus-ui-build.mjs | xargs sha256sum | sha256sum | cut -d ' ' -f1)
if [ ! -f "$state/backend-hash" ] || [ "$(cat "$state/backend-hash")" != "$backend_hash" ]; then
  /usr/local/sbin/ura-backup
  docker compose -f docker-compose.prod.yml up -d --no-build --wait --wait-timeout 240 postgres redis directus
  # Bundles are built in CI and shipped inside the verified CMS image.
  for extension in panel-external-embed ura-interfaces; do
    docker exec -u root directus_cms sh -ec "mkdir -p /directus/extensions/directus-extension-$extension; cp -a /opt/ura-extensions/$extension/. /directus/extensions/directus-extension-$extension/; chown -R node:node /directus/extensions/directus-extension-$extension"
  done
  docker compose -f docker-compose.prod.yml restart directus
  docker compose -f docker-compose.prod.yml up -d --no-build --wait --wait-timeout 240 postgres redis directus
  docker exec -i directus_cms node --input-type=module - --clear-cache < scripts/verify-directus.mjs
  printf '%s\n' "$backend_hash" > "$state/backend-hash"
fi

active=$(cat "$state/active-port" 2>/dev/null || echo 4321)
port=4322
[ "$active" != 4322 ] || port=4323
candidate="ura_astro_$port"
previous="ura_astro_$active"
docker rm -f "$candidate" >/dev/null 2>&1 || true
docker compose -f docker-compose.prod.yml config --format json | python3 -c 'import json,sys; c=json.load(sys.stdin); print("\n".join(k+"="+str(v) for k,v in c["services"]["astro"]["environment"].items()))' > "$state/runtime.env"
printf '\nRELEASE_ID=%s\nHTML_CACHE_ENABLED=true\n' "$sha" >> "$state/runtime.env"
cp /etc/nginx/conf.d/ura-upstream.conf "$state/upstream.previous"
switched=false
rollback() {
  result=$?
  if [ "$result" -ne 0 ]; then
    if [ "$switched" = true ]; then
      cp "$state/upstream.previous" /etc/nginx/conf.d/ura-upstream.conf
      nginx -t && systemctl reload nginx
    fi
    docker rm -f "$candidate" >/dev/null 2>&1 || true
    echo "Deployment failed; previous website retained ($old_sha)." >&2
  fi
  rm -f "$state/runtime.env"
  exit "$result"
}
trap rollback EXIT
docker run -d --name "$candidate" --restart unless-stopped --memory 512m --cpus 1 \
  --log-driver json-file --log-opt max-size=10m --log-opt max-file=3 \
  --network uradotdesign_app_network --env-file "$state/runtime.env" \
  -p "127.0.0.1:$port:4321" "$image" >/dev/null
for path in en de sitemap.xml en/rss.xml en/og.png; do
  curl -fsS --retry 20 --retry-all-errors --retry-delay 2 --max-time 15 "http://127.0.0.1:$port/$path" >/dev/null
done
docker exec "$candidate" node --input-type=module -e 'const r=await fetch("http://127.0.0.1:4321/api/revalidate",{method:"POST",headers:{"x-revalidate-secret":process.env.REVALIDATE_SECRET,"Content-Type":"application/json"},body:"{}"});if(!r.ok){console.error("Candidate revalidation failed:",r.status);process.exit(1)}'
# Retain fingerprinted assets so already-open pages survive a deployment.
install -d -m 755 /var/lib/ura-assets
docker cp "$candidate:/app/dist/client/_astro/." /var/lib/ura-assets/
chmod -R a+rX /var/lib/ura-assets
find /var/lib/ura-assets -type f -mtime +365 -delete
printf 'upstream ura_astro { server 127.0.0.1:%s; keepalive 16; }\n' "$port" > /etc/nginx/conf.d/ura-upstream.conf
switched=true
nginx -t
systemctl reload nginx
for path in en de; do
  curl -fsS --retry 3 --retry-all-errors --max-time 15 "$public_origin/$path" >/dev/null
done
printf '%s\n' "$port" > "$state/active-port"
printf '%s\n' "$sha" > "$state/active-revision"
docker image tag "$image" ura-astro:current
# Keep the previous instance available for rollback and in-flight requests.
# The next deployment replaces that inactive slot after readiness is established.
echo "Deployed verified image $sha on $port; previous instance retained."
