// Architecture diagram interactivity
(function () {
  var details = {
    aiva: {
      title: "AIVA — The Agent",
      desc: "The central AI agent running on a Mac Mini. AIVA orchestrates all other modules, manages background sessions in tmux, runs scheduled jobs, responds to iMessages, and coordinates across 50+ modules. It calls Claude for reasoning and uses learned rules to write in Mike's voice."
    },
    comms: {
      title: "Communications Pipeline",
      desc: "End-to-end message processing. A morning scanner checks Gmail and iMessage at 7:45 AM. Messages get classified into tiers (auto-send, notify, or review). The dispatcher fans out to up to 5 parallel drafters. An auto-sender releases Tier 1 drafts at 9:30 AM. Afternoon watchers run at 3:00-3:45 PM for follow-ups."
    },
    knowledge: {
      title: "Knowledge Layer",
      desc: "MemPalace is a SQLite knowledge graph that stores entities, relationships, and facts extracted from conversations, documents, and agent sessions. It uses priority-based ingest ordering: agent sessions first, then memory, cron runs, Claude projects, and Codex artifacts."
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
      title: "MemPalace",
      desc: "SQLite-backed knowledge graph. Stores thousands of entities and triples organized into rooms and drawers. Extracts high-signal context from agent sessions, conversations, and documents. Supports graph traversal, search, timeline queries, and tunnel discovery between related concepts."
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
      title: "GitHub CRM",
      desc: "The banddude/mikeshaffer repo is both code and CRM. Each person and company gets an entity folder (entities/<slug>/) with profile data (entity.json), tasks (tasks/*.json), and work records (work/*.md). GitHub Actions run validators on every push. Work lifecycle tracks from lead through to payment."
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
      desc: "Anthropic's Claude models power AIVA's reasoning. Used for email classification, draft composition, entity extraction, conversation understanding, and general task execution. AIVA runs on Claude Code with MCP servers providing tool access to all modules."
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
