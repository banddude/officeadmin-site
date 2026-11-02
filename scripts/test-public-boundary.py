#!/usr/bin/env python3
"""
test-public-boundary.py — public/private boundary guard for officeadmin-site.

This repository is PUBLIC (it feeds landing.officeadmin.io via GitHub Pages),
while its data is GENERATED from a private assistant installation. This guard
fails when anything internal-only is present in the PUBLISHED tree, so it can
gate every commit/push path (regenerate.sh wires it in; wire it into any CI
the same way: `python3 scripts/test-public-boundary.py`).

What it enforces (issue banddude/officeadmin-books#3963):

  1. modules-docs.json is fully inside scripts/public-allowlist.json:
     only allowlisted module topics, only allowlisted fields per module,
     only allowlisted top-level fields, edges only between public modules.
     No full MODULE.md bodies, no per-module bin inventories, no machine
     placement, no filesystem paths.
  2. The internal system atlas is not published: nothing under
     officeadmin/data/ may be tracked (system-map.json / system-map.v2.json
     are generated locally and stay local).
  3. No credential-shaped strings in served artifacts and no private-key
     blocks anywhere in the published tree. One documented exemption: the
     FAKE OpenAI-shaped fixture inside scripts/test-audit-privacy.py, which
     exists to test the privacy auditor.
  4. No username-qualified absolute filesystem paths (Mac user homes,
     Linux user homes and the root home) anywhere in the published tree, and no internal
     home anchors (~/.aiva, ~/.claude, ~/mikeshaffer, ~/Library, ~/.openclaw)
     inside SERVED artifacts (HTML/JS/CSS/JSON). Generator tooling legitimately
     resolves the home directory at runtime and README documents the flow, so
     tilde anchors are checked in served artifacts, not in tooling/docs copy.
  5. No internal atlas markers (generatedOnHost, refreshCommand,
     generatedSources) inside published JSON other than the two named config
     manifests (module.json, scripts/public-allowlist.json).
  6. No tracked files under officeadmin/data/ other than nothing at all —
     a new generated data file fails until a human rules on it.
  7. Customer source under jason/ stays in the repository, but GitHub Pages
     must exclude the entire directory. A .nojekyll bypass or a publication
     configuration override fails closed.

Run from the repo root:  python3 scripts/test-public-boundary.py
Exit 0 = boundary holds. Exit 1 = violations (printed). Exit 2 = setup error.
"""
from __future__ import annotations
import json
import re
import subprocess
import sys
from pathlib import Path

SITE_ROOT = Path(__file__).resolve().parent.parent
ALLOWLIST_PATH = SITE_ROOT / "scripts" / "public-allowlist.json"

# Served artifacts get the strict scan; tooling/docs get the narrow one.
STRICT_SUFFIXES = {".json", ".html", ".js", ".css", ".svg"}
STRICT_NAMES = {"CNAME"}
SOURCE_SUFFIXES = {".py", ".mjs", ".sh", ".md"}

# Known-fixture file: contains a FAKE OpenAI-shaped key used by the privacy
# auditor's regression test. The only allowed credential-shape match.
FIXTURE_EXEMPT = "scripts/test-audit-privacy.py"

# Config manifests that are intentionally tracked JSON (not generated data).
JSON_CONFIG_EXEMPT = {"module.json", "scripts/public-allowlist.json"}

CREDENTIAL_PATTERNS = {
    "openai_key": re.compile(r"\bsk-[A-Za-z0-9_-]{20,}\b"),
    "github_token": re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}\b"),
    "github_pat": re.compile(r"\bgithub_pat_[A-Za-z0-9_]{20,}\b"),
    "aws_key": re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    "slack_token": re.compile(r"\bxox[abp]-[A-Za-z0-9-]{10,}\b"),
    "google_api_key": re.compile(r"\bAIza[A-Za-z0-9_-]{30,}\b"),
    "jwt": re.compile(r"\beyJ[A-Za-z0-9_-]{40,}\b"),
}
PRIVATE_KEY_BLOCK = re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")

ABS_PATH_PATTERNS = {
    "mac_absolute_path": re.compile(r"/Users/[A-Za-z0-9._-]+/"),
    "unix_absolute_path": re.compile(r"/home/[A-Za-z0-9._-]+/"),
    "root_absolute_path": re.compile(r"(?<![\w.])/root/"),
}

# Tilde anchors that name the private installation. Checked in SERVED
# artifacts only (see module docstring).
TILDE_ANCHORS = ["~/.aiva", "~/.claude", "~/.openclaw", "~/mikeshaffer", "~/Library", "~/AIVA"]

# Markers of the internal atlas schema.
ATLAS_MARKERS = ["generatedOnHost", "refreshCommand", "generatedSources"]

INTERNAL_ATLAS_DIR = "officeadmin/data/"
PRIVATE_SITE_DIRS = {"jason"}


def check_pages_publication(violations: list[str]) -> None:
    # JSON is valid YAML. Keep this small Pages config in JSON form so this
    # dependency-free guard checks its meaning without an ad-hoc YAML parser.
    # GitHub Pages uses the legacy Jekyll build on main at the repository root.
    if (SITE_ROOT / ".nojekyll").exists():
        violations.append(".nojekyll bypasses the private-directory exclusion")
    try:
        config = json.loads((SITE_ROOT / "_config.yml").read_text())
    except (OSError, ValueError) as error:
        violations.append(f"_config.yml: readable JSON-form Pages config required: {error}")
        return
    if not isinstance(config, dict) or set(config) - {"exclude"}:
        violations.append("_config.yml: only the reviewed exclude setting is allowed")
        return
    excluded = config.get("exclude")
    if not isinstance(excluded, list) or not all(
        isinstance(entry, str) and entry and not Path(entry).is_absolute()
        and ".." not in Path(entry).parts for entry in excluded
    ):
        violations.append("_config.yml: exclude must contain relative directory names")
        return
    for private_dir in PRIVATE_SITE_DIRS:
        if private_dir not in {entry.rstrip("/") for entry in excluded}:
            violations.append(f"_config.yml: {private_dir}/ must be excluded from publication")


def tracked_files() -> list[Path]:
    out = subprocess.run(
        ["git", "ls-files", "-z"], cwd=SITE_ROOT,
        capture_output=True, check=True,
    )
    return [Path(p.decode()) for p in out.stdout.split(b"\0") if p]


def check_modules_docs(rel: str, allow: dict, violations: list[str]) -> None:
    path = SITE_ROOT / rel
    try:
        data = json.loads(path.read_text())
    except Exception as e:
        violations.append(f"{rel}: not parseable JSON: {e}")
        return

    allowed_slugs = {e["slug"] for e in allow["modules"]}
    allowed_fields = set(allow["module_fields"])
    allowed_top = set(allow["top_level_fields"])

    extra_top = sorted(set(data) - allowed_top)
    if extra_top:
        violations.append(f"{rel}: top-level fields outside allowlist: {extra_top}")

    descriptions = {e["slug"]: e.get("description") for e in allow["modules"]}
    for i, m in enumerate(data.get("modules", [])):
        slug = m.get("slug", f"<index {i}>")
        if slug not in allowed_slugs:
            violations.append(f"{rel}: module '{slug}' is not on the public allowlist")
            continue
        extra = sorted(set(m) - allowed_fields)
        if extra:
            violations.append(f"{rel}: module '{slug}' has fields outside allowlist: {extra}")
        for banned in ("module_md", "path", "machine", "bin", "notes",
                       "skill_description", "public_surface",
                       "host_requirements", "state_dirs",
                       "purpose", "title", "name"):
            if banned in m:
                violations.append(f"{rel}: module '{slug}' carries internal field '{banned}'")
        # Provenance: the published description must be the curated one from
        # the allowlist, never free-form text from the private sources.
        expected = descriptions.get(slug)
        if "description" not in m:
            violations.append(f"{rel}: module '{slug}' is missing its curated description")
        elif expected is not None and m["description"] != expected:
            violations.append(f"{rel}: module '{slug}' description does not match the allowlist")
        date = m.get("module_md_date")
        if date is not None and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(date)):
            violations.append(f"{rel}: module '{slug}' module_md_date is not a bare date: {date!r}")

    for edge in data.get("edges", []):
        if not isinstance(edge, list) or len(edge) != 2:
            violations.append(f"{rel}: malformed edge entry: {edge!r}")
            continue
        a, b = edge
        if a not in allowed_slugs or b not in allowed_slugs:
            violations.append(f"{rel}: edge {a} -> {b} references a non-public module")


def scan_text(rel: str, text: str, strict: bool, violations: list[str]) -> None:
    # Credentials: full shape scan on served artifacts. On the fixture file,
    # exactly one OpenAI-shaped token (the fake) is tolerated. Tooling files
    # are checked for private-key blocks only.
    if rel == FIXTURE_EXEMPT:
        if len(CREDENTIAL_PATTERNS["openai_key"].findall(text)) > 1:
            violations.append(f"{rel}: more than one OpenAI-shaped token (only the fake fixture is allowed)")
        for name, pat in CREDENTIAL_PATTERNS.items():
            if name == "openai_key":
                continue
            if pat.search(text):
                violations.append(f"{rel}: credential shape {name}")
    elif strict:
        for name, pat in CREDENTIAL_PATTERNS.items():
            if pat.search(text):
                violations.append(f"{rel}: credential shape {name}")
    if PRIVATE_KEY_BLOCK.search(text):
        violations.append(f"{rel}: private key block")

    # Absolute filesystem paths: everywhere in the published tree, except the
    # documented fixture file (its fake Mac user-home path is the
    # test data for the privacy auditor).
    if rel != FIXTURE_EXEMPT:
        for name, pat in ABS_PATH_PATTERNS.items():
            m = pat.search(text)
            if m:
                violations.append(f"{rel}: absolute filesystem path ({name}): {text[m.start():m.start()+40]!r}")

    # Internal home anchors in served artifacts.
    if strict:
        for anchor in TILDE_ANCHORS:
            if anchor in text:
                violations.append(f"{rel}: internal home anchor {anchor!r} in served artifact")

    # Internal atlas schema markers in published data JSON.
    if strict and rel.endswith(".json") and rel not in JSON_CONFIG_EXEMPT:
        for marker in ATLAS_MARKERS:
            if marker in text:
                violations.append(f"{rel}: internal atlas marker {marker!r} in published JSON")


def main() -> int:
    if not SITE_ROOT.is_dir():
        print(f"error: repo root not found: {SITE_ROOT}", file=sys.stderr)
        return 2
    try:
        files = tracked_files()
    except subprocess.CalledProcessError as e:
        print(f"error: git ls-files failed: {e.stderr!r}", file=sys.stderr)
        return 2
    if not ALLOWLIST_PATH.is_file():
        print(f"error: allowlist missing: {ALLOWLIST_PATH}", file=sys.stderr)
        return 2
    allow = json.loads(ALLOWLIST_PATH.read_text())

    violations: list[str] = []
    check_pages_publication(violations)

    # The internal atlas must not be published at all.
    for f in files:
        if f.as_posix().startswith(INTERNAL_ATLAS_DIR):
            violations.append(f"{f.as_posix()}: internal atlas data is tracked "
                              f"({INTERNAL_ATLAS_DIR} must stay untracked)")

    # Structural check on the public docs catalog.
    if (SITE_ROOT / "modules-docs.json").is_file():
        check_modules_docs("modules-docs.json", allow, violations)

    # Pattern scans.
    strict_count = source_count = private_count = 0
    for rel in files:
        if rel.parts and rel.parts[0] in PRIVATE_SITE_DIRS:
            # Do not read or print customer material. The mandatory Pages
            # exclusion above, rather than a hidden link, keeps it off-site.
            private_count += 1
            continue
        p = SITE_ROOT / rel
        if not p.is_file():
            continue
        suffix = p.suffix.lower()
        strict = suffix in STRICT_SUFFIXES or rel.as_posix() in STRICT_NAMES
        source = suffix in SOURCE_SUFFIXES
        if not (strict or source):
            continue
        try:
            text = p.read_text(errors="replace")
        except Exception as e:
            violations.append(f"{rel.as_posix()}: unreadable: {e}")
            continue
        scan_text(rel.as_posix(), text, strict, violations)
        if strict:
            strict_count += 1
        else:
            source_count += 1

    if violations:
        print(f"FAIL: {len(violations)} public-boundary violation(s):")
        for v in violations:
            print(f"  - {v}")
        return 1

    print(f"public-boundary: OK — {strict_count} served artifacts + "
          f"{source_count} tooling files scanned, "
          f"{len(allow['modules'])} public modules allowlisted, atlas untracked, "
          f"{private_count} private source files excluded from Pages")
    return 0


if __name__ == "__main__":
    sys.exit(main())
