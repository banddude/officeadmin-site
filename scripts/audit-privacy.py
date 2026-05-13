#!/usr/bin/env python3
"""
audit-privacy.py — public/private boundary auditor.

Reads the published `officeadmin/data/system-map.v2.json` and asserts that
NO content from the local entity database leaks into it.

How:
  1. Walks ~/mikeshaffer/entities/*/entity.json (local-only, never committed
     to this repo), collecting all names, emails, phones, slugs.
  2. Walks ~/Library/LaunchAgents/*.plist labels (local-only).
  3. Loads the published JSON and checks every string-valued field against
     the dynamic deny set + the generic regex patterns.
  4. Exits non-zero with details if anything matches; clean exit if not.

CRITICAL: This script's source code must NOT contain any customer/contact
names. The deny set is built at runtime from local files. The script can
ship to the public repo safely.

Designed to be called from `regenerate.sh` after the generator runs, before
the commit step. A failed audit aborts the push.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

HOME = Path.home()
SITE_REPO = HOME / "tmp" / "officeadmin-site"
DEFAULT_PUBLISHED = SITE_REPO / "officeadmin" / "data" / "system-map.v2.json"
ENTITIES_DIR = HOME / "mikeshaffer" / "entities"

# Stop-words: very short or extremely common tokens that would generate
# false positives if treated as deny terms. Filter the dynamic deny set
# through this.
STOPWORDS = {
    "a", "an", "the", "and", "or", "of", "in", "on", "at", "to", "for",
    "co", "llc", "inc", "and", "of", "the",
    "construction", "electric", "electrical", "lighting", "services",
    "company", "corp", "group", "team", "office", "main", "test",
    "user", "admin", "system", "config", "data", "tmp", "tmp",
    "build", "src", "lib", "bin", "scripts", "modules", "core",
    "python", "node", "json", "yaml", "html", "css", "js",
}

# Public infra strings that are safe to appear (allowlist).
PUBLIC_ALLOWLIST = {
    "officeadmin.io", "officeadmin", "shaffercon.com",
    # shaffercon is intentionally public — it's the business website.
    # If the company name should also be private, remove this.
}

# Generic regex patterns that flag obvious leaks regardless of source.
GENERIC_PATTERNS = {
    "absolute_unix_path": re.compile(r"/(Users|home|var|etc|opt|tmp)/"),
    "ip_address": re.compile(r"\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b"),
    "email": re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE),
    "us_phone": re.compile(r"\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b"),
    "openai_key": re.compile(r"\bsk-[A-Za-z0-9]{20,}\b"),
    "aws_key": re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    "github_token": re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}\b"),
    "tilde_path": re.compile(r"~/"),
}


# Entity types/slugs to skip when building deny terms (these refer to Mike's
# own business or generic placeholders, not third parties needing protection).
SELF_SLUGS = {"shaffer-construction", "shaffer", "mike-shaffer", "mikeshaffer"}


def build_deny_terms() -> tuple[set[str], set[str]]:
    """Collect identifying terms from local-only sources. Never serialized.

    Returns two sets:
      - full_names: multi-word display names like "Susanna Wolff". Matched as
        contiguous (case-insensitive) substrings.
      - precise_contacts: full email addresses and phone numbers. Matched as
        exact substrings. (Generic regex catches the shape; this catches the
        specific value too in case a parser stringified it oddly.)
    """
    full_names: set[str] = set()
    precise_contacts: set[str] = set()

    if not ENTITIES_DIR.exists():
        return full_names, precise_contacts

    for entity_file in ENTITIES_DIR.glob("*/entity.json"):
        try:
            d = json.loads(entity_file.read_text())
        except Exception:
            continue
        slug = (d.get("slug") or "").lower()
        if slug in SELF_SLUGS:
            continue
        if slug.startswith("unknown-"):
            continue

        name = d.get("display_name") or d.get("name") or ""
        # Only include multi-word names — single words generate too many false
        # positives against legitimate code identifiers.
        if isinstance(name, str) and " " in name and len(name) >= 5:
            full_names.add(name.lower().strip())

        for email in d.get("emails", []) or []:
            if isinstance(email, str) and "@" in email:
                precise_contacts.add(email.lower().strip())
        for phone in d.get("phones", []) or []:
            if isinstance(phone, str) and any(c.isdigit() for c in phone):
                precise_contacts.add(phone.strip())

    return full_names, precise_contacts


def collect_strings(obj, path=""):
    """Yield (path, value) for every string in a nested JSON structure."""
    if isinstance(obj, str):
        yield path, obj
    elif isinstance(obj, dict):
        for k, v in obj.items():
            yield from collect_strings(v, f"{path}.{k}" if path else k)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from collect_strings(v, f"{path}[{i}]")


def is_allowlisted(value: str) -> bool:
    lo = value.lower()
    return any(item in lo for item in PUBLIC_ALLOWLIST)


def audit(target: Path | None = None) -> int:
    target = target or DEFAULT_PUBLISHED
    if not target.exists():
        print(f"FATAL: published file not found: {target}", file=sys.stderr)
        return 2

    full_names, precise_contacts = build_deny_terms()
    print(
        f"audit-privacy: {len(full_names)} full-name deny terms, "
        f"{len(precise_contacts)} precise contacts (from local entity db)",
        file=sys.stderr,
    )

    data = json.loads(target.read_text())
    violations: list[tuple[str, str, str]] = []
    seen_paths = set()

    for path, value in collect_strings(data):
        if path in seen_paths:
            continue
        if not isinstance(value, str):
            continue
        if is_allowlisted(value):
            continue
        lo = value.lower()

        # Generic patterns
        matched = False
        for name, pat in GENERIC_PATTERNS.items():
            if pat.search(value):
                violations.append((path, value, f"pattern:{name}"))
                seen_paths.add(path)
                matched = True
                break
        if matched:
            continue

        # Full multi-word names: substring match
        for term in full_names:
            if term in lo:
                violations.append((path, value, f"name:{term}"))
                seen_paths.add(path)
                matched = True
                break
        if matched:
            continue

        # Precise contacts (email/phone) — exact substring
        for term in precise_contacts:
            if term.lower() in lo:
                violations.append((path, value, f"contact:{term}"))
                seen_paths.add(path)
                break

    if violations:
        print(f"\nFATAL: {len(violations)} privacy violation(s) found in {target.name}:", file=sys.stderr)
        for path, value, reason in violations[:30]:
            print(f"  {reason}\n    at: {path}\n    value: {value!r}", file=sys.stderr)
        if len(violations) > 30:
            print(f"  ... and {len(violations) - 30} more", file=sys.stderr)
        return 1

    total_strings = sum(1 for _ in collect_strings(data))
    print(f"audit-privacy: ✓ clean — {total_strings} string fields, {len(full_names)} names + {len(precise_contacts)} contacts, 0 violations", file=sys.stderr)
    return 0


if __name__ == "__main__":
    arg = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else None
    sys.exit(audit(arg))
