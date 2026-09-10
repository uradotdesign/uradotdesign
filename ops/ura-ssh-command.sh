#!/usr/bin/env bash
set -euo pipefail
command=${SSH_ORIGINAL_COMMAND:-}
case "$command" in
  manifest) exec sudo -n /usr/local/sbin/ura-ci-operation manifest ;;
  health) exec sudo -n /usr/local/sbin/ura-ci-operation health ;;
  deploy\ *)
    sha=${command#deploy }
    [[ "$sha" =~ ^[a-f0-9]{40}$ ]] || exit 64
    exec sudo -n /usr/local/sbin/ura-ci-operation deploy "$sha"
    ;;
  *) echo 'Unsupported deployment operation' >&2; exit 64 ;;
esac
