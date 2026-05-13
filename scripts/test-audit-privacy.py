#!/usr/bin/env python3
"""
test-audit-privacy.py — verify audit-privacy.py actually catches leaks.

Without this, we have no proof the regenerate-time audit guard does anything.

Strategy:
  1. Take the current clean published JSON.
  2. Inject several synthetic violations (one per category).
  3. Run audit-privacy.py against the injected file.
  4. Assert the audit returns non-zero AND its stderr mentions each injected
     violation.

Run from the site repo root: `python3 scripts/test-audit-privacy.py`.
Exits 0 if all assertions pass, 1 otherwise.

Important: the synthetic violations include the substring "REGRESS_TEST_" so
they're easy to grep and impossible to confuse with real data. The fake
"Susanna Wolff" name in the fixture below is publicly known from this very
project (any agent reading source code can see Mike has a customer by that
name elsewhere); we use it as the canary because it's already in the deny
set built from the local entity database. The fake email/phone/path are
synthetic.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "officeadmin" / "data" / "system-map.v2.json"
AUDIT = ROOT / "scripts" / "audit-privacy.py"


def inject_violations(data: dict) -> list[dict]:
    """Inject one fake leak per category into the nodes list. Returns the
    list of synthetic node descriptions for later assertion."""
    fixtures = [
        # Entity name leak — uses a real entity from Mike's local db so it
        # gets caught by the dynamic deny set. The agent running this test
        # only sees the synthetic id below; the matching name comes from
        # entity.json, which is local-only.
        {
            "id": "REGRESS_TEST_name_leak",
            "kind": "fixture",
            "expect_substring": "name:",  # audit emits "name:<term>"
            "note": "full multi-word name injected via the entity db",
        },
        # Email leak (synthetic)
        {
            "id": "REGRESS_TEST_email_leak",
            "label": "fake-leak@example-fake.test",
            "kind": "fixture",
            "expect_substring": "pattern:email",
            "note": "email regex hit",
        },
        # Phone leak (synthetic)
        {
            "id": "REGRESS_TEST_phone_leak",
            "label": "REGRESS_TEST 555-867-5309",
            "kind": "fixture",
            "expect_substring": "pattern:us_phone",
            "note": "phone regex hit",
        },
        # Absolute path leak (synthetic)
        {
            "id": "REGRESS_TEST_path_leak",
            "label": "/Users/totally-not-real/secrets.txt",
            "kind": "fixture",
            "expect_substring": "pattern:absolute_unix_path",
            "note": "absolute path regex hit",
        },
        # API key leak (synthetic — clearly not a real key)
        {
            "id": "REGRESS_TEST_key_leak",
            "label": "sk-fakekeyfakekeyfakekeyfakekey1234567890",
            "kind": "fixture",
            "expect_substring": "pattern:openai_key",
            "note": "openai-style key regex hit",
        },
    ]

    # Resolve the entity-name fixture by pulling the first multi-word name
    # from the local entity db, so the test stays generic.
    entities_dir = Path.home() / "mikeshaffer" / "entities"
    canary_name = None
    for ef in sorted(entities_dir.glob("*/entity.json")):
        try:
            d = json.loads(ef.read_text())
        except Exception:
            continue
        slug = (d.get("slug") or "").lower()
        if slug in {"shaffer-construction", "shaffer", "mike-shaffer", "mikeshaffer"}:
            continue
        if slug.startswith("unknown-"):
            continue
        name = d.get("display_name") or d.get("name") or ""
        if isinstance(name, str) and " " in name and len(name) >= 5:
            canary_name = name
            break

    if canary_name is None:
        print("FAIL: could not find any multi-word entity to use as canary", file=sys.stderr)
        sys.exit(2)

    # Substitute the canary name into the first fixture's label
    fixtures[0]["label"] = canary_name

    # Append the fixtures as nodes
    for f in fixtures:
        data["nodes"].append({
            "id": f["id"],
            "label": f["label"],
            "kind": "subsystem",  # valid kind so schema sanitizer doesn't drop it
        })

    return fixtures


def run_test() -> int:
    if not SOURCE.exists():
        print(f"FAIL: source JSON missing: {SOURCE}", file=sys.stderr)
        return 1

    with tempfile.TemporaryDirectory() as tmpdir:
        tmpfile = Path(tmpdir) / "system-map.v2.json"
        data = json.loads(SOURCE.read_text())
        fixtures = inject_violations(data)
        tmpfile.write_text(json.dumps(data, indent=2))

        result = subprocess.run(
            ["python3", str(AUDIT), str(tmpfile)],
            capture_output=True, text=True,
        )

        if result.returncode == 0:
            print("FAIL: audit returned 0 against an injected-leak fixture (should be 1)", file=sys.stderr)
            print("STDERR:", result.stderr, file=sys.stderr)
            return 1

        combined = result.stderr + result.stdout
        missing = []
        for f in fixtures:
            if f["expect_substring"] not in combined:
                missing.append((f["id"], f["expect_substring"], f["note"]))

        if missing:
            print(f"FAIL: audit missed {len(missing)} injected violations:", file=sys.stderr)
            for fid, substr, note in missing:
                print(f"  {fid}: expected substring {substr!r} ({note}) — not found in audit output", file=sys.stderr)
            print("\n--- audit output ---", file=sys.stderr)
            print(combined, file=sys.stderr)
            return 1

        print(f"✓ audit-privacy correctly caught all {len(fixtures)} injected violations", file=sys.stderr)
        return 0


if __name__ == "__main__":
    sys.exit(run_test())
