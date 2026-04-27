# OfficeAdmin Explorer Build Plan

Read this whole document every time before editing. Update it every time the plan changes, every time a test reveals something important, and every time the implementation direction shifts. Do not leave it stale. Keep the full goal, current approach, active todos, testing notes, and reflection loop here.

## Goal

Replace the current `/officeadmin` inventory page with an actual system explorer that helps Mike understand the system quickly, navigate it visually, and drill down without overload.

The target experience is:

1. One focused thing at a time.
2. Clear visible connections to related things.
3. Easy movement up, down, and sideways through the system.
4. Storytelling and orientation first, raw detail second.
5. Works well on phone and laptop.
6. No horizontal scrolling.
7. No ugly overlapping graph spaghetti.
8. Graph, paths, ownership, and context all visible without dumping walls of text.
9. Generated from real docs, code, repo state, and system snapshot, not hand-edited status prose.

## Constraints

1. Static site repo, no existing build step.
2. Must stay generated and read-only.
3. Must tolerate partial cache mismatch better than before.
4. Must be testable locally and on the deployed site.
5. Must be navigable on mobile.

## Current Understanding

The current page is still fundamentally a report with UI chrome. It shows data, but it does not support mental modeling. The right paradigm is a focused explorer, not a giant architecture diagram and not a wall of cards. The best reference patterns are:

1. Obsidian local graph, focused graph depth and neighbor exploration.
2. Neo4j Bloom, graph scene plus detail cards and exploration.
3. Atlassian Compass, component relationships plus ownership and health.
4. Stripe docs, clean information architecture and controlled detail exposure.

Audit update:

1. The earlier page solved data presence, not understanding.
2. The useful primary interaction is lane -> node -> neighbors -> details -> next node.
3. Full-width static sections should be reference shelves, not the core experience.
4. The graph should be focused and legible, not global and overlapping.

## Working Direction

Build a focused graph explorer with:

1. Story lanes for the major system layers.
2. A single active node.
3. A graph neighborhood around the active node, with incoming and outgoing relations separated clearly.
4. Breadcrumbs and visible path history.
5. Connected node navigation.
6. Detail tabs for overview, ownership, connections, and status.
7. Search and story paths for common questions.
8. Progressive disclosure for authorities and workstreams.

## Active Todos

- [x] Audit the current deployed page and local implementation again before replacing structure.
- [x] Design a focused graph explorer layout that works on phone first.
- [x] Decide to keep custom focused graph rendering instead of another overlapping global graph.
- [x] Add breadcrumbs and path history.
- [x] Add a centered active node with neighbor graph.
- [x] Add sideways navigation via connected nodes.
- [x] Reduce long prose by default, keep details on demand.
- [x] Test on desktop with `agent-browser`.
- [x] Test with mobile viewport or device emulation in `agent-browser`.
- [ ] Push, validate deployed behavior, and note remaining gaps.

## Test Log

- Initial deployed page loaded data but felt like a wall of text.
- Initial SVG graph approach was visually poor and overlapped.
- Replaced with cards and story rails, still not enough of a true explorer.
- Mixed cached assets caused null access failures, JS was hardened and asset cache-busted.
- Rebuilt the page around a focused explorer with lanes, journeys, search, breadcrumb path, centered focus node, neighbor graph, detail tabs, and collapsed reference shelves.
- Local desktop test with `agent-browser` passed, page loads and explorer interactions work.
- Mobile emulation test with `agent-browser` on iPhone 16 viewport passed, no horizontal overflow on body width, explorer interactions still work.

## Reflection Loop

After each implementation pass:

1. Test locally.
2. Test with `agent-browser`.
3. Reflect on whether it actually improves Mike's understanding.
4. Update this document.
5. Replan.
6. Continue working without waiting.
