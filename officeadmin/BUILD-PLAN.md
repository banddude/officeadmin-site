# OfficeAdmin Explorer — Build Plan (v2: Code-Level Graph)

Read this whole document before editing. Update it every time the plan changes, every time a test reveals something important, and every time the implementation direction shifts. Do not leave it stale.

## Status

- **Started:** 2026-05-12
- **Current phase:** 3 (Launchd + SKILL.md + MCP) — next
- **Last update:** 2026-05-12 — Phase 2 complete. Python parser at `scripts/parse-python.py` walks AIVA (2767 nodes) and mikeshaffer (93 nodes) using native `ast`. Generator wires the helper in via spawnSync. End-to-end run produces 2865 nodes / 2490 edges with zero sensitive-content audit hits.

### Phase 1 — done

- ✅ `scripts/generate-system-map.mjs` scaffolding (schema validators, sanitizer with deny patterns, parser stubs, seed nodes, writer)
- ✅ Smoke-tested: writes 7 seed nodes to `officeadmin/data/system-map.v2.json`, sanitization assertion green
- ⚠️ Note: v2 writes to `system-map.v2.json` (separate file) until parity. The live renderer keeps reading `system-map.json`. Final cutover swaps the filename in one line of the generator.
- Decision: use Python's native `ast` module for Python parsing instead of tree-sitter (simpler, more accurate for Python). Keep tree-sitter plan for TS/Swift where it's still the right tool.

## Why v2

The v1 explorer landed as "big boxes with vague lines between them." It's a static architecture poster, not a navigable system map. It also wasn't live (had to manually run the generator + commit), the renderer didn't support real interaction (no zoom, no pan, no focus), and the underlying JSON described concepts, not code.

v2 rebuilds it as an actual code graph: nodes are real things (files, functions, jobs, MCP tools), edges are typed and labeled, the view morphs when you focus a node, and it semantic-zooms from "subsystem poster" out to "wiring diagram" in. Auto-regenerates on every commit.

## Goal

A live, interactive map of Mike's entire system (Python AIVA modules, TypeScript Workers and tooling, Swift iOS apps, launchd jobs, MCP tools, machines) that you can zoom from architecture-poster level all the way down to function-call level. Click anything and the layout morphs to focus that node and its real neighbors. Always reflects current code with no manual maintenance.

## Constraints

1. Static site, no build step at deploy time (generator runs at commit time and produces JSON).
2. Hosted on GitHub Pages, proxied by Cloudflare Worker `officeadmin-router`. No platform change.
3. Public repo, public site → hard allowlist for what gets into the published JSON. No customer/personal data, no internal file paths, no infra hostnames beyond what's already public.
4. Must work on mobile (pinch zoom, drag pan).
5. Generator runs locally (laptop and aiva both), idempotent, fast enough to fit in a git hook.

## Architecture

```
[~/.aiva Python]       ─┐
[~/mikeshaffer Python] ─┤
[TypeScript Workers]   ─┼──→ generate-system-map.mjs ──→ system-map.json ──→ Cytoscape renderer
[Swift iOS apps]       ─┤        (tree-sitter)              (sanitized)        (officeadmin/)
[launchd plists]       ─┤
[SKILL.md files]       ─┤
[MCP registry]         ─┘
```

Trigger: git post-commit hook in each source repo (~/.aiva, ~/mikeshaffer) runs the generator, commits the new JSON to officeadmin-site, pushes. GitHub Pages rebuilds in ~30s, Cloudflare cache flushes in 5min.

## Schema

### Node

```jsonc
{
  "id": "aiva.modules.comms_pipeline.run_pipeline",      // dotted, stable
  "label": "run_pipeline",                                // display
  "kind": "function",                                     // see kinds below
  "parent": "aiva.modules.comms_pipeline",                // hierarchy for semantic zoom
  "subsystem": "aiva",                                    // top-level grouping
  "language": "python",                                   // python | typescript | swift | config
  "tags": ["entrypoint", "scheduled"]                     // optional, for filtering
  // NO: file paths, customer names, hostnames, emails, addresses
}
```

**Kinds:** `subsystem`, `repo`, `module`, `file`, `class`, `function`, `cli`, `skill`, `mcp_tool`, `launchd_job`, `machine`, `endpoint`

### Edge

```jsonc
{
  "source": "aiva.modules.comms_pipeline.run_pipeline",
  "target": "aiva.modules.drafts.create_draft",
  "type": "calls",            // see types below
  "weight": 1                  // optional, e.g. call count
}
```

**Types:** `imports`, `calls`, `schedules`, `triggers`, `reads_from`, `writes_to`, `exposes_tool`, `deploys_to`, `depends_on`, `implements`, `contained_in`

Each edge type gets a distinct color and a legend entry.

## Privacy allowlist

The generator outputs only fields explicitly in the schema above. Anything else gets dropped. Specifically NEVER published:

- Any path containing `/Users/`, `/home/`, or absolute paths of any kind
- Any customer, vendor, or contact name (anything pulled from entities/, contacts, QB)
- Email addresses, phone numbers, addresses
- API keys, tokens, secrets (obviously)
- MCP server URLs other than the already-public ones (officeadmin.io, mcp.officeadmin.io)
- Anything from `~/mikeshaffer/entities/*/` beyond the existence of "an entity layer"
- Anything from QB, Reminders, Calendar payloads

The generator has a sanitization function that runs on every node and edge before serialization. There are unit tests asserting that known-sensitive strings never appear in the output JSON.

## Phases

### Phase 1: Generator scaffolding — DONE

- [x] Stub `scripts/generate-system-map.mjs` with the node/edge schema and writer
- [x] Wire up the sanitization function with deny patterns and assertion
- [x] Seed top-level subsystem + machine nodes
- [x] Leave v1 generator alongside as fallback during transition
- Note: skipped tree-sitter dep for Python (using native `ast` instead). Will add tree-sitter only for TS (Phase 4) and Swift (Phase 5).

### Phase 2: Python parser — DONE (v1)

- [x] `scripts/parse-python.py` walks roots using Python's native `ast`
- [x] Per-subsystem allowlist (tight, e.g. mikeshaffer only descends into `scripts`, `speaker-embed`, `work`, `bin`)
- [x] Hard skip dirs (`entities`, `state`, `backups`, etc.) regardless of where they appear
- [x] Emits `file`, `module`, `class`, `function` nodes with hierarchy via `parent`
- [x] Emits `contained_in` and `imports` edges
- [x] Wired into Node generator via `spawnSync`
- [x] Verified: 2767 + 93 nodes, zero `/Users/`, `/home/`, email, phone, or customer-slug hits in output
- [ ] Deferred to Phase 2.5: `calls` edges (need a second pass to resolve call targets against known node IDs)
- [ ] Deferred to Phase 2.5: relative import resolution (`from . import x`)
- [ ] Deferred: import target normalization so partial imports like `from comms_pipeline import x` resolve against fully-qualified `aiva.modules.comms_pipeline` node IDs

### Phase 3: Launchd + SKILL.md + MCP parsers ← WE ARE HERE

### Phase 3: Launchd + SKILL.md + MCP parsers

- [ ] Parse `~/Library/LaunchAgents/*.plist` → `launchd_job` nodes + `schedules` edges to the script they call
- [ ] Parse all SKILL.md files → `skill` nodes + `implements` edges to module they wrap
- [ ] Parse MCP registry → `mcp_tool` nodes + `exposes_tool` edges from module to tool

### Phase 4: TypeScript parser

- [ ] Identify TS sources (Workers in officeadmin-site, any other TS repos)
- [ ] Tree-sitter TS grammar, mirror the Python parser shape (imports, calls)
- [ ] Cross-language edges where a TS Worker hits a Python-backed MCP endpoint

### Phase 5: Swift parser

- [ ] Identify Swift sources (iOS apps)
- [ ] Tree-sitter Swift grammar, mirror the others
- [ ] Cross-language edges where Swift hits a TS/Python endpoint

### Phase 6: Renderer

- [ ] Swap `js/officeadmin.js` for a Cytoscape.js implementation
- [ ] fcose layout, focus-and-morph on click (re-layout to N-hop neighborhood)
- [ ] Semantic zoom: collapse to subsystems when zoomed out, expand to functions when zoomed in
- [ ] Edge legend, search box, breadcrumb of current focus
- [ ] Mobile gestures (pinch zoom, drag pan)

### Phase 7: Auto-trigger

- [ ] Post-commit hook in ~/.aiva and ~/mikeshaffer that runs the generator, commits to officeadmin-site, pushes
- [ ] Backup: launchd job every hour as a safety net
- [ ] Log to `~/.aiva/state/officeadmin-map/last-run.log`

### Phase 8: Private detailed view (later)

- [ ] Optional. Second renderer at `private.officeadmin.io` with full entity/customer data, behind Cloudflare Access
- [ ] Same renderer code, different data source (no sanitization)

## Testing

- Unit tests on the sanitization function (assert that fixture strings like "Susanna Wolff", `/Users/mikeshaffer`, etc. never make it through)
- Integration test: run generator end-to-end on the actual repos, grep the output for any sensitive-looking pattern, fail if found
- Visual regression: snapshot the rendered graph for a known input, fail if it changes unexpectedly
- Local serve via `python3 -m http.server` from the repo root before pushing

## Open questions

- Hook location: per-repo post-commit, or a single watcher daemon? Leaning per-repo because it's explicit and fast.
- How fine-grained should function-call edges go? Every call clutters the graph; only edges between modules might be the right default with deeper edges available on focus.
- Compound nodes vs separate hierarchy field? Cytoscape supports both. Starting with separate `parent` field for flexibility.
