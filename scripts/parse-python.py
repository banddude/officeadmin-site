#!/usr/bin/env python3
"""
parse-python.py — Python source parser for the OfficeAdmin v2 graph.

Walks a source root using Python's native `ast` module and emits a JSON
{"nodes": [...], "edges": [...]} document on stdout matching the schema
in officeadmin/BUILD-PLAN.md.

Usage:
    parse-python.py <root> <subsystem> [--allowlist dir1,dir2,...]

The Node generator (`scripts/generate-system-map.mjs`) calls this once per
source root. Stays a separate script so language ownership is clean — Python
parsing lives in Python, JS/TS parsing will live in JS.

Privacy: emits only file/dir basenames as labels, dotted module paths as IDs.
Never absolute paths, never file contents. The Node generator runs its own
sanitization assertion on top of whatever we emit here.
"""

from __future__ import annotations

import argparse
import ast
import json
import sys
from pathlib import Path

# Directories we never descend into, regardless of where they appear.
# These are either runtime data, generated artifacts, vendored code, or
# customer/business data that has no business showing up in a public graph.
HARD_SKIP_DIRS = {
    "__pycache__", ".git", ".venv", "venv", "env", ".env",
    "node_modules", ".pytest_cache", ".mypy_cache", ".tox", ".ruff_cache",
    "dist", "build", "site-packages", ".eggs", "egg-info",
    "logs", "cache", ".cache", ".claude", ".aider",
    # AIVA / mikeshaffer specific data dirs
    "state", "snapshots", "backups", "archive", "archives", "handoffs",
    "entities",      # customer data in mikeshaffer
    "contacts",      # contact data
    "issues",        # personal issue tracking
    "drafts",        # actual customer-facing drafts
    "data",          # generic data buckets
    "tmp", "temp", ".tmp",
}

# Files whose names alone could leak business context — skip by extension/name.
SKIP_FILE_PATTERNS = (
    ".bak", ".backup", ".old", ".orig",
)


def to_id(parts: tuple[str, ...], subsystem: str, drop_init: bool = False) -> str:
    """Turn ('modules', 'comms_pipeline', 'pipeline.py') into 'aiva.modules.comms_pipeline.pipeline'."""
    clean: list[str] = []
    for p in parts:
        stem = p[:-3] if p.endswith(".py") else p
        if drop_init and stem == "__init__":
            continue
        # Hyphens become underscores in the ID to keep it a valid dotted path.
        stem = stem.replace("-", "_")
        clean.append(stem)
    return ".".join([subsystem] + clean)


def parent_id(parts: tuple[str, ...], subsystem: str) -> str:
    if not parts:
        return subsystem
    return to_id(parts, subsystem, drop_init=True)


def safe_label(name: str) -> str:
    """File/dir basenames are safe as-is — they're code/module names, not data."""
    return name


def parse_file(file_path: Path, root: Path, subsystem: str) -> tuple[list[dict], list[dict]]:
    nodes: list[dict] = []
    edges: list[dict] = []
    rel = file_path.relative_to(root)
    parts = rel.parts

    file_node_id = to_id(parts, subsystem)
    parent = parent_id(parts[:-1], subsystem) if len(parts) > 1 else subsystem
    nodes.append({
        "id": file_node_id,
        "label": safe_label(rel.name),
        "kind": "file",
        "parent": parent,
        "subsystem": subsystem,
        "language": "python",
    })

    try:
        source = file_path.read_text(errors="ignore")
        tree = ast.parse(source, filename=str(rel))
    except (SyntaxError, ValueError):
        return nodes, edges

    for node in ast.iter_child_nodes(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            fn_id = f"{file_node_id}.{node.name}"
            nodes.append({
                "id": fn_id,
                "label": node.name,
                "kind": "function",
                "parent": file_node_id,
                "subsystem": subsystem,
                "language": "python",
            })
            edges.append({"source": fn_id, "target": file_node_id, "type": "contained_in"})
        elif isinstance(node, ast.ClassDef):
            cls_id = f"{file_node_id}.{node.name}"
            nodes.append({
                "id": cls_id,
                "label": node.name,
                "kind": "class",
                "parent": file_node_id,
                "subsystem": subsystem,
                "language": "python",
            })
            edges.append({"source": cls_id, "target": file_node_id, "type": "contained_in"})
        elif isinstance(node, ast.Import):
            for alias in node.names:
                target = alias.name.replace("-", "_")
                edges.append({"source": file_node_id, "target": target, "type": "imports"})
        elif isinstance(node, ast.ImportFrom):
            # node.module may be None for relative imports like `from . import x`
            # We skip those for now; resolving relative imports needs package context.
            if node.module:
                target = node.module.replace("-", "_")
                edges.append({"source": file_node_id, "target": target, "type": "imports"})

    return nodes, edges


def emit_intermediate_modules(parts: tuple[str, ...], subsystem: str, seen: set[str]) -> list[dict]:
    """Ensure module nodes exist for every intermediate directory in parts (excluding the file itself)."""
    out: list[dict] = []
    for i in range(len(parts) - 1):
        sub_parts = parts[: i + 1]
        mod_id = to_id(sub_parts, subsystem, drop_init=True)
        if mod_id in seen or mod_id == subsystem:
            continue
        seen.add(mod_id)
        parent = parent_id(sub_parts[:-1], subsystem)
        out.append({
            "id": mod_id,
            "label": safe_label(sub_parts[-1]),
            "kind": "module",
            "parent": parent,
            "subsystem": subsystem,
            "language": "python",
        })
    return out


def should_skip_dir(name: str) -> bool:
    if name in HARD_SKIP_DIRS:
        return True
    if name.startswith("."):
        return True
    return False


def should_skip_file(name: str) -> bool:
    if not name.endswith(".py"):
        return True
    for pat in SKIP_FILE_PATTERNS:
        if pat in name:
            return True
    if name.startswith("."):
        return True
    return False


def walk(root: Path, subsystem: str, allowlist: list[str] | None) -> tuple[list[dict], list[dict]]:
    nodes: list[dict] = []
    edges: list[dict] = []
    seen_modules: set[str] = set()

    if not root.exists():
        print(f"WARN: root does not exist: {root}", file=sys.stderr)
        return nodes, edges

    # If an allowlist is provided, only descend into those top-level subdirs.
    # Otherwise, walk everything (respecting HARD_SKIP_DIRS).
    if allowlist:
        roots_to_walk = [root / d for d in allowlist if (root / d).is_dir()]
    else:
        roots_to_walk = [root]

    for start in roots_to_walk:
        for path in start.rglob("*.py"):
            # Path must not pass through any skip dir.
            try:
                rel_to_root = path.relative_to(root)
            except ValueError:
                continue
            if any(should_skip_dir(p) for p in rel_to_root.parts[:-1]):
                continue
            if should_skip_file(path.name):
                continue

            # Emit intermediate module nodes
            nodes.extend(emit_intermediate_modules(rel_to_root.parts, subsystem, seen_modules))

            fnodes, fedges = parse_file(path, root, subsystem)
            nodes.extend(fnodes)
            edges.extend(fedges)

    return nodes, edges


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("root", help="Source root directory")
    ap.add_argument("subsystem", help="Subsystem name (e.g. 'aiva', 'mikeshaffer')")
    ap.add_argument(
        "--allowlist",
        default="",
        help="Comma-separated list of top-level subdirectories to walk. Empty = walk all (respecting hard skips).",
    )
    args = ap.parse_args()

    allowlist = [d.strip() for d in args.allowlist.split(",") if d.strip()] or None
    nodes, edges = walk(Path(args.root).expanduser().resolve(), args.subsystem, allowlist)
    json.dump({"nodes": nodes, "edges": edges}, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
