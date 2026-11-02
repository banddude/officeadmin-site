#!/usr/bin/env bash
# regenerate.sh — pull officeadmin-site, regenerate the v2 system map LOCALLY.
#
# Designed to be invoked from:
#   - a post-commit hook in ~/.aiva or ~/mikeshaffer (detached, fire-and-forget)
#   - a launchd safety-net job (hourly)
#   - a human running it directly
#
# PUBLIC BOUNDARY (issue banddude/officeadmin-books#3963): the system atlas
# (officeadmin/data/system-map*.json) is an internal view of the operator's
# machine — hosts, paths, repos, launchd jobs — and is NO LONGER PUBLISHED.
# This script regenerates it for local viewing only. It NEVER commits or
# pushes: the data files are gitignored and scripts/test-public-boundary.py
# fails the tree if they are ever added back. modules-docs.json is projected
# onto scripts/public-allowlist.json by bin/generate-docs.py before it is
# written; publishing changes to it stays a deliberate manual commit.
#
# Behavior:
#   - Acquires a lock so concurrent invocations queue rather than racing
#   - Pulls latest officeadmin-site (rebase)
#   - Runs the generator (writes the gitignored local atlas data)
#   - Runs the privacy audit AND the public-boundary guard; a failure leaves
#     the local file in place but logs FATAL (and the boundary guard fails
#     any tree that tries to publish atlas data)
#   - Logs every run to ~/.aiva/state/officeadmin-map/last-run.log (truncated
#     to last 200 lines)
#   - Exits 0 when the local regeneration succeeded

set -euo pipefail

REPO="${OFFICEADMIN_REPO:-$HOME/tmp/officeadmin-site}"
LOG_DIR="${OFFICEADMIN_LOG_DIR:-$HOME/.aiva/state/officeadmin-map}"
LOG="$LOG_DIR/last-run.log"
LOCK="$LOG_DIR/regenerate.lock"
mkdir -p "$LOG_DIR"

# Trim log on entry so it doesn't grow unbounded
if [[ -f "$LOG" ]]; then
  tail -n 200 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi

# Atomic lock via mkdir (macOS has no flock by default).
if ! mkdir "$LOCK" 2>/dev/null; then
  # Check if the lock is stale (older than 10 min) — clean it up.
  if [[ -d "$LOCK" ]]; then
    age=$(( $(date +%s) - $(stat -f %m "$LOCK" 2>/dev/null || echo 0) ))
    if (( age > 600 )); then
      rm -rf "$LOCK" && mkdir "$LOCK" || { echo "[$(date -u +%FT%TZ)] could not acquire lock" >> "$LOG"; exit 0; }
    else
      echo "[$(date -u +%FT%TZ)] another regenerate is running — skipping" >> "$LOG"
      exit 0
    fi
  fi
fi
trap 'rm -rf "$LOCK"' EXIT

ts() { date -u +"%FT%TZ"; }
log()  { echo "[$(ts)] $*" >> "$LOG"; }

trigger="${1:-manual}"
log "----- regenerate (trigger=$trigger) -----"

cd "$REPO" || { log "FATAL: $REPO not found"; exit 1; }

# Pull latest. If the working tree is dirty in tracked files, bail loudly:
# only untracked (gitignored, locally generated) files may be dirty.
if [[ -n "$(git status --porcelain | grep -v '^??' || true)" ]]; then
  log "FATAL: working tree dirty in tracked files; not regenerating"
  log "$(git status --short)"
  exit 1
fi

if ! git pull --rebase --quiet 2>>"$LOG"; then
  log "FATAL: git pull failed"
  exit 1
fi

# Run the generator. The atlas data files are gitignored; this only refreshes
# the LOCAL copies for local viewing.
if ! /usr/local/bin/node scripts/generate-system-map.mjs >>"$LOG" 2>&1; then
  log "FATAL: generator failed"
  exit 1
fi

# Privacy audit: read local entity DB, assert no contact/entity leaks in the
# locally generated atlas JSON (defense in depth for the local file too).
if ! /usr/bin/python3 scripts/audit-privacy.py >>"$LOG" 2>&1; then
  log "FATAL: privacy audit failed"
  exit 1
fi

# Public-boundary guard: the PUBLISHED tree must stay inside the allowlist.
if ! /usr/bin/python3 scripts/test-public-boundary.py >>"$LOG" 2>&1; then
  log "FATAL: public-boundary guard failed — the tree is not publishable"
  exit 1
fi

log "regenerated local atlas data (untracked, local-only); nothing committed or pushed"
