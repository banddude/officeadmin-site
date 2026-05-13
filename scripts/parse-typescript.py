#!/usr/bin/python3
"""
parse-typescript.py — TypeScript source parser for the OfficeAdmin v2 graph.

Uses tree-sitter with tree-sitter-typescript to walk TypeScript source files
and emit JSON {"nodes": [...], "edges": [...]} on stdout matching the schema
in officeadmin/BUILD-PLAN.md.

Usage:
    parse-typescript.py <root> <subsystem> [--allowlist dir1,dir2,...]

The Node generator (`scripts/generate-system-map.mjs`) calls this via spawnSync.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import tree_sitter_typescript as tstypescript
from tree_sitter import Language

TS_LANGUAGE = Language(tstypescript.language_typescript())

HARD_SKIP_DIRS = {
    "__pycache__", ".git", ".venv", "venv", "env", ".env",
    "node_modules", ".pytest_cache", ".mypy_cache", ".tox", ".ruff_cache",
    "dist", "build", "site-packages", ".eggs", "egg-info",
    "logs", "cache", ".cache", ".claude", ".aider", ".turbo",
    "state", "snapshots", "backups", "archive", "archives",
    "data", "tmp", "temp", ".tmp",
}

SKIP_FILE_PATTERNS = (".bak", ".backup", ".old", ".orig", ".d.ts")


def to_id(parts: tuple[str, ...], subsystem: str) -> str:
    clean = []
    for p in parts:
        stem = p.replace(".ts", "").replace(".tsx", "")
        stem = stem.replace("-", "_")
        clean.append(stem)
    return ".".join([subsystem] + clean)


def parent_id(parts: tuple[str, ...], subsystem: str) -> str:
    if not parts:
        return subsystem
    return to_id(parts, subsystem)


def should_skip_dir(name: str) -> bool:
    return name in HARD_SKIP_DIRS or name.startswith(".")


def should_skip_file(name: str) -> bool:
    if not (name.endswith(".ts") or name.endswith(".tsx")):
        return True
    for pat in SKIP_FILE_PATTERNS:
        if pat in name:
            return True
    if name.startswith("."):
        return True
    return False


def parse_ts_file(file_path: Path, root: Path, subsystem: str) -> tuple[list[dict], list[dict]]:
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
        "language": "typescript",
    })

    try:
        source = file_path.read_bytes()
    except OSError:
        return nodes, edges

    from tree_sitter import Parser, Node
    parser = Parser(TS_LANGUAGE)
    tree = parser.parse(source)
    if not tree or not tree.root_node:
        return nodes, edges

    def visit(node: Node, current_scope: str):
        if node.type == "function_declaration":
            name_node = node.child_by_field_name("name")
            if name_node:
                fn_name = source[name_node.start_byte:name_node.end_byte].decode("utf-8", errors="ignore")
                fn_id = f"{file_node_id}.{fn_name}"
                nodes.append({
                    "id": fn_id,
                    "label": fn_name,
                    "kind": "function",
                    "parent": file_node_id,
                    "subsystem": subsystem,
                    "language": "typescript",
                })
                edges.append({"source": fn_id, "target": file_node_id, "type": "contained_in"})

        elif node.type == "class_declaration":
            name_node = node.child_by_field_name("name")
            if name_node:
                cls_name = source[name_node.start_byte:name_node.end_byte].decode("utf-8", errors="ignore")
                cls_id = f"{file_node_id}.{cls_name}"
                nodes.append({
                    "id": cls_id,
                    "label": cls_name,
                    "kind": "class",
                    "parent": file_node_id,
                    "subsystem": subsystem,
                    "language": "typescript",
                })
                edges.append({"source": cls_id, "target": file_node_id, "type": "contained_in"})

        elif node.type == "method_definition":
            # methods inside classes — grab name from the property_identifier child
            for child in node.children:
                if child.type == "property_identifier":
                    method_name = source[child.start_byte:child.end_byte].decode("utf-8", errors="ignore")
                    method_id = f"{file_node_id}.{method_name}"
                    nodes.append({
                        "id": method_id,
                        "label": method_name,
                        "kind": "function",
                        "parent": file_node_id,
                        "subsystem": subsystem,
                        "language": "typescript",
                    })
                    edges.append({"source": method_id, "target": file_node_id, "type": "contained_in"})
                    break

        elif node.type == "import_declaration":
            # import { X } from './foo' or import { X } from 'some-module'
            source_node = node.child_by_field_name("source")
            if source_node:
                import_path = source[source_node.start_byte:source_node.end_byte].decode("utf-8", errors="ignore")
                import_path = import_path.strip("'\"")
                if import_path and not import_path.startswith("."):
                    # External import — skip (node_modules, stdlib)
                    pass
                elif import_path.startswith("."):
                    # Relative import — resolve to a canonical ID
                    resolved = resolve_relative_import(import_path, rel, root, subsystem)
                    if resolved:
                        edges.append({"source": file_node_id, "target": resolved, "type": "imports"})

        # Recurse into children
        for child in node.children:
            visit(child, current_scope)

    visit(tree.root_node, file_node_id)
    return nodes, edges


def resolve_relative_import(import_path: str, file_rel: Path, root: Path, subsystem: str) -> str | None:
    """Resolve a relative TS import like './foo' or '../bar' to a canonical node ID."""
    file_dir = file_rel.parent
    parts = Path(import_path)

    # Remove .ts/.tsx extension if present
    name = parts.name
    if name.endswith(".ts") or name.endswith(".tsx"):
        name = name.rsplit(".", 1)[0]

    # Walk the relative path
    resolved_parts = list(file_dir.parts)
    for p in parts.parent.parts:
        if p == "..":
            if resolved_parts:
                resolved_parts.pop()
        elif p and p != ".":
            resolved_parts.append(p)
    resolved_parts.append(name)

    # Convert to ID
    clean = []
    for p in resolved_parts:
        stem = p.replace("-", "_")
        clean.append(stem)
    return ".".join([subsystem] + clean)


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
            "language": "typescript",
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
        for ext in ("*.ts", "*.tsx"):
            for path in start.rglob(ext):
                try:
                    rel_to_root = path.relative_to(root)
                except ValueError:
                    continue
                if any(should_skip_dir(p) for p in rel_to_root.parts[:-1]):
                    continue
                if should_skip_file(path.name):
                    continue

                nodes.extend(emit_intermediate_modules(rel_to_root.parts, subsystem, seen_modules))
                fnodes, fedges = parse_ts_file(path, root, subsystem)
                nodes.extend(fnodes)
                edges.extend(fedges)

    return finalize(nodes, edges, subsystem)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("root", help="Source root directory")
    ap.add_argument("subsystem", help="Subsystem name (e.g. 'aiva')")
    ap.add_argument("--allowlist", default="", help="Comma-separated top-level dirs to walk")
    args = ap.parse_args()

    allowlist = [d.strip() for d in args.allowlist.split(",") if d.strip()] or None
    nodes, edges = walk(Path(args.root).expanduser().resolve(), args.subsystem, allowlist)
    json.dump({"nodes": nodes, "edges": edges}, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
