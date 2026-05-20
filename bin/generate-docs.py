#!/usr/bin/env python3
"""
Generate modules-docs.json from ~/.aiva/modules/*/

Reads each module's:
  - module.json   (kind, machine, public_surface, host_requirements, notes)
  - MODULE.md     (title, date, purpose paragraph, full markdown)
  - SKILL.md      (skill description if present)
  - bin/ folder   (list of CLI scripts)

Outputs a single JSON consumed by both:
  - script.js       (system graph catalog, sub-set)
  - docs.html       (auto-populated docs page)

Run from the site dir:  python3 bin/generate-docs.py
"""
from __future__ import annotations
import json, os, re, sys
from pathlib import Path
from datetime import datetime

MODULES_DIR = Path.home() / ".aiva" / "modules"
OUT_PATH    = Path(__file__).resolve().parent.parent / "modules-docs.json"

H1_RE      = re.compile(r"^#\s+(.+?)\s*$", re.M)
DATE_RE    = re.compile(r"^Date:\s*(\d{4}-\d{2}-\d{2})", re.M)
PURPOSE_RE = re.compile(r"^##\s+Purpose\s*\n+(.+?)(?=\n##|\Z)", re.M | re.S)

# Map each module slug to a product-facing category that the website renders
# as a cluster. Anything not listed defaults to "util". Categories define the
# visual grouping in the system graph + drive the website's auto stats.
PRODUCT_CATEGORY = {
    # INBOUND CHANNELS
    "email-labeler": "inbound", "imessage": "inbound", "whatsapp": "inbound",
    "instagram": "inbound", "google": "inbound", "messages": "inbound",
    "conversations": "inbound",
    # MEMORY & KNOWLEDGE
    "know": "memory", "mempalace": "memory", "identity": "memory",
    "memory": "memory", "contacts": "memory", "session-search": "memory",
    "commitments": "memory", "open-loops": "memory",
    "dependency-tracker": "memory",
    # WORKFLOW
    "comms-pipeline": "workflow", "comms-expert": "workflow",
    "schedule-send": "workflow",
    # BUSINESS OPS
    "quickbooks": "business", "electrical-estimating": "business",
    "mikeshaffer": "business", "akaunting": "business",
    # MACOS BRIDGE
    "aiva": "macos", "calendar": "macos", "reminders": "macos",
    "notes": "macos", "callhistory": "macos", "apple-maps": "macos",
    "macos-file-tags": "macos", "osascript-shim": "macos",
    # AI ENGINES
    "claude": "ai", "codex": "ai", "gemini": "ai", "glm": "ai",
    # OUTPUT
    "sendblue": "output", "notify": "output", "talk": "output",
    # INFRA
    "sync": "infra", "system-inventory": "infra", "system-fixes": "infra",
    "launchd": "infra", "agents": "infra", "jobs": "infra", "docs": "infra",
    "start-here": "infra", "module-suggester": "infra",
    # UTILITIES
    "ios": "util", "frontend-design": "util", "skill-creator": "util",
    "mcporter": "util", "copyparty": "util", "transcribe": "util",
    "agent-browser": "util", "cloudflare": "util", "n8n": "util",
    "g2c": "util", "aiva-user-chat-session": "util",
    # PERSONAL / off-product
    "alpaca": "personal", "pidog": "personal", "shaffer-blogger": "personal",
    "skatefit-github": "personal", "habits": "personal", "family": "personal",
    "grandma-mac": "personal",
}

# Short display labels for modules whose canonical name overflows a 110px
# node box in the system graph. Only set entries where needed.
SHORT_LABEL = {
    "electrical-estimating": "estimating",
    "session-search": "sessions",
    "dependency-tracker": "dep-tracker",
    "macos-file-tags": "file-tags",
    "system-inventory": "sys-inventory",
    "system-fixes": "sys-fixes",
    "module-suggester": "mod-suggester",
    "frontend-design": "fe-design",
    "aiva-user-chat-session": "chat-session",
}

# The "star" hub modules — rendered larger on the graph.
STAR_MODULES = {"comms-pipeline", "know", "quickbooks"}

# The set of curated "featured" modules for the marketing
# "Real modules, doing real jobs" card grid, in display order. Anything not
# listed shows up only inside the system graph + docs page.
FEATURED_ORDER = [
    "comms-pipeline", "know", "mempalace", "commitments",
    "quickbooks", "electrical-estimating", "conversations",
    "identity", "schedule-send", "comms-expert",
]

# Explicit relationships (from → to). Auto-extraction below adds more by
# scanning MODULE.md for module-slug mentions, but these baseline edges
# capture call-chains that prose doesn't always make obvious.
EXPLICIT_EDGES = [
    # inbound → pipeline
    ("email-labeler", "comms-pipeline"), ("imessage", "comms-pipeline"),
    ("whatsapp", "comms-pipeline"), ("instagram", "comms-pipeline"),
    ("google", "comms-pipeline"), ("messages", "comms-pipeline"),
    ("conversations", "comms-pipeline"),
    # pipeline outbound
    ("comms-pipeline", "identity"), ("comms-pipeline", "know"),
    ("comms-pipeline", "comms-expert"), ("comms-pipeline", "commitments"),
    ("comms-pipeline", "schedule-send"), ("comms-pipeline", "sendblue"),
    ("comms-pipeline", "notify"), ("comms-pipeline", "talk"),
    # know fan-out
    ("know", "identity"), ("know", "mempalace"), ("know", "contacts"),
    ("know", "conversations"), ("know", "session-search"),
    ("know", "commitments"), ("know", "callhistory"),
    # memory feeders
    ("conversations", "mempalace"), ("contacts", "identity"),
    ("dependency-tracker", "commitments"), ("open-loops", "commitments"),
    # business links
    ("quickbooks", "know"), ("quickbooks", "mikeshaffer"),
    ("mikeshaffer", "akaunting"), ("electrical-estimating", "comms-expert"),
    # AI engines → drafters
    ("claude", "comms-expert"), ("claude", "comms-pipeline"),
    ("codex", "comms-expert"), ("gemini", "comms-expert"),
    ("glm", "comms-expert"),
    # macos bridge
    ("aiva", "contacts"), ("aiva", "calendar"), ("aiva", "reminders"),
    ("aiva", "notes"), ("aiva", "callhistory"), ("aiva", "apple-maps"),
    # output chain
    ("schedule-send", "sendblue"), ("schedule-send", "messages"),
    # module-suggester
    ("module-suggester", "session-search"),
]


def first_paragraph(text: str) -> str:
    """First non-empty paragraph of text (markdown-stripped)."""
    text = text.strip()
    for para in re.split(r"\n\s*\n", text):
        p = para.strip()
        if not p:
            continue
        # strip leading bullets and `Date:` lines
        if p.lower().startswith("date:"):
            continue
        if p.startswith(("- ", "* ", "1. ", "1)")):
            continue
        return p
    return ""


def read_module(mod_dir: Path) -> dict | None:
    slug = mod_dir.name
    if not mod_dir.is_dir() or slug.startswith(("_", ".")):
        return None

    out: dict = {"slug": slug, "path": f"~/.aiva/modules/{slug}/"}

    # module.json — primary metadata
    mj = mod_dir / "module.json"
    if mj.exists():
        try:
            data = json.loads(mj.read_text())
        except Exception as e:
            data = {"_parse_error": str(e)}
        for k in ("kind", "machine", "public_surface", "state_dirs",
                  "host_requirements", "notes", "name"):
            if k in data:
                out[k] = data[k]

    # MODULE.md — human prose
    md = mod_dir / "MODULE.md"
    if md.exists():
        text = md.read_text()
        m = H1_RE.search(text)
        if m:
            out["title"] = m.group(1).strip()
        d = DATE_RE.search(text)
        if d:
            out["module_md_date"] = d.group(1)
        # purpose section first paragraph (preferred), or body first paragraph
        p = PURPOSE_RE.search(text)
        if p:
            out["purpose"] = first_paragraph(p.group(1))
        elif "purpose" not in out:
            # use first non-heading paragraph after title
            body = H1_RE.sub("", text, count=1).strip()
            out["purpose"] = first_paragraph(body)
        out["module_md"] = text

    # SKILL.md description (one line under YAML front matter)
    sk = mod_dir / "SKILL.md"
    if sk.exists():
        skill_text = sk.read_text()
        # YAML front matter has description: ...
        sd = re.search(r"^description:\s*(.+?)$", skill_text, re.M)
        if sd:
            out["skill_description"] = sd.group(1).strip().strip('"\'')

    # bin/ — list any executable shell entries
    bin_dir = mod_dir / "bin"
    if bin_dir.is_dir():
        bins = []
        for entry in sorted(bin_dir.iterdir()):
            if entry.is_file() and not entry.name.startswith("."):
                bins.append(entry.name)
        if bins:
            out["bin"] = bins

    # product_category & short_label & star: from the maps above, or from
    # module.json overrides if present.
    out["product_category"] = out.get("product_category") or PRODUCT_CATEGORY.get(slug, "util")
    if slug in SHORT_LABEL:
        out["short_label"] = SHORT_LABEL[slug]
    if slug in STAR_MODULES:
        out["star"] = True
    if slug in FEATURED_ORDER:
        out["featured_order"] = FEATURED_ORDER.index(slug)

    return out


def derive_edges(modules: list) -> list:
    """Combine explicit edges with grep-derived ones (MODULE.md mentions)."""
    slugs = {m["slug"] for m in modules}
    edges = set()
    # explicit
    for a, b in EXPLICIT_EDGES:
        if a in slugs and b in slugs:
            edges.add((a, b))
    # heuristic: if module A's MODULE.md mentions another slug in a code-tag
    # context (`other-slug`), treat it as A → other-slug (without duplicating
    # explicit ones).
    for m in modules:
        text = m.get("module_md", "")
        if not text:
            continue
        for other in slugs:
            if other == m["slug"]:
                continue
            # match `slug` or "slug" — the backtick form is the strongest
            # signal that this is a code reference, not just prose
            if f"`{other}`" in text or f"`{other} " in text:
                edges.add((m["slug"], other))
    return sorted(edges)


def main() -> int:
    if not MODULES_DIR.is_dir():
        print(f"error: {MODULES_DIR} not found", file=sys.stderr)
        return 2

    modules = []
    for child in sorted(MODULES_DIR.iterdir()):
        m = read_module(child)
        if m:
            modules.append(m)

    edges = derive_edges(modules)

    # roll up product-category counts for the website's "stats" strip
    cat_counts = {}
    for m in modules:
        c = m.get("product_category", "util")
        cat_counts[c] = cat_counts.get(c, 0) + 1

    out = {
        "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "source": str(MODULES_DIR),
        "count": len(modules),
        "modules": modules,
        "edges": [list(e) for e in edges],
        "category_counts": cat_counts,
        "categories": {
            "inbound":  {"label": "Inbound",    "tint": "#d9e7f1", "stroke": "#4d6f95"},
            "memory":   {"label": "Memory",     "tint": "#d9eccf", "stroke": "#5b8a3a"},
            "workflow": {"label": "Workflow",   "tint": "#fdf1bd", "stroke": "#c98b2b"},
            "business": {"label": "Business",   "tint": "#fce5b9", "stroke": "#b3492f"},
            "macos":    {"label": "macOS",      "tint": "#e4dcca", "stroke": "#3a3733"},
            "ai":       {"label": "AI engines", "tint": "#e4d2eb", "stroke": "#7a4f99"},
            "output":   {"label": "Output",     "tint": "#f3d2bf", "stroke": "#c98b2b"},
            "infra":    {"label": "Infra",      "tint": "#e0d8c6", "stroke": "#6a665e"},
            "util":     {"label": "Utilities",  "tint": "#dcd6c3", "stroke": "#7a7568"},
            "personal": {"label": "Personal",   "tint": "#ead7bf", "stroke": "#8a6a1f"},
        },
    }
    OUT_PATH.write_text(json.dumps(out, indent=2, ensure_ascii=False))
    print(f"wrote {OUT_PATH}  ({len(modules)} modules, {len(edges)} edges)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
