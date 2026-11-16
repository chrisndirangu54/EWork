#!/usr/bin/env bash
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
for module in marketplace/upstream/lancy marketplace/reference/freelancezero; do
  if [[ ! -f "$ROOT/$module/LICENSE" ]]; then
    echo "Missing $module/LICENSE: run git submodule update --init --recursive" >&2
    exit 1
  fi
done
git -C "$ROOT" submodule status
echo "Submodules present; this is not a functional or security audit."
