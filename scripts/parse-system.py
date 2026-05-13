#!/usr/bin/env python3
"""
parse-system.py — Phase 3 parser for launchd, SKILL.md, MCP.

Emits {"nodes": [...], "edges": [...]} on stdout matching the schema in
officeadmin/BUILD-PLAN.md. Called by scripts/generate-system-map.mjs.

What it does
------------
1. Walks `~/Library/LaunchAgents/*.plist`, emits `launchd_job` nodes, and
   tries to resolve the executed script back to a Python file node ID. If
   it resolves, emits a `schedules` edge from job → file.
2. Walks SKILL.md files in `~/.claude/skills/` and `~/.aiva/modules/*/skills/`,
   reads the frontmatter `name:`, emits a `skill` node per skill. Skips
   anything under `state/`, `backups/`, `.system/`, `rejected/`.
3. Reads `~/Library/Application Support/Claude/claude_desktop_config.json` and
   emits a `mcp_tool` node per configured server (server-level granularity).

Privacy
-------
- Never emit absolute paths. Convert paths to node IDs via the path→ID
  mapping below.
- Skip plists or skill files that reference customer/entity data dirs.
- Only emit names, never descriptions or content bodies. Skill descriptions
  can carry business context.

Path → ID rules
---------------
- `$HOME/.aiva/X/Y/Z.py` → `aiva.X.Y.Z`
- `$HOME/mikeshaffer/X/Y/Z.py` → `mikeshaffer.X.Y.Z`
- Hyphens become underscores.
- `__init__.py` becomes the containing module.
- Anything outside those roots → return None (we don't emit edges to nodes
  we don't have).
"""

from __future__ import annotations

import argparse
import json
import os
import plistlib
import re
import sys
from pathlib import Path

HOME = Path.home()
AIVA_ROOT = HOME / ".aiva"
MIKESHAFFER_ROOT = HOME / "mikeshaffer"

SKILL_SKIP_PARTS = {
    "state", "backups", "backup", ".system", "rejected",
    "skills-link-backups", "claude-skills-link-backups",
    "module-suggester",
}


def path_to_node_id(p: str | Path) -> str | None:
    """Map an absolute filesystem path to a known node ID, or None."""
    if not p:
        return None
    path = Path(p).expanduser().resolve()
    try:
        if AIVA_ROOT in path.parents or path == AIVA_ROOT:
            rel = path.relative_to(AIVA_ROOT)
            subsystem = "aiva"
        elif MIKESHAFFER_ROOT in path.parents or path == MIKESHAFFER_ROOT:
            rel = path.relative_to(MIKESHAFFER_ROOT)
            subsystem = "mikeshaffer"
        else:
            return None
    except ValueError:
        return None
    parts = list(rel.parts)
    if not parts:
        return subsystem
    # strip .py
    if parts[-1].endswith(".py"):
        stem = parts[-1][:-3]
        if stem == "__init__":
            parts = parts[:-1]
        else:
            parts[-1] = stem
    parts = [p.replace("-", "_") for p in parts]
    return ".".join([subsystem] + parts)


# ---------------------------------------------------------------------------
# Launchd
# ---------------------------------------------------------------------------

def parse_launchd() -> tuple[list[dict], list[dict]]:
    nodes: list[dict] = []
    edges: list[dict] = []
    plist_dir = HOME / "Library" / "LaunchAgents"
    if not plist_dir.exists():
        return nodes, edges

    for path in sorted(plist_dir.glob("*.plist")):
        name = path.stem
        if name.startswith("_disabled"):
            continue
        try:
            with path.open("rb") as fh:
                data = plistlib.load(fh)
        except Exception:
            continue

        label = data.get("Label") or name
        program_args = data.get("ProgramArguments") or []
        # The script is the first argument that isn't an interpreter.
        # Heuristic: take the first arg that contains $HOME or starts with /
        # and isn't a python/node/sh interpreter binary.
        script_path = None
        for arg in program_args:
            if not isinstance(arg, str):
                continue
            if "/bin/python" in arg or arg.endswith(("python3", "node", "/bin/sh", "/bin/bash", "/bin/zsh")):
                continue
            if arg.startswith("/"):
                script_path = arg
                break

        target_id = path_to_node_id(script_path) if script_path else None

        # Skip jobs whose script lives outside aiva/mikeshaffer (e.g. system
        # jobs from Adobe, Homebrew). They're not part of our system.
        if not target_id:
            continue

        # Sanitize label: must not contain path-like content. Labels in plist
        # are app-IDs like "com.aiva.calendar-cron" which are safe.
        if "/" in label or label.startswith("/"):
            label = name  # fall back to filename stem

        job_id = f"launchd.{label.replace('-', '_').replace('.', '_')}"
        nodes.append({
            "id": job_id,
            "label": label,
            "kind": "launchd_job",
            "parent": "machine.aiva",  # most are on the aiva mac; can refine later
        })
        edges.append({"source": job_id, "target": target_id, "type": "schedules"})

    return nodes, edges


# ---------------------------------------------------------------------------
# SKILL.md
# ---------------------------------------------------------------------------

FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)
NAME_RE = re.compile(r"^name:\s*['\"]?([A-Za-z0-9_\-]+)['\"]?\s*$", re.MULTILINE)


def parse_skill_frontmatter(text: str) -> str | None:
    m = FRONTMATTER_RE.match(text)
    if not m:
        return None
    name_m = NAME_RE.search(m.group(1))
    return name_m.group(1) if name_m else None


def parse_skills() -> tuple[list[dict], list[dict]]:
    nodes: list[dict] = []
    edges: list[dict] = []
    seen_ids: set[str] = set()
    roots = [HOME / ".claude" / "skills", AIVA_ROOT / "modules"]

    for root in roots:
        if not root.exists():
            continue
        for skill_md in root.rglob("SKILL.md"):
            # Skip anything under backup/state/system/rejected paths
            if any(p in SKILL_SKIP_PARTS for p in skill_md.parts):
                continue
            try:
                text = skill_md.read_text(errors="ignore", encoding="utf-8")
            except Exception:
                continue
            name = parse_skill_frontmatter(text) or skill_md.parent.name
            if not name or "/" in name:
                continue

            skill_id = f"skill.{name.replace('-', '_')}"
            if skill_id in seen_ids:
                continue
            seen_ids.add(skill_id)
            nodes.append({
                "id": skill_id,
                "label": name,
                "kind": "skill",
                "parent": "aiva",
            })

            # Try to resolve `implements` edge: if the SKILL.md lives under
            # `~/.aiva/modules/<module>/skills/<skill>/SKILL.md`, the module
            # node ID is `aiva.modules.<module>`.
            try:
                rel = skill_md.relative_to(AIVA_ROOT)
                rparts = rel.parts
                if len(rparts) >= 2 and rparts[0] == "modules":
                    mod_id = f"aiva.modules.{rparts[1].replace('-', '_')}"
                    edges.append({"source": skill_id, "target": mod_id, "type": "implements"})
            except ValueError:
                pass

    return nodes, edges


# ---------------------------------------------------------------------------
# MCP config
# ---------------------------------------------------------------------------

def parse_mcp() -> tuple[list[dict], list[dict]]:
    nodes: list[dict] = []
    edges: list[dict] = []
    cfg_path = HOME / "Library" / "Application Support" / "Claude" / "claude_desktop_config.json"
    if not cfg_path.exists():
        return nodes, edges
    try:
        cfg = json.loads(cfg_path.read_text())
    except Exception:
        return nodes, edges

    servers = cfg.get("mcpServers", {})
    for server_name, _ in servers.items():
        if not isinstance(server_name, str):
            continue
        # Skip anything that looks path-like or contains personal info
        if "/" in server_name or "@" in server_name:
            continue
        sid = f"mcp.{server_name.replace('-', '_')}"
        nodes.append({
            "id": sid,
            "label": server_name,
            "kind": "mcp_tool",
            "parent": "aiva",
        })

    return nodes, edges


# ---------------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", choices=["launchd", "skills", "mcp"], default=None)
    args = ap.parse_args()

    nodes: list[dict] = []
    edges: list[dict] = []

    if args.only in (None, "launchd"):
        n, e = parse_launchd()
        nodes.extend(n); edges.extend(e)
    if args.only in (None, "skills"):
        n, e = parse_skills()
        nodes.extend(n); edges.extend(e)
    if args.only in (None, "mcp"):
        n, e = parse_mcp()
        nodes.extend(n); edges.extend(e)

    json.dump({"nodes": nodes, "edges": edges}, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
