#!/usr/bin/env bash
set -euo pipefail
cd /var/www/ura-prototype/uradotdesign
case "${1:-}" in
  manifest)
    test "$#" = 1
    bash scripts/prepare-cms-css.sh directus_cms >/dev/null
    cat .cms-build/classes.html
    ;;
  deploy)
    test "$#" = 2
    exec /usr/local/sbin/ura-deploy "$2"
    ;;
  health)
    test "$#" = 1
    exec python3 /usr/local/sbin/ura-health
    ;;
  *) exit 64 ;;
esac
