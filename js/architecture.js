// Architecture diagram interactivity
(function () {
  var details = {
    aiva: {
      title: "AIVA — The Agent (Mike's .aiva/ layer)",
      desc: "The central AI agent running on a Mac Mini. The ~/.aiva/ directory is the custom infrastructure Mike built: 50+ modules, skills, scripts, MCP servers, state management, and orchestration logic. It sits between open-source tools (OpenClaw, MemPalace, n8n) and the agent brains (Claude, GLM-5.1), tying everything together into a coherent operations system."
    },
    comms: {
      title: "Communications Pipeline",
      desc: "End-to-end message processing. A morning scanner checks Gmail and iMessage at 7:45 AM. Messages get classified into tiers (auto-send, notify, or review). The dispatcher fans out to up to 5 parallel drafters. An auto-sender releases Tier 1 drafts at 9:30 AM. Afternoon watchers run at 3:00-3:45 PM for follow-ups."
    },
    knowledge: {
      title: "Knowledge Layer",
      desc: "Two separate entity systems. The operational CRM (GitHub repo, 85 manually curated entities with dashed slugs) handles day-to-day business. MemPalace (open-source knowledge graph, 3,580 auto-extracted entities with underscored IDs, 6,810 temporal triples) stores long-term memory from session history. They serve different purposes and are not yet connected."
    },
    business: {
      title: "Business Systems",
      desc: "QuickBooks Online integration for estimates, invoices, bills, and customer records. Google Workspace access across two accounts (personal and Shaffer Construction) for Gmail, Calendar, Drive, Sheets, and Chat. TSheets for crew scheduling and timesheets."
    },
    agents: {
      title: "Agent Runtime",
      desc: "Background agent sessions managed in tmux. Each agent gets its own workspace and runtime config. The agent-revive CLI can restart crashed sessions. n8n handles event-driven workflow automation. Scheduled jobs run on cron with specific time slots throughout the day."
    },
    imessage: {
      title: "iMessage Integration",
      desc: "Reads the native Messages database (chat.db) via SQLite. Sends messages through BlueBubbles, which acts as a cross-platform relay. AIVA responds to direct messages from Mike's phone and can send proactive notifications. Access is controlled by an allowlist and pairing approval system."
    },
    drafter: {
      title: "Drafter",
      desc: "An LLM module that writes in Mike's voice. It reads entity context, routing rules (ROUTING.md), and drafting conventions (DRAFTING.md) before composing. Mike's corrections are distilled back into the rule set through a learning pipeline, so the drafts improve over time."
    },
    mempalace: {
      title: "MemPalace (open-source)",
      desc: "An open-source SQLite knowledge graph tool that Mike did not build. He wrote a thin wrapper module at ~/.aiva/modules/mempalace/ that handles ingest ordering and launchd scheduling. The mempalace-extract pipeline reads Claude, Codex, and OpenClaw session JSONL files, sends them to GLM-5.1 for extraction, and stores the results. Currently holds 3,580 entities and 6,810 temporal triples."
    },
    quickbooks: {
      title: "QuickBooks CLI",
      desc: "A Python and Node CLI (~40 files) that wraps the QuickBooks Online API with OAuth authentication. Creates and manages estimates, invoices, bills, customers, and vendors. Credentials stored in macOS Keychain. Also integrates with QuickBooks Time (TSheets) for crew scheduling."
    },
    google: {
      title: "Google APIs",
      desc: "Unified Python CLI for Google Workspace. Handles Gmail (send, reply, forward, search), Google Calendar (create events, check availability), Google Drive (file management), Google Chat, and more. Supports two auth modes: personal OAuth and Workspace service account for the @shaffercon.com domain."
    },
    tmux: {
      title: "tmux Sessions",
      desc: "Background agent sessions run in tmux, managed by the agents module. Each session has its own workspace and can be revived if it crashes. The 'tell' CLI sends commands to running sessions. This is how AIVA runs long tasks (like building this website) without blocking the main chat."
    },
    n8n: {
      title: "n8n Workflows",
      desc: "Event-driven automation platform running on Railway. Handles webhook-triggered workflows and complex multi-step automations. The Cloudflare Worker routes n8n paths (/webhook, /workflows, /api) to the Railway deployment while the static site is served from GitHub Pages."
    },
    contacts: {
      title: "Apple Contacts",
      desc: "Direct SQLite read/write to the macOS Contacts database. Faster than AppleScript for bulk operations. Every customer, vendor, crew member, and family member is an entity with a canonical profile. Contact records link to the GitHub CRM repo via URL labels."
    },
    reminders: {
      title: "Apple Reminders",
      desc: "The approval queue for everything. When AIVA drafts an email, generates an estimate, or identifies a task, it creates an Apple Reminder. Mike reviews and approves from his phone. Reminders sync via iCloud, so they show up everywhere. Tasks also mirror to entity folders in the GitHub CRM."
    },
    calendar: {
      title: "Calendar",
      desc: "EventKit-based Apple Calendar integration. Creates, reads, and manages events across iCloud and Google calendars. Used for scheduling crew work, client meetings, and AIVA's own job schedule."
    },
    voice: {
      title: "Voice Pipeline",
      desc: "iPhone recordings sync via iCloud to the Mac Mini. A launchd watcher detects new files and triggers AssemblyAI transcription. Pinecone stores speaker voice embeddings for identification across recordings. Transcripts feed into MemPalace for knowledge extraction and entity linking."
    },
    homeassistant: {
      title: "Home Assistant",
      desc: "Smart home device control via the Home Assistant API. AIVA can turn on/off lights, check device states, control media players, and manage automations. Configuration is version-controlled in git, separated from mutable runtime state."
    },
    talk: {
      title: "Talk / Canvas",
      desc: "Text-to-speech notifications pushed to all of Mike's devices simultaneously. Canvas provides a phone-based HTML UI for AIVA to show interactive prompts, confirmations, and simple forms. Uses Apple Push Notification Service (APNS) for delivery."
    },
    github: {
      title: "GitHub CRM (operational entities)",
      desc: "The banddude/mikeshaffer repo holds 85 manually curated entities with dashed slugs (jason-madsen, paul-yamamoto). Each entity folder has a JSON profile, tasks, and work records. This is the working CRM that email triage, the Drafter, and daily sync scripts read from. Separate from the 3,580 auto-extracted MemPalace entities. GitHub Actions run validators on every push."
    },
    assemblyai: {
      title: "AssemblyAI",
      desc: "Speech-to-text API used by the voice pipeline. Transcribes meeting recordings, phone calls, and voice memos with speaker diarization. Transcripts are stored locally and processed for entity extraction."
    },
    pinecone: {
      title: "Pinecone",
      desc: "Vector database storing speaker voice embeddings. When a new recording is transcribed, speaker segments are compared against the embedding index to identify who is speaking. This allows AIVA to attribute statements to specific people across all recordings."
    },
    claude: {
      title: "Claude API",
      desc: "Anthropic's Claude is the primary agent brain. Used for email classification, draft composition, conversation understanding, and general task execution. AIVA runs on Claude Code with MCP servers providing tool access to all modules. GLM-5.1 handles batch knowledge extraction for the MemPalace pipeline."
    },
    tailscale: {
      title: "Tailscale",
      desc: "Mesh VPN connecting all of Mike's devices. The Mac Mini, phones, laptops, and speakers are all on the same private network. This lets AIVA reach any device for notifications, file sync, or remote commands regardless of physical location."
    }
  };

  var panel = document.getElementById("archDetail");
  var nodes = document.querySelectorAll(".arch-svg-node");

  nodes.forEach(function (node) {
    node.addEventListener("click", function () {
      var key = node.getAttribute("data-node");
      var info = details[key];
      if (!info) return;

      panel.classList.add("active");
      panel.innerHTML =
        '<div class="arch-detail-title">' + info.title + "</div>" +
        '<div class="arch-detail-desc">' + info.desc + "</div>";

      nodes.forEach(function (n) {
        n.style.opacity = n === node ? "1" : "0.4";
      });
    });
  });

  document.addEventListener("click", function (e) {
    if (!e.target.closest(".arch-svg-node") && !e.target.closest(".arch-detail-panel")) {
      panel.classList.remove("active");
      panel.innerHTML = '<p class="arch-detail-placeholder">Tap a node in the diagram to see details.</p>';
      nodes.forEach(function (n) {
        n.style.opacity = "1";
      });
    }
  });
})();
