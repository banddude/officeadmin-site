#!/bin/bash
# Watch ~/.aiva/modules/ for changes; re-run generate-docs.py on each batch.
#
# - Debounces events with `--latency 1.5` (collapse a 1.5s burst into one run)
# - Only fires on add/update/delete of MODULE.md, module.json, SKILL.md, bin/*
# - Logs to ~/.aiva/ops/logs/officeadmin-site/watch-modules.log

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODULES_DIR="${HOME}/.aiva/modules"
LOG_DIR="${HOME}/.aiva/ops/logs/officeadmin-site"
LOG="${LOG_DIR}/watch-modules.log"
mkdir -p "$LOG_DIR"

PY="${PY:-/usr/bin/python3}"
GEN="${ROOT}/bin/generate-docs.py"

echo "[$(date '+%F %T')] watch-modules: start (watching $MODULES_DIR, regenerating $ROOT/modules-docs.json)" >> "$LOG"

# initial run so the file is fresh on boot
"$PY" "$GEN" >> "$LOG" 2>&1 || echo "[$(date '+%F %T')] initial run failed" >> "$LOG"

# Watch only the files that matter; collapse bursts; one regen per burst.
exec /opt/homebrew/bin/fswatch \
    --recursive \
    --latency 1.5 \
    --event Created --event Updated --event Removed --event Renamed --event MovedFrom --event MovedTo \
    --include 'MODULE\.md$' \
    --include 'SKILL\.md$' \
    --include 'module\.json$' \
    --include 'bin/[^/]+$' \
    --exclude '.*' \
    "$MODULES_DIR" \
  | while read -r line; do
      echo "[$(date '+%F %T')] change: $line" >> "$LOG"
      if "$PY" "$GEN" >> "$LOG" 2>&1; then
        echo "[$(date '+%F %T')] regenerated ok" >> "$LOG"
      else
        echo "[$(date '+%F %T')] regenerate FAILED" >> "$LOG"
      fi
    done
