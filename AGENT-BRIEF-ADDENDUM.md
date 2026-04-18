# Supplement to AGENT-BRIEF.md

Written mid-execution with factual corrections and additions Mike flagged. Please read and incorporate.

## Foundation / architectural layering

The system is built on top of several open-source projects Mike did NOT build. Be careful to attribute correctly.

- `.aiva/` (lives at `~/.aiva/`) — THIS is Mike's own infrastructure. He built this. Contains modules, skills, scripts, MCP servers, the state directory, the state/bin/aiva-python3 interpreter wrapper, the cron/launchd layer, MCP server endpoints at officeadmin.io. The site should highlight this as the core thing Mike built.
- **OpenClaw** — an open-source terminal UI project Mike uses on top of .aiva. He did NOT build OpenClaw. Do not attribute authorship to him. It is a TUI layer, sits above .aiva.
- **MemPalace** — an open-source SQLite knowledge graph tool. Mike has a thin module wrapper around it at `~/.aiva/modules/mempalace/` that handles ingest ordering and launchd. MemPalace itself is third-party. Be clear about this distinction on the Stack and Architecture pages.
- **Claude / Codex / GLM-5.1** — LLMs the system calls. Claude is the primary agent brain. GLM-5.1 is used by MemPalace-extract for knowledge extraction from sessions.

So when you describe the foundation on the Stack page, the layering is approximately:

1. Hardware: Mac mini at `aiva.local`, Intel i9, running macOS. Tailscale mesh across devices.
2. System: macOS services (launchd, tmux, nginx, cloudflared tunnel)
3. Open source tools: OpenClaw (TUI), MemPalace (knowledge graph), n8n (workflow automation), BlueBubbles (iMessage bridge), Akaunting (business hub)
4. Mikes own layer: `.aiva/` — modules, skills, orchestration, drafter, email triage, voice memo pipeline, contacts/quickbooks/google CLIs, talk CLI, canvas, the whole thing
5. Agent brains: Claude (primary), plus GLM-5.1 for batch extraction

## Entity systems — important distinction

There are TWO separate entity stores. Do not conflate them on the site.

**mikeshaffer repo entities** at `github.com/banddude/mikeshaffer/entities/<slug>/`
- 85 entities. One folder per customer, vendor, team member, family member, place
- Stable dashed slugs: `mike-shaffer`, `jason-madsen`, `paul-yamamoto`
- Structured JSON profile + tasks folder + work folder per entity
- This is the operational CRM. Email triage, drafter, daily sync, contact URL linking all read from here
- Manually curated, validator-enforced schema

**MemPalace entities** at `~/.mempalace/knowledge_graph.sqlite3`
- 3,580 entities. Auto-extracted from Mike's entire AI session history
- Underscored ids: `mike_shaffer`, `shaffer_construction`, `supabase`
- Types: person, company, tool, project, concept, place, property, event, vehicle
- Connected by triples (6,810 subject/predicate/object relations) with valid_from/valid_to timestamps
- Auto-ingested by the mempalace-extract pipeline that reads Claude/Codex/OpenClaw session JSONL files, sends them to GLM-5.1, and stores knowledge
- NOT cross-referenced with the mikeshaffer repo entities today. They are separate systems

When describing this on the site:
- mikeshaffer repo entities = the operational CRM
- MemPalace entities = the long-term memory extracted from conversations

The CRM is the working set. MemPalace is the historical memory. They both exist, they do different jobs, they are not (yet) connected.

## Tasks and tracking

- Keep shipping. Ignore this file after youve read it
- If youve already mentioned MemPalace on the site, double-check: do your descriptions match the facts above? Fix anywhere that implies Mike built MemPalace or OpenClaw
- Add OpenClaw to the Stack page as a separate tool, credited as open source
- On the Architecture page, show .aiva/ as a distinct Mike-authored layer between open-source tools and the agent brain
