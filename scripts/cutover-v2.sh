#!/usr/bin/env bash
#
# cutover-v2.sh — promote /officeadmin/v2/ to be the canonical /officeadmin/.
#
# What this does:
#   1. Pre-flight checks (clean tree, on main, all v2 files present, v2 JSON parses).
#   2. Regenerates + audits to confirm v2 is healthy.
#   3. Archives v1 files to officeadmin/_archive-v1/ (preserved in git history; not deleted).
#   4. Moves v2 files up one level so /officeadmin/v2/index.html becomes /officeadmin/index.html.
#   5. Renames system-map.v2.json → system-map.json.
#   6. Updates path references in:
#        - officeadmin/explorer.js   ("../data/system-map.v2.json" → "./data/system-map.json")
#        - officeadmin/tree.html     (same)
#        - officeadmin/index.html    ("v2/explorer.js" → "explorer.js" if present)
#        - scripts/generate-system-map.mjs  (OUTPUT_PATH → "system-map.json")
#        - scripts/audit-privacy.py         (DEFAULT_PUBLISHED → "system-map.json")
#        - scripts/regenerate.sh             (diff-ignore filename)
#   7. Removes the now-empty officeadmin/v2/ directory.
#   8. Removes the obsolete v1 generator scripts/generate-officeadmin-map.mjs.
#
# What this does NOT do:
#   - Commit anything. The script stages nothing automatically. After running,
#     review with `git status` + `git diff --cached`, then commit manually.
#   - Touch the Cloudflare Worker config (it lives in the Cloudflare dashboard
#     and based on testing is a pure passthrough proxy).
#   - Add a /v2/ → / redirect for bookmark holders. If you want that, add it
#     as a follow-up commit.
#
# Usage:
#   scripts/cutover-v2.sh              # dry-run, prints what would happen
#   scripts/cutover-v2.sh --execute    # actually perform the swap
#
# Reversible? Yes, via `git reset --hard HEAD` (everything is in-tree until commit).

set -euo pipefail

REPO="$HOME/tmp/officeadmin-site"
EXECUTE=0
if [[ "${1:-}" == "--execute" ]]; then EXECUTE=1; fi

cd "$REPO"

run() {
  if [[ $EXECUTE -eq 1 ]]; then
    echo "  $*"
    eval "$@"
  else
    echo "  [dry-run] $*"
  fi
}

say() {
  echo
  echo "=== $* ==="
}

# ---------- Pre-flight ----------
say "Pre-flight checks"
if [[ -n "$(git status --porcelain)" ]]; then
  echo "FATAL: working tree not clean. Commit or stash first."
  git status --short
  exit 1
fi
branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$branch" != "main" ]]; then
  echo "FATAL: not on main (on '$branch')."
  exit 1
fi
for f in officeadmin/v2/index.html officeadmin/v2/explorer.js officeadmin/v2/tree.html \
         officeadmin/data/system-map.v2.json officeadmin/index.html \
         officeadmin/data/system-map.json js/officeadmin.js; do
  if [[ ! -f "$f" ]]; then
    echo "FATAL: expected file missing: $f"
    exit 1
  fi
done
if ! python3 -c "import json; json.load(open('officeadmin/data/system-map.v2.json'))" 2>/dev/null; then
  echo "FATAL: system-map.v2.json does not parse as JSON"
  exit 1
fi
echo "  ✓ working tree clean, on main, v2 files present, v2 JSON parses"

# ---------- Regenerate + audit ----------
say "Regenerate + audit v2 (confirm healthy before swapping)"
if [[ $EXECUTE -eq 1 ]]; then
  node scripts/generate-system-map.mjs >/dev/null
  if ! python3 scripts/audit-privacy.py; then
    echo "FATAL: privacy audit failed. NOT proceeding with cutover."
    git checkout -- officeadmin/data/system-map.v2.json
    exit 1
  fi
else
  echo "  [dry-run] would: node scripts/generate-system-map.mjs && python3 scripts/audit-privacy.py"
fi

# ---------- Archive v1 ----------
say "Archive v1"
run "mkdir -p officeadmin/_archive-v1"
run "git mv officeadmin/index.html officeadmin/_archive-v1/index.html"
run "git mv officeadmin/data/system-map.json officeadmin/_archive-v1/system-map.json"
run "git mv js/officeadmin.js officeadmin/_archive-v1/officeadmin.js"

# ---------- Promote v2 ----------
say "Promote v2 → canonical"
run "git mv officeadmin/v2/index.html officeadmin/index.html"
run "git mv officeadmin/v2/explorer.js officeadmin/explorer.js"
run "git mv officeadmin/v2/tree.html officeadmin/tree.html"
run "git mv officeadmin/data/system-map.v2.json officeadmin/data/system-map.json"

# ---------- Rewrite path references ----------
say "Rewrite path references in promoted files"
# After move, explorer.js is at officeadmin/explorer.js (one level shallower).
# Path to data/ becomes "./data/system-map.json" (was "../data/system-map.v2.json").
if [[ $EXECUTE -eq 1 ]]; then
  # explorer.js
  sed -i '' 's|"\.\./data/system-map\.v2\.json"|"./data/system-map.json"|g' officeadmin/explorer.js
  sed -i '' 's|system-map\.v2\.json|system-map.json|g' officeadmin/explorer.js
  # tree.html
  sed -i '' 's|"\.\./data/system-map\.v2\.json"|"./data/system-map.json"|g' officeadmin/tree.html
  sed -i '' 's|system-map\.v2\.json|system-map.json|g' officeadmin/tree.html
  # index.html — any reference to v2/explorer.js should drop the v2/ prefix
  sed -i '' 's|"v2/explorer\.js"|"explorer.js"|g; s|src="v2/|src="|g; s|href="v2/|href="|g' officeadmin/index.html
  # Generator output path
  sed -i '' 's|"system-map\.v2\.json"|"system-map.json"|g' scripts/generate-system-map.mjs
  # Audit script
  sed -i '' 's|"system-map\.v2\.json"|"system-map.json"|g' scripts/audit-privacy.py
  # Regenerate.sh
  sed -i '' 's|system-map\.v2\.json|system-map.json|g' scripts/regenerate.sh
  echo "  ✓ rewrote path references in 6 files"
else
  echo "  [dry-run] would sed-replace 'system-map.v2.json' → 'system-map.json' across:"
  echo "    officeadmin/explorer.js, officeadmin/tree.html, officeadmin/index.html,"
  echo "    scripts/generate-system-map.mjs, scripts/audit-privacy.py, scripts/regenerate.sh"
fi

# ---------- Remove empty v2 dir and obsolete v1 generator ----------
say "Cleanup"
run "rmdir officeadmin/v2"
if [[ -f scripts/generate-officeadmin-map.mjs ]]; then
  run "git rm scripts/generate-officeadmin-map.mjs"
fi

# ---------- Post-flight sanity ----------
say "Post-flight: regenerate one more time and audit, to confirm new path is wired"
if [[ $EXECUTE -eq 1 ]]; then
  node scripts/generate-system-map.mjs >/dev/null
  if ! python3 scripts/audit-privacy.py; then
    echo "FATAL: post-cutover audit failed. Inspect changes; nothing committed yet."
    exit 1
  fi
  echo "  ✓ post-cutover generator + audit pass cleanly"
  echo
  echo "All changes are staged/working but not committed."
  echo "Review with: git status && git diff --cached"
  echo "Then commit with:"
  echo "  SKIP_DRIFT_CHECK=1 git commit -m 'officeadmin: cutover — v2 promoted to canonical /officeadmin/'"
  echo "  git push"
else
  echo "  [dry-run] would: node scripts/generate-system-map.mjs && python3 scripts/audit-privacy.py"
  echo
  echo "Dry-run complete. Re-run with --execute to actually perform the cutover."
fi
