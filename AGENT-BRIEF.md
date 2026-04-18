# Agent Brief: officeadmin.io landing site

You are building the public-facing landing site for **OfficeAdmin**, a personal AI operations system used by Mike Shaffer to run Shaffer Construction (a Los Angeles electrical contractor). The AI agent running the system is named **AIVA**. The site lives at officeadmin.io.

## Goal

Build a mobile-first-friendly, clean, simple website that Mike can pull up in conversation with a friend at a bar and use to explain what this system is, what it does, and how the pieces connect. It is NOT a sales pitch and NOT a SaaS product landing. It is a personal portfolio / show-and-tell piece. Tone should be confident, understated, curious. Think Linear, Vercel, Replit personal site — not "AI automation agency."

Pages required:

1. **Home** — one-screen explanation: what OfficeAdmin is, who AIVA is, what it does at a glance
2. **Architecture** — visual or interactive diagram showing how the pieces connect. This is the money page. The system spans many modules and they all talk to each other.
3. **Modules** — one section or page per module (see module list below), each with a short plain-English explanation of what it does and a concrete example
4. **Stack** — a brief tech inventory page

Everything must be genuinely mobile-friendly first. Desktop is secondary. Dark mode preferred but your call.

## System context you need

This is real, running software. Don't make stuff up. If you need more detail on anything, read the codebase — start at `/Users/mikeshaffer/.aiva/` and `/Users/mikeshaffer/mikeshaffer/` and skills at `/Users/mikeshaffer/.claude/skills/`. Mike has thousands of skills there that describe the real system.

### What OfficeAdmin / AIVA actually is

A Mac mini at `aiva.local` running a constellation of Python CLIs, n8n workflows, tmux-managed agent sessions, MCP servers, and Claude model calls. The Mac mini is the "home server" but phones, laptops, and speakers throughout the house are participants. Everything syncs via Tailscale and iCloud. The `banddude/mikeshaffer` GitHub repo is both an operational workspace and a lightweight CRM.

Core idea: every operational task Mike used to do by hand (email triage, sending estimates, scheduling, contact management, job tracking, voice-memo transcription, scheduling crews, posting blog content) is now either fully automated or drafted for his review.

### Modules

- **Email triage** — watches Gmail, classifies messages (action-item / fyi / noise), drafts replies in Mike's voice, queues them as approve-before-send reminders
- **Drafter** — an LLM that reads entity context and routing rules to write in Mike's voice, now with a learning pipeline that distills his corrections into rules
- **QuickBooks CLI** — programmatic access to QuickBooks Online. Create estimates, invoices, bills, customers
- **Contacts CLI** — direct read/write to Apple Contacts via SQLite + PyObjC + AppleScript fallback
- **MemPalace** — SQLite knowledge graph (thousands of entities and triples) extracted from conversations and documents
- **Voice memo pipeline** — AssemblyAI transcription + Pinecone speaker embeddings for speaker identification across recordings
- **Reminders pipeline** — Apple Reminders as the approval queue for every draft and task
- **Google CLI** — unified access to Gmail, Calendar, Drive, Sheets, Docs, Chat, Tasks across two accounts
- **iMessage integration** — via BlueBubbles, for conversational interaction with AIVA from phone
- **TSheets (QuickBooks Time)** — crew scheduling and timesheets
- **Home Assistant** — smart home device control
- **n8n workflows** — event-driven automation routing
- **talk CLI** — text-to-speech across all Mike's devices simultaneously
- **Canvas** — phone-based HTML UI for AIVA to show interactive prompts
- **Chrome CLI** — Playwright-based browser automation
- **Shaffer blogger** — SEO blog posts for shaffercon.com, content managed in GitHub
- **Background agents** — tmux sessions that run long tasks (like this one!) without blocking the chat
- **Akaunting** — internal business hub for agent scripts, schedules, run history, custom modules

### The mikeshaffer repo

`github.com/banddude/mikeshaffer` is the operational backbone. Structure:
- `entities/<slug>/` — one folder per customer, vendor, team member, family member
- `entities/<slug>/entity.json` — profile data
- `entities/<slug>/tasks/*.json` — tasks for that entity
- `entities/<slug>/work/*.md` — job records, scope docs, meeting notes
- `system/scripts/` — daily sync, validators, QuickBooks registry refresh
- `system/skills/` — entity-specific skills
- GitHub Actions workflow runs validators on every push

### Research tasks before building

- Read `/tmp/officeadmin-agent/current-site.html` to see what's currently live (it's generic AI-slop, you're replacing it)
- Hit `https://officeadmin.io` to confirm it's a Cloudflare-served page (Pages or Worker, not origin)
- Use the cloudflare MCP skill at `~/.claude/skills/cloudflare/SKILL.md` to figure out where and how to deploy the new site. Mike's Cloudflare account is already connected.
- Current DNS goes to Cloudflare (172.67.148.63, 104.21.33.190). The public site is NOT served from Mike's Mac.
- On the Mac, `/usr/local/etc/nginx/servers/officeadmin.conf` proxies officeadmin.io → localhost:3000 which is just an OAuth callback server. That's for local OAuth flows only — you don't touch that.
- Skim `~/.claude/skills/` for more module details. Many skills have full descriptions.
- Skim `/Users/mikeshaffer/.aiva/modules/` for module source. Particularly interesting: `agents/`, `email/`, `drafter/`, `voice/`, `mempalace/`.

### Design constraints

- Mobile-first. Test that everything reads and flows on a phone. Desktop is secondary.
- Clean and simple. Real typography, generous whitespace, minimal chrome.
- No fake stats, no logos-of-companies-that-use-it, no testimonials. This is a personal system. Be honest about that.
- Architecture diagram is the hero. Make the connections between modules legible.
- Ship something Mike can actually link to and use in conversation.
- Interactivity where it helps understanding (hover-reveal on the diagram, click-to-expand modules). Not interactivity for its own sake.
- Build as a static site unless there's a strong reason otherwise. If deploying to Cloudflare Pages, plain HTML/CSS/JS or a lightweight framework (Astro, Eleventy) is ideal.

## Working directory

`/Users/mikeshaffer/officeadmin-site` — already `git init`'d.

## Deliverables

1. Working site in the working directory
2. Deployed to officeadmin.io (replacing the current generic page)
3. Short README documenting how it's structured and how to update it
4. Commit and push to a GitHub repo (create one under `banddude/officeadmin-site` if it doesn't exist)

## How to communicate

- Log major decisions to `/Users/mikeshaffer/officeadmin-site/AGENT-LOG.md` as you go. Just append dated entries.
- If you hit something that genuinely requires Mike's decision (e.g. domain/DNS changes, paid plan upgrades), write the question to `/Users/mikeshaffer/officeadmin-site/QUESTIONS-FOR-MIKE.md` and keep moving on other work.
- Do NOT email or iMessage Mike. He's checking in via chat.
- Do NOT touch the `mikeshaffer` repo, the `.aiva` directory, or anything outside `/Users/mikeshaffer/officeadmin-site/` except in read-only mode for research.
- Do NOT install launchd jobs or modify cron.
- Write commits as you go. Small, clear, atomic.

## Style / voice notes

Mike's writing conventions (these apply to visible copy too):
- No emdashes. Use periods, commas, or separate sentences.
- No incomplete sentences or sentence fragments.
- Warm and approachable but confident. Not try-hard. Not robotic.
- No "happy to", no "excited to announce", no marketing cliches.
- Avoid AI-slop openers and closers.

Good luck. Ship something real.
