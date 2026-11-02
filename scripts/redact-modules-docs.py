#!/usr/bin/env python3
"""
redact-modules-docs.py — one-time projection of a committed modules-docs.json
onto the public allowlist (issue banddude/officeadmin-books#3963).

The live generator (bin/generate-docs.py) now applies the public boundary at
generation time, on Mike's machine. This script exists so an ALREADY-PUBLISHED
modules-docs.json can be cleaned in the public repo without access to the
generator's local sources: it reads the committed file, runs it through the
exact same public_filter() the generator uses, and rewrites it in place.

Run from the site repo root:
    python3 scripts/redact-modules-docs.py            # rewrite in place
    python3 scripts/redact-modules-docs.py --check    # exit 1 if it would change

After this, scripts/test-public-boundary.py is the ongoing guard.
"""
from __future__ import annotations
import importlib.util
import json
import sys
from pathlib import Path

SITE_ROOT = Path(__file__).resolve().parent.parent
TARGET = SITE_ROOT / "modules-docs.json"
GENERATOR = SITE_ROOT / "bin" / "generate-docs.py"


def load_generator():
    spec = importlib.util.spec_from_file_location("generate_docs", GENERATOR)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main() -> int:
    check = "--check" in sys.argv
    if not TARGET.is_file():
        print(f"error: {TARGET} not found", file=sys.stderr)
        return 2
    gen = load_generator()
    original = json.loads(TARGET.read_text())
    redacted = gen.public_filter(original, gen.load_allowlist())

    before_slugs = [m["slug"] for m in original.get("modules", [])]
    after_slugs = [m["slug"] for m in redacted["modules"]]
    dropped = [s for s in before_slugs if s not in set(after_slugs)]

    print(f"modules: {len(before_slugs)} -> {len(after_slugs)} "
          f"(withheld {len(dropped)}: {', '.join(dropped)})")
    print(f"edges: {len(original.get('edges', []))} -> {len(redacted['edges'])}")
    print(f"dropped top-level fields: "
          f"{sorted(set(original) - set(redacted)) or 'none'}")

    if original == redacted:
        print("already within the public boundary — no change")
        return 0
    if check:
        print("WOULD change (run without --check to apply)", file=sys.stderr)
        return 1
    TARGET.write_text(json.dumps(redacted, indent=2, ensure_ascii=False) + "\n")
    print(f"rewrote {TARGET}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
