#!/usr/bin/env bash
# Private, encrypted local recovery checkpoints. No application writes or downtime.
set -euo pipefail
umask 077
exec 9>/run/lock/ura-backup.lock
flock -w 900 9 || { echo 'Another backup did not finish within 15 minutes' >&2; exit 1; }
repo=/var/www/ura-prototype/uradotdesign
root=/var/backups/ura
install -d -m 700 "$root" /etc/ura
if [ ! -f /etc/ura/backup.agekey ]; then
  age-keygen -o /etc/ura/backup.agekey 2>/dev/null
fi
work=$(mktemp -d "$root/.work.XXXXXXXX")
partial=''
restore_container="ura-backup-verify-$$"
cleanup() {
  docker rm -f "$restore_container" >/dev/null 2>&1 || true
  case "$work" in /var/backups/ura/.work.*) rm -rf -- "$work" ;; esac
  case "$partial" in /var/backups/ura/ura-*.tar.age.partial) rm -f -- "$partial" ;; esac
}
trap cleanup EXIT

if [ "${1:-}" = --verify ]; then
  latest=$(find "$root" -maxdepth 1 -name 'ura-*.tar.age' -type f | sort | tail -1)
  test -n "$latest"
  age -d -i /etc/ura/backup.agekey "$latest" | tar -xf - -C "$work"
else
  # Copy uploads before and after the database snapshot. Restore verification
  # catches missing references instead of silently declaring a partial backup good.
  uploads=$(docker inspect directus_cms --format '{{range .Mounts}}{{if eq .Destination "/directus/uploads"}}{{.Source}}{{end}}{{end}}')
  test -d "$uploads"
  mkdir "$work/uploads"
  cp -a "$uploads/." "$work/uploads/"
  docker exec directus_postgres sh -ec 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$work/database.dump"
  docker exec directus_postgres sh -ec 'pg_dumpall -U "$POSTGRES_USER" --globals-only' > "$work/roles.sql"
  cp -a --update=none "$uploads/." "$work/uploads/"
  cp "$repo/.env" "$work/environment"
  cp "$repo/docker-compose.prod.yml" "$work/compose.yml"
  extensions=$(docker inspect directus_cms --format '{{range .Mounts}}{{if eq .Destination "/directus/extensions"}}{{.Source}}{{end}}{{end}}')
  test -d "$extensions"
  cp -a "$extensions" "$work/extensions"
  cp /etc/nginx/sites-available/ura.design "$work/nginx.conf"
  git -C "$repo" rev-parse HEAD > "$work/revision"
  docker inspect directus_cms directus_postgres ura_redis --format '{{.Name}} {{.Image}}' > "$work/images.txt"
fi

# Restore a fresh database with no network access, never the production database.
image=$(docker inspect directus_postgres --format '{{.Image}}')
docker run -d --name "$restore_container" --network none --memory 512m --cpus 0.5 \
  --log-driver local -v "$work/restoredb:/var/lib/postgresql" \
  -e POSTGRES_HOST_AUTH_METHOD=trust "$image" >/dev/null
for attempt in $(seq 1 60); do
  if docker exec "$restore_container" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec -i "$restore_container" pg_restore -U postgres -d postgres --no-owner --no-acl --exit-on-error < "$work/database.dump"
docker exec "$restore_container" psql -U postgres -d postgres -Atc "SELECT count(*) FROM directus_collections" | grep -Eq '^[1-9][0-9]*$'
docker exec "$restore_container" psql -U postgres -d postgres -Atc "SELECT filename_disk FROM directus_files WHERE storage='local' AND filename_disk IS NOT NULL" > "$work/files.txt"
while IFS= read -r file; do
  case "$file" in */*|..*) echo 'Unsafe upload filename in restore' >&2; exit 1 ;; esac
  test -f "$work/uploads/$file" || { echo 'Backup is missing a referenced upload' >&2; exit 1; }
done < "$work/files.txt"

if [ "${1:-}" != --verify ]; then
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  recipient=$(age-keygen -y /etc/ura/backup.agekey)
  partial="$root/ura-$stamp.tar.age.partial"
  tar --exclude=./restoredb -C "$work" -cf - . | age -r "$recipient" -o "$partial"
  age -d -i /etc/ura/backup.agekey "$partial" | tar -tf - >/dev/null
  mv "$partial" "$root/ura-$stamp.tar.age"
  # Retain the newest 14 successful backups. Legacy/manual checkpoints are untouched.
  find "$root" -maxdepth 1 -name 'ura-*.tar.age' -type f | sort -r | tail -n +15 | while IFS= read -r expired; do rm -- "$expired"; done
  date -u +%s > "$root/last-success"
fi
date -u +%s > "$root/last-restore-success"
echo 'Ura backup and isolated restore checks passed.'
