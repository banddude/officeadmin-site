#!/usr/bin/env bash
# regenerate.sh — pull officeadmin-site, regenerate v2 system map, commit, push.
#
# Designed to be invoked from:
#   - a post-commit hook in ~/.aiva or ~/mikeshaffer (detached, fire-and-forget)
#   - a launchd safety-net job (hourly)
#   - a human running it directly
#
# Behavior:
#   - Acquires a flock so concurrent invocations queue rather than racing
#   - Pulls latest officeadmin-site (rebase)
#   - Runs the generator
#   - Commits and pushes only if system-map.v2.json actually changed
#   - Logs every run to ~/.aiva/state/officeadmin-map/last-run.log (truncated to last 200 lines)
#   - Exits 0 if nothing changed, 0 if changed and pushed, non-zero only on real errors

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

# Pull latest. If the working tree is dirty in unrelated files, bail loudly.
if [[ -n "$(git status --porcelain | grep -v 'officeadmin/data/system-map.v2.json' || true)" ]]; then
  log "WARN: working tree dirty in unexpected files; will not push"
  log "$(git status --short)"
  DIRTY=1
else
  DIRTY=0
fi

if [[ "$DIRTY" -eq 0 ]]; then
  if ! git pull --rebase --quiet 2>>"$LOG"; then
    log "FATAL: git pull failed"
    exit 1
  fi
fi

# Run the generator
if ! /usr/local/bin/node scripts/generate-system-map.mjs >>"$LOG" 2>&1; then
  log "FATAL: generator failed"
  exit 1
fi

# Did the map change?
if git diff --quiet -- officeadmin/data/system-map.v2.json; then
  log "no changes to system-map.v2.json — nothing to push"
  exit 0
fi

if [[ "$DIRTY" -eq 1 ]]; then
  log "map changed but tree was dirty — leaving change uncommitted"
  exit 0
fi

git add officeadmin/data/system-map.v2.json
SKIP_DRIFT_CHECK=1 git commit --quiet -m "officeadmin: auto-regenerate system map ($trigger)" >>"$LOG" 2>&1 || {
  log "FATAL: commit failed"
  exit 1
}
git push --quiet 2>>"$LOG" || {
  log "WARN: push failed (commit is local, will retry on next run)"
  exit 1
}

log "pushed updated system-map.v2.json"
