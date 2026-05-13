#!/usr/bin/python3
"""
parse-swift.py — Swift source parser for the OfficeAdmin v2 graph.

Uses regex-based parsing (not tree-sitter) to walk Swift source files
and emit JSON {"nodes": [...], "edges": [...]} on stdout matching the
schema in officeadmin/BUILD-PLAN.md.

tree-sitter-swift has a version compatibility issue with the system
tree-sitter, so we use regex matching for func/class/struct/enum/protocol
declarations and import statements. This is less precise than an AST walk
but sufficient for the graph's purposes.

Usage:
    parse-swift.py <root> <subsystem> [--allowlist dir1,dir2,...]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

HARD_SKIP_DIRS = {
    "__pycache__", ".git", ".venv", "venv", "env", ".env",
    "node_modules", ".pytest_cache", ".cache", ".claude", ".aider",
    "dist", "build", "DerivedData", ".build", ".swiftpm",
    "Pods", ".turbo",
    "state", "snapshots", "backups", "archive", "archives",
    "data", "tmp", "temp", ".tmp",
}

# Also skip any directory whose name ends with these suffixes.
HARD_SKIP_SUFFIXES = (".xcodeproj", ".xcworkspace", ".playground")

SKIP_FILE_PATTERNS = (".bak", ".backup", ".old", ".orig")

# Regex patterns for Swift declarations. These are intentionally loose
# to catch most cases without being so loose they match strings/comments.
RE_FUNC = re.compile(
    r"^\s*(?:public\s+|private\s+|internal\s+|open\s+|static\s+|override\s+|@\w+\s+)*"
    r"func\s+(\w+)",
    re.MULTILINE,
)
RE_CLASS = re.compile(
    r"^\s*(?:public\s+|private\s+|internal\s+|open\s+|final\s+|@\w+\s+)*"
    r"(?:class|struct|enum|protocol|actor)\s+(\w+)",
    re.MULTILINE,
)
RE_IMPORT = re.compile(r"^\s*import\s+(\w+)", re.MULTILINE)

# Comment stripping: remove // and /* */ blocks so we don't match decls in comments.
RE_LINE_COMMENT = re.compile(r"//[^\n]*")
RE_BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.DOTALL)
RE_STRING_LITERAL = re.compile(r'"(?:[^"\\\\]|\\\\.)*"')


def strip_comments(source: str) -> str:
    source = RE_BLOCK_COMMENT.sub("", source)
    source = RE_LINE_COMMENT.sub("", source)
    return source


def to_id(parts: tuple[str, ...], subsystem: str) -> str:
    clean = []
    for p in parts:
        stem = p.replace(".swift", "")
        stem = stem.replace("-", "_")
        clean.append(stem)
    return ".".join([subsystem] + clean)


def parent_id(parts: tuple[str, ...], subsystem: str) -> str:
    if not parts:
        return subsystem
    return to_id(parts, subsystem)


def should_skip_dir(name: str) -> bool:
    if name in HARD_SKIP_DIRS or name.startswith("."):
        return True
    for sfx in HARD_SKIP_SUFFIXES:
        if name.endswith(sfx):
            return True
    return False


def should_skip_file(name: str) -> bool:
    if not name.endswith(".swift"):
        return True
    for pat in SKIP_FILE_PATTERNS:
        if pat in name:
            return True
    if name.startswith("."):
        return True
    return False


def parse_swift_file(file_path: Path, root: Path, subsystem: str) -> tuple[list[dict], list[dict]]:
    nodes = []
    edges = []
    rel = file_path.relative_to(root)
    parts = rel.parts

    file_node_id = to_id(parts, subsystem)
    parent = parent_id(parts[:-1], subsystem) if len(parts) > 1 else subsystem
    nodes.append({
        "id": file_node_id,
        "label": rel.name,
        "kind": "file",
        "parent": parent,
        "subsystem": subsystem,
        "language": "swift",
    })

    try:
        source = file_path.read_text(errors="ignore")
    except OSError:
        return nodes, edges

    cleaned = strip_comments(source)

    # Functions
    for m in RE_FUNC.finditer(cleaned):
        fn_name = m.group(1)
        # Skip test functions and very common names that aren't meaningful
        if fn_name.startswith("test") and "test" in str(rel).lower():
            continue
        fn_id = f"{file_node_id}.{fn_name}"
        nodes.append({
            "id": fn_id,
            "label": fn_name,
            "kind": "function",
            "parent": file_node_id,
            "subsystem": subsystem,
            "language": "swift",
        })
        edges.append({"source": fn_id, "target": file_node_id, "type": "contained_in"})

    # Classes, structs, enums, protocols, actors
    for m in RE_CLASS.finditer(cleaned):
        cls_name = m.group(1)
        cls_id = f"{file_node_id}.{cls_name}"
        # Determine kind based on keyword
        line = cleaned[m.start():m.start() + 200]
        if "struct " in line[:line.index(cls_name) + len(cls_name)]:
            kind = "class"  # treat structs as classes in the graph
        else:
            kind = "class"
        nodes.append({
            "id": cls_id,
            "label": cls_name,
            "kind": kind,
            "parent": file_node_id,
            "subsystem": subsystem,
            "language": "swift",
        })
        edges.append({"source": cls_id, "target": file_node_id, "type": "contained_in"})

    # Imports (Swift imports are module-level, e.g. `import Foundation`)
    for m in RE_IMPORT.finditer(cleaned):
        module = m.group(1)
        # Most Swift imports are stdlib (Foundation, SwiftUI, etc). Skip external.
        # We only keep imports that might resolve to internal modules.
        edges.append({"source": file_node_id, "target": module, "type": "imports"})

    return nodes, edges


def emit_intermediate_modules(parts: tuple[str, ...], subsystem: str, seen: set[str]) -> list[dict]:
    out = []
    for i in range(len(parts) - 1):
        sub_parts = parts[: i + 1]
        mod_id = to_id(sub_parts, subsystem)
        if mod_id in seen or mod_id == subsystem:
            continue
        seen.add(mod_id)
        parent = parent_id(sub_parts[:-1], subsystem)
        out.append({
            "id": mod_id,
            "label": sub_parts[-1],
            "kind": "module",
            "parent": parent,
            "subsystem": subsystem,
            "language": "swift",
        })
    return out


def resolve_import_target(raw_target: str, source_id: str, internal_ids: set[str], subsystem: str) -> str | None:
    if raw_target in internal_ids:
        return raw_target
    parts = source_id.split(".")
    for i in range(len(parts) - 1, 0, -1):
        candidate = ".".join(parts[:i] + [raw_target])
        if candidate in internal_ids:
            return candidate
    candidate = f"{subsystem}.{raw_target}"
    if candidate in internal_ids:
        return candidate
    return None


def finalize(nodes: list[dict], edges: list[dict], subsystem: str) -> tuple[list[dict], list[dict]]:
    internal_ids = {n["id"] for n in nodes}
    internal_ids.add(subsystem)

    existing = {(e["source"], e["target"], e["type"]) for e in edges}
    for n in nodes:
        parent = n.get("parent")
        if not parent:
            continue
        key = (n["id"], parent, "contained_in")
        if key not in existing:
            edges.append({"source": n["id"], "target": parent, "type": "contained_in"})
            existing.add(key)

    resolved_edges = []
    dropped = 0
    for e in edges:
        if e["type"] != "imports":
            resolved_edges.append(e)
            continue
        target = resolve_import_target(e["target"], e["source"], internal_ids, subsystem)
        if target is None:
            dropped += 1
            continue
        if target == e["source"]:
            dropped += 1
            continue
        resolved_edges.append({**e, "target": target})

    seen = set()
    deduped = []
    for e in resolved_edges:
        key = (e["source"], e["target"], e["type"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(e)

    print(f"finalize({subsystem}): dropped {dropped} external imports, {len(deduped)} edges after dedupe", file=sys.stderr)
    return nodes, deduped


def walk(root: Path, subsystem: str, allowlist: list[str] | None) -> tuple[list[dict], list[dict]]:
    nodes = []
    edges = []
    seen_modules = set()

    if not root.exists():
        print(f"WARN: root does not exist: {root}", file=sys.stderr)
        return nodes, edges

    if allowlist:
        roots_to_walk = [root / d for d in allowlist if (root / d).is_dir()]
    else:
        roots_to_walk = [root]

    for start in roots_to_walk:
        # Manual walk to avoid rglob entering xcodeproj/xcworkspace bundles.
        stack = [start]
        while stack:
            current = stack.pop()
            try:
                entries = sorted(current.iterdir(), key=lambda p: (p.is_file(), p.name))
            except PermissionError:
                continue
            for entry in entries:
                if entry.is_dir():
                    if should_skip_dir(entry.name):
                        continue
                    stack.append(entry)
                elif entry.is_file() and entry.name.endswith(".swift") and not should_skip_file(entry.name):
                    try:
                        rel_to_root = entry.relative_to(root)
                    except ValueError:
                        continue

                    nodes.extend(emit_intermediate_modules(rel_to_root.parts, subsystem, seen_modules))
                    fnodes, fedges = parse_swift_file(entry, root, subsystem)
                    nodes.extend(fnodes)
                    edges.extend(fedges)

    return finalize(nodes, edges, subsystem)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("root", help="Source root directory")
    ap.add_argument("subsystem", help="Subsystem name (e.g. 'ios-apps')")
    ap.add_argument("--allowlist", default="", help="Comma-separated top-level dirs to walk")
    args = ap.parse_args()

    allowlist = [d.strip() for d in args.allowlist.split(",") if d.strip()] or None
    nodes, edges = walk(Path(args.root).expanduser().resolve(), args.subsystem, allowlist)
    json.dump({"nodes": nodes, "edges": edges}, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
