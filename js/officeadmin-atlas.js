function byId(id) {
  return document.getElementById(id);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function formatDateTime(value) {
  if (!value) return "n/a";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function chip(label, value) {
  return `<div class="officeadmin-inline-metric"><span>${label}</span><strong>${value}</strong></div>`;
}

function safeText(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

const laneMeta = {
  runtime: {
    label: "Runtime",
    summary: "What actually runs the system.",
    color: "runtime",
  },
  workspace: {
    label: "Workspace",
    summary: "Where durable work and operator state live.",
    color: "workspace",
  },
  memory: {
    label: "Memory",
    summary: "How recall is stored and rehydrated.",
    color: "memory",
  },
  authority: {
    label: "Authorities",
    summary: "What owns real truth instead of mirroring it.",
    color: "authority",
  },
  archive: {
    label: "Archives",
    summary: "Where older state lands when it leaves the live systems.",
    color: "archive",
  },
};

const rootProfiles = {
  aiva: {
    lane: "runtime",
    order: 4,
    role: "Runtime core",
    why: "AIVA is the orchestration center, the place where routing, generated commands, and shared system behavior come together.",
    owns: [
      "Module orchestration and generated command surfaces",
      "Shared runtime state policy",
      "Routing into Apple apps, Google, archives, and memory",
    ],
  },
  openclaw: {
    lane: "runtime",
    order: 2,
    role: "Attached AI runtime",
    why: "OpenClaw participates heavily in chat, cron, and subagent work, but it should stay attached to AIVA instead of competing with it.",
    owns: [
      "Chat and gateway runtime",
      "Subagent sessions and cron runs",
      "Session output that feeds memory extraction",
    ],
  },
  mikeshaffer: {
    lane: "workspace",
    order: 3,
    role: "Operator workspace",
    why: "This is the durable work surface for entities, notes, doctrine, drafts, and structured operating state.",
    owns: [
      "Entity folders and work memory",
      "Doctrine and operating rules",
      "Long-lived business and personal work state",
    ],
  },
  "officeadmin-site": {
    lane: "workspace",
    order: 7,
    role: "Read only surface",
    why: "This site should explain and navigate the system. It should not own it.",
    owns: [
      "Visual navigation and explanation",
      "Generated system map surface",
      "No primary business or runtime truth",
    ],
  },
  mempalace: {
    lane: "memory",
    order: 6,
    role: "Long term graph memory",
    why: "MemPalace is the memory substrate, where extracted entities and notes become durable graph recall.",
    owns: [
      "Temporal knowledge graph",
      "Long term extracted context",
      "Recall substrate for dossier and context building",
    ],
  },
  "apple-apps": {
    lane: "authority",
    order: 2,
    role: "Native authority layer",
    why: "Apple apps own native identity and personal data that should not be replaced by derived copies.",
    owns: [
      "Contacts identity authority",
      "Notes, Reminders, Calendar, Messages source layers",
      "Native user state that should not be duplicated casually",
    ],
  },
  "google-workspace": {
    lane: "authority",
    order: 6,
    role: "Live collaboration authority",
    why: "Google Workspace still owns active mail, shared docs, and office collaboration state.",
    owns: [
      "Gmail and live communication state",
      "Shared office documents and collaboration",
      "Live cloud workflow surfaces before archive or mirror",
    ],
  },
  archives: {
    lane: "archive",
    order: 6,
    role: "Mirror and cold storage",
    why: "Archives preserve older state and keep live systems lean, but they should not pretend to be the live source of truth.",
    owns: [
      "Drive archive and mail archive mirrors",
      "Cold storage for historical recovery",
      "Backup-oriented storage surfaces",
    ],
  },
};

const repoPresentation = {
  aiva: {
    label: "AIVA",
    role: "Runtime core",
    authority: "Shared runtime logic, module ownership, generated commands, and system state policy.",
    source: "Core system source",
  },
  mikeshaffer: {
    label: "mikeshaffer",
    role: "Operator workspace",
    authority: "Durable work memory, entity folders, doctrine, drafts, and operating history.",
    source: "Workspace source",
  },
  "officeadmin-site": {
    label: "officeadmin-site",
    role: "Read only map",
    authority: "Public or shared explanatory surface for the system. It reads from the real sources of truth, it does not own them.",
    source: "Derived surface",
  },
};

const journeyMeta = [
  {
    id: "context",
    label: "Context route",
    summary: "How live signals turn into usable context for real work.",
    focusId: "aiva",
    path: ["contacts-identity", "gmail-live", "messages-native", "aiva", "session-history", "mempalace", "entity-workspace"],
  },
  {
    id: "work",
    label: "Work route",
    summary: "Where durable work actually lives, and how it gets reflected for navigation.",
    focusId: "mikeshaffer",
    path: ["operator-laptop", "entity-workspace", "work-memory", "mikeshaffer", "officeadmin-site"],
  },
  {
    id: "archives",
    label: "Archive route",
    summary: "How older mail and files move from live systems into long-term storage.",
    focusId: "archives",
    path: ["google-workspace", "gmail-live", "drive-live", "aiva", "mail-archive", "drive-archive", "backup-disk"],
  },
  {
    id: "runtime",
    label: "Runtime route",
    summary: "What physically runs the system, and where orchestration crosses machine boundaries.",
    focusId: "aiva",
    path: ["aiva-host", "aiva", "module-surface", "openclaw", "operator-laptop", "messages-host"],
  },
];

const state = {
  data: null,
  model: null,
  adjacency: null,
  activeId: "aiva",
  activeLane: "runtime",
  activeTab: "overview",
  activeJourney: "context",
  history: ["aiva"],
};

function rootById(data, id) {
  return asArray(data?.roots).find((root) => root.id === id) || null;
}

function metricFromNode(node, label) {
  return asArray(node?.metrics).find((metric) => metric.label === label)?.value ?? "n/a";
}

function machineById(data, id) {
  return asArray(data?.machines).find((machine) => machine.id === id) || null;
}

function machineByMatch(data, pattern) {
  return asArray(data?.machines).find((machine) => pattern.test(machine.id) || pattern.test(machine.label)) || null;
}

function memoryCategory(data, pattern) {
  return asArray(data?.memoryCategories).find((category) => pattern.test(category.title)) || null;
}

function authorityRows(data, pattern) {
  return asArray(data?.authorities).filter(
    (row) => pattern.test(row.domain || "") || pattern.test(row.category || "") || pattern.test(row.where || "")
  );
}

function firstLine(items, fallback) {
  return asArray(items).find(Boolean) || fallback;
}

function buildModel(data) {
  const nodes = [];
  const edges = [];

  const addNode = (node) => {
    nodes.push({
      type: "part",
      metrics: [],
      owns: [],
      connections: [],
      parent: null,
      order: 50,
      ...node,
    });
  };

  const addEdge = (from, to, label, kind = "link") => {
    edges.push({ from, to, label, kind });
  };

  const aivaRoot = rootById(data, "aiva");
  const workspaceRoot = rootById(data, "mikeshaffer");
  const memoryRoot = rootById(data, "mempalace");
  const appleRoot = rootById(data, "apple-apps");
  const googleRoot = rootById(data, "google-workspace");
  const archiveRoot = rootById(data, "archives");
  const officeadminRoot = rootById(data, "officeadmin-site");
  const openclawRoot = rootById(data, "openclaw");

  const aivaMachine = machineByMatch(data, /aiva/i);
  const laptopMachine = machineByMatch(data, /laptop/i);
  const messagesMachine = machineById(data, "imessage-laptop");
  const sessionCategory = memoryCategory(data, /Session and chat history/i);
  const graphCategory = memoryCategory(data, /Knowledge graph and semantic vectors/i);
  const driveArchivePresent = metricFromNode(archiveRoot, "Drive archive");
  const mailArchivePresent = metricFromNode(archiveRoot, "Mail archive");

  asArray(data.roots).forEach((root) => {
    const profile = rootProfiles[root.id] || {};
    addNode({
      id: root.id,
      label: root.label,
      lane: profile.lane || "workspace",
      order: profile.order || 50,
      summary: profile.role || root.type,
      description: root.description,
      why: profile.why || root.description,
      metrics: asArray(root.metrics),
      owns: asArray(profile.owns),
      path: `System / ${laneMeta[profile.lane || "workspace"]?.label || "Workspace"} / ${root.label}`,
    });
  });

  addNode({
    id: "aiva-host",
    label: "AIVA host",
    lane: "runtime",
    parent: "aiva",
    order: 1,
    summary: "Mac mini runtime host",
    description: "Primary shared runtime machine. This is where the system wakes up, holds shared state, and runs the heavy lifting.",
    why: firstLine(aivaMachine?.notes, "Shared runtime lives here first."),
    metrics: [
      { label: "Hostname", value: aivaMachine?.hostname || "aiva.local" },
      { label: "Tailscale", value: aivaMachine?.tailscale || "n/a" },
      { label: "Role", value: aivaMachine?.role || "runtime host" },
    ],
    owns: asArray(aivaMachine?.keyPaths).slice(0, 4),
    path: "System / Runtime / AIVA / AIVA host",
  });

  addNode({
    id: "module-surface",
    label: "Module surface",
    lane: "runtime",
    parent: "aiva",
    order: 5,
    summary: "Commands, skills, and daemons",
    description: "The generated public surface built from module manifests, skills, and runtime services.",
    why: "This is the main execution surface Mike and the agents actually touch.",
    metrics: [
      { label: "Modules", value: data.modules?.count || 0 },
      { label: "Commands", value: data.modules?.publicCommands || 0 },
      { label: "Skills", value: data.modules?.publicSkills || 0 },
    ],
    owns: asArray(data.modules?.topDependencies)
      .slice(0, 4)
      .map((item) => `${item.name}, ${item.moduleDependencyCount} module dependencies.`),
    path: "System / Runtime / AIVA / Module surface",
  });

  addNode({
    id: "scheduler-surface",
    label: "Schedulers",
    lane: "runtime",
    parent: "aiva",
    order: 7,
    summary: "Launchd and recurring work owners",
    description: "Recurring work should have exactly one scheduler owner, even if multiple runtimes exist nearby.",
    why: "Scheduler ambiguity is one of the fastest ways for a system like this to get confusing.",
    metrics: [
      { label: "Daemons", value: data.modules?.daemonCount || 0 },
      { label: "Workstreams", value: asArray(data.roadmap?.workstreams).length },
      { label: "Dirty repos", value: data.snapshot?.dirtyRepos || 0 },
    ],
    owns: asArray(data.roadmap?.workstreams)
      .slice(0, 3)
      .map((item) => item.title),
    path: "System / Runtime / AIVA / Schedulers",
  });

  addNode({
    id: "operator-laptop",
    label: "Operator laptop",
    lane: "runtime",
    parent: "aiva",
    order: 9,
    summary: "Thin client and editor",
    description: "Mike’s daily driver. It edits, checks, and operates the system, but should not become the shared runtime authority.",
    why: firstLine(laptopMachine?.notes, "Thin client for editing and operator work."),
    metrics: [
      { label: "Hostname", value: laptopMachine?.hostname || "mike.local" },
      { label: "Tailscale", value: laptopMachine?.tailscale || "n/a" },
      { label: "Role", value: laptopMachine?.role || "thin client" },
    ],
    owns: asArray(laptopMachine?.notes).slice(0, 3),
    path: "System / Runtime / AIVA / Operator laptop",
  });

  addNode({
    id: "messages-host",
    label: "iMessage host",
    lane: "runtime",
    parent: "aiva",
    order: 11,
    summary: "Dedicated BlueBubbles host",
    description: "Separate machine used to keep Apple messaging auth and BlueBubbles responsibilities isolated.",
    why: firstLine(messagesMachine?.notes, "Dedicated machine for iMessage transport responsibilities."),
    metrics: [
      { label: "Tailscale", value: messagesMachine?.tailscale || "n/a" },
      { label: "Role", value: messagesMachine?.role || "dedicated host" },
      { label: "State", value: "attached runtime" },
    ],
    owns: asArray(messagesMachine?.notes).slice(0, 2),
    path: "System / Runtime / AIVA / iMessage host",
  });

  addNode({
    id: "entity-workspace",
    label: "Entity workspace",
    lane: "workspace",
    parent: "mikeshaffer",
    order: 1,
    summary: "Entity folders and work records",
    description: "Durable operating state for people, companies, jobs, bids, and working context.",
    why: "This is where the personal or tenant side of the system should stay inspectable and versioned.",
    metrics: [
      { label: "Entity folders", value: metricFromNode(workspaceRoot, "Entity folders") },
      { label: "JSON docs", value: metricFromNode(workspaceRoot, "Tracked JSON docs") },
      { label: "Path", value: "~/mikeshaffer/entities" },
    ],
    owns: [
      "Entity folders linked to real people and companies",
      "Durable work records and structured operating files",
      "The human-facing work surface that should survive runtime changes",
    ],
    path: "System / Workspace / mikeshaffer / Entity workspace",
  });

  addNode({
    id: "work-memory",
    label: "Work memory",
    lane: "workspace",
    parent: "mikeshaffer",
    order: 5,
    summary: "Doctrine, notes, and operating memory",
    description: "Durable summaries, doctrine, memory notes, and work state that you want version history on.",
    why: "Git-backed work memory is part of the system model here, not just an afterthought.",
    metrics: [
      { label: "Memory notes", value: metricFromNode(workspaceRoot, "Memory notes") },
      { label: "Source rules", value: asArray(data.roadmap?.sourceOfTruth).length },
      { label: "Tracked repo", value: "yes" },
    ],
    owns: asArray(data.roadmap?.sourceOfTruth).slice(0, 3),
    path: "System / Workspace / mikeshaffer / Work memory",
  });

  addNode({
    id: "session-history",
    label: "Session history",
    lane: "memory",
    parent: "mempalace",
    order: 1,
    summary: "Raw sessions and chat logs",
    description: "Claude, Codex, OpenClaw, voice, and related transcripts that become searchable and extractable memory input.",
    why: sessionCategory?.note || "Raw session trails are the substrate that better memory gets built from.",
    metrics: [
      { label: "OpenClaw sessions", value: data.snapshot?.openclawSessions || "n/a" },
      { label: "Rows", value: asArray(sessionCategory?.rows).length || 0 },
      { label: "Role", value: "ingest substrate" },
    ],
    owns: asArray(sessionCategory?.rows)
      .slice(0, 4)
      .map((row) => `${row.What}, ${row.Where}.`),
    path: "System / Memory / MemPalace / Session history",
  });

  addNode({
    id: "extraction-pipeline",
    label: "Extraction pipeline",
    lane: "memory",
    parent: "mempalace",
    order: 5,
    summary: "From raw sessions to recallable memory",
    description: "The processing path that turns raw logs and notes into graph entities, triples, vectors, and recall surfaces.",
    why: graphCategory?.note || "A memory system is only useful if ingestion stays explicit and traceable.",
    metrics: [
      { label: "Graph rows", value: asArray(graphCategory?.rows).length || 0 },
      { label: "Triples", value: metricFromNode(memoryRoot, "Triples") },
      { label: "DB size", value: metricFromNode(memoryRoot, "DB size") },
    ],
    owns: asArray(graphCategory?.rows)
      .filter((row) => /Extraction|backups|SQLite|ChromaDB|HNSW/i.test(row.What || row.Where || ""))
      .slice(0, 4)
      .map((row) => `${row.What}, ${row.Where}.`),
    path: "System / Memory / MemPalace / Extraction pipeline",
  });

  addNode({
    id: "contacts-identity",
    label: "Contacts identity",
    lane: "authority",
    parent: "apple-apps",
    order: 1,
    summary: "Canonical people and org identity",
    description: "Apple Contacts should anchor identity for people and organizations, while other systems resolve back to that spine.",
    why: "Identity ambiguity is one of the biggest causes of context fragmentation.",
    metrics: [
      { label: "Authority", value: "Apple Contacts" },
      { label: "Mode", value: "source of truth" },
      { label: "Rows", value: authorityRows(data, /Contacts|contact identity/i).length || 1 },
    ],
    owns: [
      "Canonical people and organization cards",
      "Phones, emails, and contact-level identity fields",
      "The entity anchor that other surfaces should resolve back to",
    ],
    path: "System / Authorities / Apple Apps / Contacts identity",
  });

  addNode({
    id: "messages-native",
    label: "Messages and Apple data",
    lane: "authority",
    parent: "apple-apps",
    order: 3,
    summary: "Native comms and personal data",
    description: "Messages, Notes, Reminders, Calendar, and related Apple-native surfaces that matter for real context and workflow.",
    why: "These apps are not just outputs, they are data authorities that live in the real user environment.",
    metrics: [
      { label: "Authority rules", value: metricFromNode(appleRoot, "Authority rules") },
      { label: "Docs categories", value: metricFromNode(appleRoot, "Docs categories") },
      { label: "Mode", value: "native authority" },
    ],
    owns: [
      "Messages, Notes, Reminders, Calendar, and local user state",
      "Native capture and execution surfaces",
      "The human-facing data Mike already lives in",
    ],
    path: "System / Authorities / Apple Apps / Messages and Apple data",
  });

  addNode({
    id: "gmail-live",
    label: "Gmail",
    lane: "authority",
    parent: "google-workspace",
    order: 5,
    summary: "Live mail authority",
    description: "Active mail remains live in Gmail until archive and retrieval paths are strong enough to age old data out safely.",
    why: "Mail is part live authority, part future archive candidate, so the transition line needs to stay visible.",
    metrics: [
      { label: "Authority", value: "live mail" },
      { label: "Archive mirror", value: metricFromNode(googleRoot, "Archive mirror") },
      { label: "Role", value: "communication truth" },
    ],
    owns: [
      "Current inbox state and live thread history",
      "The office’s active mail collaboration surface",
      "Mail that can later be mirrored into archive flows",
    ],
    path: "System / Authorities / Google Workspace / Gmail",
  });

  addNode({
    id: "drive-live",
    label: "Drive",
    lane: "authority",
    parent: "google-workspace",
    order: 7,
    summary: "Live shared docs",
    description: "Active collaborative files still live here while the archive policy gets cleaner and older data ages off Google.",
    why: "Live shared docs and durable work memory should be connected, but not confused.",
    metrics: [
      { label: "Drive archive", value: metricFromNode(googleRoot, "Drive archive") },
      { label: "Role", value: "shared docs" },
      { label: "Mode", value: "live collaboration" },
    ],
    owns: [
      "Current shared office documents",
      "The live collaboration surface for the team",
      "The oldest high-volume storage pressure in the current system",
    ],
    path: "System / Authorities / Google Workspace / Drive",
  });

  addNode({
    id: "accounting-authority",
    label: "QuickBooks",
    lane: "authority",
    parent: "google-workspace",
    order: 9,
    summary: "Accounting truth",
    description: "Accounting, invoices, customers, and estimates should keep their authority where the financial system already owns it.",
    why: "Not every important thing belongs in the same repo or app, but every important thing needs a clear owner.",
    metrics: [
      { label: "Authority", value: "accounting" },
      { label: "Mode", value: "system of record" },
      { label: "Reads", value: "AIVA modules" },
    ],
    owns: [
      "Customers, estimates, invoices, and payments",
      "Financial truth that should be referenced, not recreated",
      "A business authority outside the repo surfaces",
    ],
    path: "System / Authorities / Google Workspace / QuickBooks",
  });

  addNode({
    id: "backup-disk",
    label: "Backup disk",
    lane: "archive",
    parent: "archives",
    order: 1,
    summary: "External cold storage",
    description: "Offline or attached storage for larger historical state that should not depend on the internal drive alone.",
    why: "A cold archive should be visible as a real part of the system, not a vague hope.",
    metrics: [
      { label: "Path", value: "/Volumes/MIKES HD" },
      { label: "Role", value: "cold backup" },
      { label: "Mode", value: "external storage" },
    ],
    owns: [
      "Drive archives, mail archives, and large historical mirrors",
      "Cold storage that outlives live quota decisions",
      "A separate recovery surface from the AIVA internal drive",
    ],
    path: "System / Archives / Archives / Backup disk",
  });

  addNode({
    id: "drive-archive",
    label: "Drive archive",
    lane: "archive",
    parent: "archives",
    order: 5,
    summary: "Older Google Drive history",
    description: "Archive mirror for older shared files that should not keep inflating live Google storage costs.",
    why: "Drive cleanup only feels safe if the archive is visible and queryable enough to trust.",
    metrics: [
      { label: "State", value: driveArchivePresent || "missing" },
      { label: "Mode", value: "mirror" },
      { label: "Source", value: "Google Drive" },
    ],
    owns: [
      "Older Google Drive materials and mirrored history",
      "Archive storage for files that age out of live collaboration",
      "The handoff point between live Drive and cold storage",
    ],
    path: "System / Archives / Archives / Drive archive",
  });

  addNode({
    id: "mail-archive",
    label: "Mail archive",
    lane: "archive",
    parent: "archives",
    order: 7,
    summary: "Older mail history",
    description: "Mirrored email archive used to preserve older mail while shrinking what needs to stay live in Google.",
    why: "The archive path matters more than the deletion path.",
    metrics: [
      { label: "State", value: mailArchivePresent || "missing" },
      { label: "Mode", value: "mirror" },
      { label: "Source", value: "Gmail" },
    ],
    owns: [
      "Historic mail outside the live Gmail quota surface",
      "Mail recovery and research support",
      "A separate storage class from the active inbox",
    ],
    path: "System / Archives / Archives / Mail archive",
  });

  addEdge("aiva-host", "aiva", "hosts");
  addEdge("openclaw", "aiva", "attaches to");
  addEdge("module-surface", "aiva", "exposes");
  addEdge("scheduler-surface", "aiva", "schedules");
  addEdge("operator-laptop", "officeadmin-site", "reviews");
  addEdge("operator-laptop", "mikeshaffer", "edits");
  addEdge("messages-host", "messages-native", "keeps auth alive");

  addEdge("aiva", "mikeshaffer", "reads work state");
  addEdge("aiva", "mempalace", "hydrates context");
  addEdge("aiva", "apple-apps", "reads native authorities");
  addEdge("aiva", "google-workspace", "reads live cloud state");
  addEdge("aiva", "archives", "mirrors and checks");

  addEdge("officeadmin-site", "aiva", "reads runtime state");
  addEdge("officeadmin-site", "mikeshaffer", "reads workspace state");
  addEdge("officeadmin-site", "archives", "shows archive status");

  addEdge("mikeshaffer", "entity-workspace", "contains");
  addEdge("mikeshaffer", "work-memory", "contains");
  addEdge("contacts-identity", "entity-workspace", "anchors");

  addEdge("session-history", "mempalace", "feeds");
  addEdge("extraction-pipeline", "mempalace", "updates");
  addEdge("openclaw", "session-history", "writes");
  addEdge("messages-native", "session-history", "produces transcripts");

  addEdge("apple-apps", "contacts-identity", "owns");
  addEdge("apple-apps", "messages-native", "owns");
  addEdge("google-workspace", "gmail-live", "owns");
  addEdge("google-workspace", "drive-live", "owns");
  addEdge("accounting-authority", "aiva", "feeds accounting truth");

  addEdge("gmail-live", "aiva", "feeds communication");
  addEdge("drive-live", "aiva", "feeds live documents");
  addEdge("gmail-live", "mail-archive", "ages into");
  addEdge("drive-live", "drive-archive", "ages into");

  addEdge("archives", "backup-disk", "rests on");
  addEdge("archives", "drive-archive", "contains");
  addEdge("archives", "mail-archive", "contains");
  addEdge("backup-disk", "drive-archive", "stores");
  addEdge("backup-disk", "mail-archive", "stores");

  return { nodes, edges };
}

function adjacencyFor(model) {
  const map = new Map();
  model.nodes.forEach((node) => map.set(node.id, { inbound: [], outbound: [] }));
  model.edges.forEach((edge) => {
    if (!map.has(edge.from) || !map.has(edge.to)) return;
    map.get(edge.from).outbound.push(edge);
    map.get(edge.to).inbound.push(edge);
  });
  return map;
}

function getNode(id) {
  return state.model?.nodes.find((node) => node.id === id) || null;
}

function activeConnections() {
  return state.adjacency?.get(state.activeId) || { inbound: [], outbound: [] };
}

function isConnectedToActive(nodeId) {
  const connections = activeConnections();
  return connections.inbound.some((edge) => edge.from === nodeId) || connections.outbound.some((edge) => edge.to === nodeId);
}

function journeyById(id) {
  return journeyMeta.find((journey) => journey.id === id) || null;
}

function nodeButton(node, variant) {
  const leadMetric = asArray(node.metrics)[0];
  return `
    <button class="officeadmin-scene-node ${variant}" data-node-id="${node.id}" type="button">
      <span class="officeadmin-scene-node-label">${safeText(node.label)}</span>
      <span class="officeadmin-scene-node-type">${safeText(node.summary || node.type)}</span>
      ${leadMetric ? `<span class="officeadmin-scene-node-metric">${safeText(leadMetric.label)}: ${safeText(leadMetric.value)}</span>` : ""}
    </button>
  `;
}

function structuralPath(node) {
  const parts = ["System"];
  if (node?.lane) parts.push(laneMeta[node.lane]?.label || node.lane);
  if (node?.parent) {
    const parent = getNode(node.parent);
    if (parent) parts.push(parent.label);
  }
  if (node?.label) parts.push(node.label);
  return parts;
}

function renderSnapshot(data) {
  const generatedAt = byId("generatedAt");
  const generatedHost = byId("generatedHost");
  const warningList = byId("warningList");
  const snapshotStatsEl = byId("snapshotStats");
  if (!generatedAt || !generatedHost || !warningList || !snapshotStatsEl) return;

  generatedAt.textContent = formatDateTime(data.generatedAt);
  generatedHost.textContent = data.generatedOnHost || "n/a";

  warningList.innerHTML = asArray(data.warnings)
    .map((warning) => `<div class="officeadmin-warning officeadmin-warning-${warning.level || "info"}">${safeText(warning.message)}</div>`)
    .join("");

  const snapshotStats = [
    ["Modules", data.snapshot?.modules ?? 0],
    ["Commands", data.snapshot?.publicCommands ?? 0],
    ["Docs", data.snapshot?.docs ?? 0],
    ["Entity folders", data.snapshot?.entities ?? 0],
    ["Triples", data.snapshot?.mempalaceTriples ?? "n/a"],
    ["Sessions", data.snapshot?.openclawSessions ?? "n/a"],
  ];

  snapshotStatsEl.innerHTML = snapshotStats
    .map(
      ([label, value]) => `
        <div class="officeadmin-stat-card">
          <div class="officeadmin-stat-value">${safeText(value)}</div>
          <div class="officeadmin-stat-label">${safeText(label)}</div>
        </div>
      `
    )
    .join("");
}

function renderLaneRail() {
  const laneRail = byId("laneRail");
  if (!laneRail) return;
  laneRail.innerHTML = Object.entries(laneMeta)
    .map(
      ([laneId, lane]) => `
        <button class="officeadmin-lane-pill ${state.activeLane === laneId ? "active" : ""}" data-lane-id="${laneId}" type="button">
          <span>${safeText(lane.label)}</span>
        </button>
      `
    )
    .join("");

  laneRail.querySelectorAll(".officeadmin-lane-pill").forEach((button) => {
    button.addEventListener("click", () => {
      const laneId = button.dataset.laneId;
      state.activeLane = laneId;
      const laneNodes = state.model.nodes
        .filter((node) => node.lane === laneId)
        .sort((a, b) => a.order - b.order);
      if (laneNodes[0]) {
        setActiveNode(laneNodes[0].id, { preserveJourney: true });
      }
      renderExplorer();
    });
  });
}

function renderJourneyRail() {
  const journeyRail = byId("journeyRail");
  if (!journeyRail) return;
  journeyRail.innerHTML = journeyMeta
    .map(
      (journey) => `
        <button class="officeadmin-journey-chip ${state.activeJourney === journey.id ? "active" : ""}" data-journey-id="${journey.id}" type="button">
          ${safeText(journey.label)}
        </button>
      `
    )
    .join("");

  journeyRail.querySelectorAll(".officeadmin-journey-chip").forEach((button) => {
    button.addEventListener("click", () => {
      const journey = journeyById(button.dataset.journeyId);
      if (!journey) return;
      state.activeJourney = journey.id;
      state.history = [...journey.path];
      setActiveNode(journey.focusId || journey.path[journey.path.length - 1], {
        pushHistory: false,
        preserveJourney: true,
      });
      renderExplorer();
    });
  });
}

function renderJourneyBoard() {
  const board = byId("journeyBoard");
  if (!board) return;
  const journey = journeyById(state.activeJourney);
  if (!journey) {
    board.innerHTML = "";
    return;
  }

  board.innerHTML = `
    <div class="officeadmin-journey-summary">
      <div class="officeadmin-detail-label">Active route</div>
      <h3>${safeText(journey.label)}</h3>
      <p>${safeText(journey.summary)}</p>
    </div>
    <div class="officeadmin-journey-steps">
      ${journey.path
        .map((id, index) => {
          const node = getNode(id);
          if (!node) return "";
          return `
            <button class="officeadmin-journey-step ${state.activeId === node.id ? "active" : ""}" data-node-id="${node.id}" type="button">
              <span class="officeadmin-journey-step-count">${index + 1}</span>
              <span class="officeadmin-journey-step-label">${safeText(node.label)}</span>
            </button>
          `;
        })
        .join('<span class="officeadmin-journey-step-sep">→</span>')}
    </div>
  `;

  board.querySelectorAll(".officeadmin-journey-step").forEach((button) => {
    button.addEventListener("click", () => {
      setActiveNode(button.dataset.nodeId, { preserveJourney: true });
      renderExplorer();
    });
  });
}

function renderAtlas() {
  const atlasLanes = byId("atlasLanes");
  if (!atlasLanes) return;

  atlasLanes.innerHTML = Object.entries(laneMeta)
    .map(([laneId, lane]) => {
      const nodes = state.model.nodes
        .filter((node) => node.lane === laneId)
        .sort((a, b) => a.order - b.order);
      return `
        <div class="officeadmin-atlas-lane-row ${state.activeLane === laneId ? "active" : ""}" data-lane-row="${laneId}">
          <div class="officeadmin-atlas-lane-label">
            <span class="officeadmin-atlas-lane-dot officeadmin-lane-${laneId}"></span>
            <div>
              <strong>${safeText(lane.label)}</strong>
              <p>${safeText(lane.summary)}</p>
            </div>
          </div>
          <div class="officeadmin-atlas-track" data-track-lane="${laneId}">
            ${nodes
              .map((node) => {
                const journey = journeyById(state.activeJourney);
                const onJourney = journey?.path.includes(node.id);
                const connected = isConnectedToActive(node.id);
                return `
                  <button
                    class="officeadmin-atlas-stop
                      ${state.activeId === node.id ? "active" : ""}
                      ${connected ? "connected" : ""}
                      ${onJourney ? "journey" : ""}
                    "
                    data-node-id="${node.id}"
                    data-lane="${laneId}"
                    type="button"
                  >
                    <span class="officeadmin-atlas-stop-name">${safeText(node.label)}</span>
                    <span class="officeadmin-atlas-stop-type">${safeText(node.summary || node.type)}</span>
                  </button>
                `;
              })
              .join("")}
          </div>
        </div>
      `;
    })
    .join("");

  atlasLanes.querySelectorAll(".officeadmin-atlas-stop").forEach((button) => {
    button.addEventListener("click", () => {
      setActiveNode(button.dataset.nodeId, { preserveJourney: true });
      renderExplorer();
    });
  });

  requestAnimationFrame(drawAtlasLines);
}

function drawAtlasLines() {
  const atlas = byId("systemAtlas");
  const lines = byId("atlasLines");
  if (!atlas || !lines) return;

  const stops = [...atlas.querySelectorAll(".officeadmin-atlas-stop")];
  const stopMap = new Map(
    stops.map((element) => [element.dataset.nodeId, element])
  );
  const atlasRect = atlas.getBoundingClientRect();
  lines.setAttribute("viewBox", `0 0 ${atlas.clientWidth} ${atlas.clientHeight}`);

  const lineParts = [];
  const activeNodeEl = stopMap.get(state.activeId);

  function centerOf(element) {
    const rect = element.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2 - atlasRect.left,
      y: rect.top + rect.height / 2 - atlasRect.top,
    };
  }

  function curve(fromEl, toEl, className) {
    if (!fromEl || !toEl) return;
    const from = centerOf(fromEl);
    const to = centerOf(toEl);
    const midX = (from.x + to.x) / 2;
    lineParts.push(
      `<path class="${className}" d="M ${from.x} ${from.y} C ${midX} ${from.y}, ${midX} ${to.y}, ${to.x} ${to.y}"></path>`
    );
  }

  if (activeNodeEl) {
    const connections = activeConnections();
    connections.inbound.forEach((edge) => curve(stopMap.get(edge.from), activeNodeEl, "officeadmin-atlas-line officeadmin-atlas-line-active"));
    connections.outbound.forEach((edge) => curve(activeNodeEl, stopMap.get(edge.to), "officeadmin-atlas-line officeadmin-atlas-line-active"));
  }

  const journey = journeyById(state.activeJourney);
  if (journey) {
    for (let index = 0; index < journey.path.length - 1; index += 1) {
      curve(stopMap.get(journey.path[index]), stopMap.get(journey.path[index + 1]), "officeadmin-atlas-line officeadmin-atlas-line-journey");
    }
  }

  lines.innerHTML = lineParts.join("");
}

function renderBreadcrumbs() {
  const breadcrumbs = byId("breadcrumbs");
  if (!breadcrumbs) return;
  const node = getNode(state.activeId);
  const structure = structuralPath(node);
  const recent = state.history
    .slice(-5)
    .map((id) => getNode(id))
    .filter(Boolean);

  breadcrumbs.innerHTML = `
    <div class="officeadmin-breadcrumb-structure">
      ${structure.map((part, index) => `<span class="${index === structure.length - 1 ? "active" : ""}">${safeText(part)}</span>`).join('<span class="officeadmin-breadcrumb-sep">/</span>')}
    </div>
    <div class="officeadmin-breadcrumb-history">
      ${recent
        .map(
          (item) => `
            <button class="officeadmin-breadcrumb ${item.id === state.activeId ? "active" : ""}" data-node-id="${item.id}" type="button">
              ${safeText(item.label)}
            </button>
          `
        )
        .join("")}
    </div>
  `;

  breadcrumbs.querySelectorAll(".officeadmin-breadcrumb").forEach((button) => {
    button.addEventListener("click", () => {
      setActiveNode(button.dataset.nodeId, { preserveJourney: true, pushHistory: false });
      renderExplorer();
    });
  });
}

function renderScene() {
  const left = byId("focusLeft");
  const center = byId("focusCenter");
  const right = byId("focusRight");
  const related = byId("focusRelated");
  if (!left || !center || !right || !related) return;

  const node = getNode(state.activeId);
  const connections = activeConnections();
  const inboundNodes = connections.inbound.map((edge) => getNode(edge.from)).filter(Boolean);
  const outboundNodes = connections.outbound.map((edge) => getNode(edge.to)).filter(Boolean);
  const siblingNodes = state.model.nodes
    .filter((candidate) => candidate.lane === node.lane && candidate.id !== node.id)
    .sort((a, b) => a.order - b.order)
    .slice(0, 5);

  left.innerHTML = `
    <div class="officeadmin-scene-column-label">Feeds this stop</div>
    ${inboundNodes.length ? inboundNodes.map((item) => nodeButton(item, "officeadmin-scene-node-side")).join("") : '<div class="officeadmin-scene-empty">No incoming links.</div>'}
  `;
  center.innerHTML = `
    <div class="officeadmin-scene-center-copy">
      <div class="officeadmin-detail-label">${safeText(node.summary || node.type)}</div>
      <button class="officeadmin-scene-node officeadmin-scene-node-center" data-node-id="${node.id}" type="button">
        <span class="officeadmin-scene-node-label">${safeText(node.label)}</span>
        <span class="officeadmin-scene-node-type">${safeText(node.why || node.description)}</span>
      </button>
      <div class="officeadmin-inline-metrics">
        ${asArray(node.metrics)
          .slice(0, 3)
          .map((metric) => chip(metric.label, metric.value))
          .join("")}
      </div>
    </div>
  `;
  right.innerHTML = `
    <div class="officeadmin-scene-column-label">This stop feeds</div>
    ${outboundNodes.length ? outboundNodes.map((item) => nodeButton(item, "officeadmin-scene-node-side")).join("") : '<div class="officeadmin-scene-empty">No outgoing links.</div>'}
  `;
  related.innerHTML = siblingNodes.length
    ? siblingNodes
        .map((item) => `<button class="officeadmin-related-chip" data-node-id="${item.id}" type="button">${safeText(item.label)}</button>`)
        .join("")
    : `<div class="officeadmin-related-empty">No sibling stops in this lane.</div>`;

  document.querySelectorAll("[data-node-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      const target = event.currentTarget.dataset.nodeId;
      if (!target || !getNode(target)) return;
      setActiveNode(target, { preserveJourney: true });
      renderExplorer();
    });
  });
}

function detailTabButton(id, label) {
  return `<button class="officeadmin-detail-tab ${state.activeTab === id ? "active" : ""}" data-tab-id="${id}" type="button">${label}</button>`;
}

function renderDetail() {
  const tabs = byId("detailTabs");
  const panel = byId("detailPanel");
  if (!tabs || !panel) return;

  const node = getNode(state.activeId);
  const connections = activeConnections();
  const repo = asArray(state.data.repos).find((item) => item.id === node.id || item.id === node.parent);
  const machine = asArray(state.data.machines).find((item) => node.label.toLowerCase().includes(item.label.split(" ")[0].toLowerCase()));

  tabs.innerHTML = [
    detailTabButton("overview", "Overview"),
    detailTabButton("owns", "Owns"),
    detailTabButton("connects", "Connects"),
    detailTabButton("status", "Status"),
  ].join("");

  const inbound = connections.inbound
    .map((edge) => {
      const source = getNode(edge.from);
      if (!source) return "";
      return `<li><strong>${safeText(source.label)}</strong>, ${safeText(edge.label)}.</li>`;
    })
    .join("");
  const outbound = connections.outbound
    .map((edge) => {
      const target = getNode(edge.to);
      if (!target) return "";
      return `<li><strong>${safeText(target.label)}</strong>, ${safeText(edge.label)}.</li>`;
    })
    .join("");
  const metrics = asArray(node.metrics).map((metric) => chip(metric.label, metric.value)).join("");

  const views = {
    overview: `
      <div class="officeadmin-detail-label">${safeText(node.summary || node.type)}</div>
      <h3>${safeText(node.label)}</h3>
      <p>${safeText(node.why || node.description)}</p>
      <p><code>${safeText(node.path)}</code></p>
      <div class="officeadmin-inline-metrics">${metrics}</div>
    `,
    owns: `
      <div class="officeadmin-detail-label">Owns or should own</div>
      <h3>${safeText(node.label)}</h3>
      <ul class="officeadmin-bullet-list">
        ${asArray(node.owns).length ? asArray(node.owns).map((item) => `<li>${safeText(item)}</li>`).join("") : "<li>No explicit ownership notes yet.</li>"}
      </ul>
    `,
    connects: `
      <div class="officeadmin-detail-label">Connection paths</div>
      <h3>${safeText(node.label)}</h3>
      <div class="officeadmin-two-col">
        <div>
          <h4 class="officeadmin-subhead">Feeds into this</h4>
          <ul class="officeadmin-bullet-list">${inbound || "<li>No inbound connections.</li>"}</ul>
        </div>
        <div>
          <h4 class="officeadmin-subhead">This feeds into</h4>
          <ul class="officeadmin-bullet-list">${outbound || "<li>No outbound connections.</li>"}</ul>
        </div>
      </div>
    `,
    status: `
      <div class="officeadmin-detail-label">Status and location</div>
      <h3>${safeText(node.label)}</h3>
      <div class="officeadmin-inline-metrics">${metrics || chip("State", "No metrics")}</div>
      ${repo ? `<p class="officeadmin-small-copy"><code>${safeText(repo.path)}</code></p>` : ""}
      ${repo?.lastCommit?.subject ? `<p class="officeadmin-small-copy">${safeText(repo.lastCommit.subject)}</p>` : ""}
      ${machine ? `<ul class="officeadmin-bullet-list"><li>${safeText(machine.label)}, ${safeText(machine.role || "machine")}.</li></ul>` : ""}
    `,
  };

  panel.innerHTML = views[state.activeTab] || views.overview;

  tabs.querySelectorAll(".officeadmin-detail-tab").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeTab = button.dataset.tabId;
      renderDetail();
    });
  });
}

function renderSearch() {
  const input = byId("nodeSearch");
  const results = byId("searchResults");
  if (!input || !results) return;

  function paint() {
    const query = input.value.trim().toLowerCase();
    if (!query) {
      results.innerHTML = "";
      results.classList.remove("open");
      return;
    }

    const matches = state.model.nodes
      .filter((node) => {
        const haystack = [
          node.label,
          node.summary,
          node.description,
          node.why,
          ...asArray(node.owns),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      })
      .slice(0, 8);

    results.innerHTML = matches
      .map(
        (node) => `
          <button class="officeadmin-search-result" data-node-id="${node.id}" type="button">
            <strong>${safeText(node.label)}</strong>
            <span>${safeText(node.summary || node.type)}</span>
          </button>
        `
      )
      .join("");
    results.classList.toggle("open", matches.length > 0);

    results.querySelectorAll(".officeadmin-search-result").forEach((button) => {
      button.addEventListener("click", () => {
        input.value = "";
        results.innerHTML = "";
        results.classList.remove("open");
        setActiveNode(button.dataset.nodeId, { preserveJourney: true });
        renderExplorer();
      });
    });
  }

  input.oninput = paint;
}

function setActiveNode(id, options = {}) {
  const node = getNode(id);
  if (!node) return;
  state.activeId = id;
  state.activeLane = node.lane || state.activeLane;
  state.activeTab = "overview";
  if (options.pushHistory !== false && state.history[state.history.length - 1] !== id) {
    state.history.push(id);
  }
  if (options.preserveJourney === false) {
    state.activeJourney = null;
  }
}

function renderExplorer() {
  renderLaneRail();
  renderJourneyRail();
  renderJourneyBoard();
  renderAtlas();
  renderBreadcrumbs();
  renderScene();
  renderDetail();
}

function renderRepos(data) {
  const repoGrid = byId("repoGrid");
  if (!repoGrid) return;
  repoGrid.innerHTML = asArray(data.repos)
    .map((repo) => {
      const presentation = repoPresentation[repo.id] || {
        label: repo.label,
        role: "Tracked surface",
        authority: "Git backed system surface.",
        source: "Tracked surface",
      };
      return `
        <div class="overview-card">
          <div class="officeadmin-detail-label">${safeText(presentation.source)}</div>
          <h3>${safeText(presentation.label)}</h3>
          <p>${safeText(presentation.authority)}</p>
          <div class="officeadmin-inline-metrics">
            ${chip("Role", presentation.role)}
            ${chip("Files", repo.trackedFileCount ?? "n/a")}
            ${chip("Branch", repo.branch || "n/a")}
          </div>
          <p class="officeadmin-small-copy"><code>${safeText(repo.path)}</code></p>
        </div>
      `;
    })
    .join("");
}

function renderAuthorityModel(data) {
  const sourceList = byId("sourceOfTruthList");
  const generatedList = byId("generatedSourcesList");
  const target = byId("authorityCards");
  const toggle = byId("authorityToggle");
  if (!sourceList || !generatedList || !target) return;

  sourceList.innerHTML = asArray(data.roadmap?.sourceOfTruth).map((line) => `<li>${safeText(line)}</li>`).join("");
  generatedList.innerHTML = asArray(data.generatedSources)
    .map((source) => `<li><strong>${safeText(source.label)}</strong>, <code>${safeText(source.path)}</code>, ${source.present ? "present" : "missing"}.</li>`)
    .join("");

  const items = asArray(data.authorities);
  let expanded = false;

  function paint() {
    const visible = expanded ? items : items.slice(0, 4);
    target.innerHTML = visible
      .map(
        (row) => `
          <div class="overview-card officeadmin-authority-card">
            <div class="officeadmin-detail-label">${safeText(row.category)}</div>
            <h3>${safeText(row.domain)}</h3>
            <p><code>${safeText(row.where || "n/a")}</code></p>
            <p>${safeText(row.sourceOfTruth)}</p>
          </div>
        `
      )
      .join("");
    if (toggle) {
      toggle.hidden = items.length <= 4;
      toggle.textContent = expanded ? "Show fewer authorities" : "Show more authorities";
    }
  }

  if (toggle) {
    toggle.onclick = () => {
      expanded = !expanded;
      paint();
    };
  }

  paint();
}

function renderWorkstreams(data) {
  const target = byId("workstreams");
  const toggle = byId("workstreamToggle");
  if (!target) return;
  const items = asArray(data.roadmap?.workstreams);
  let expanded = false;

  function paint() {
    const visible = expanded ? items : items.slice(0, 4);
    target.innerHTML = visible
      .map((workstream) => {
        const bullets = []
          .concat(asArray(workstream.deliverables))
          .concat(asArray(workstream.output))
          .concat(asArray(workstream.nearTermOutcomes))
          .slice(0, 3)
          .map((item) => `<li>${safeText(item)}</li>`)
          .join("");
        return `
          <div class="overview-card">
            <div class="officeadmin-detail-label">Workstream</div>
            <h3>${safeText(workstream.title)}</h3>
            <p>${safeText(workstream.goal || "Goal not parsed.")}</p>
            <ul class="officeadmin-bullet-list">${bullets}</ul>
          </div>
        `;
      })
      .join("");
    if (toggle) {
      toggle.hidden = items.length <= 4;
      toggle.textContent = expanded ? "Show fewer workstreams" : "Show more workstreams";
    }
  }

  if (toggle) {
    toggle.onclick = () => {
      expanded = !expanded;
      paint();
    };
  }

  paint();
}

function renderHealth(data) {
  const docsSummary = byId("docsSummary");
  const moduleSummary = byId("moduleSummary");
  if (!docsSummary || !moduleSummary) return;

  docsSummary.innerHTML = `
    <div class="officeadmin-inline-metrics">
      ${chip("Docs", data.docs?.count || 0)}
      ${chip("Current", data.docs?.byStatus?.current || 0)}
      ${chip("WIP", data.docs?.byStatus?.["work-in-progress"] || 0)}
      ${chip("Stale", data.docs?.staleCount || 0)}
    </div>
    <div class="officeadmin-chip-list">
      ${Object.entries(data.docs?.byConfidence || {})
        .map(([label, value]) => `<span class="officeadmin-chip">${safeText(label)}: ${safeText(value)}</span>`)
        .join("")}
    </div>
  `;

  moduleSummary.innerHTML = `
    <div class="officeadmin-inline-metrics">
      ${chip("Modules", data.modules?.count || 0)}
      ${chip("Daemons", data.modules?.daemonCount || 0)}
      ${chip("Commands", data.modules?.publicCommands || 0)}
      ${chip("Skills", data.modules?.publicSkills || 0)}
    </div>
    <div class="officeadmin-chip-list">
      ${Object.entries(data.modules?.byMachine || {})
        .map(([label, value]) => `<span class="officeadmin-chip">${safeText(label)}: ${safeText(value)}</span>`)
        .join("")}
    </div>
  `;
}

function renderMachines(data) {
  const machineGrid = byId("machineGrid");
  if (!machineGrid) return;
  machineGrid.innerHTML = asArray(data.machines)
    .map(
      (machine) => `
        <div class="overview-card">
          <div class="officeadmin-detail-label">${safeText(machine.role || "machine")}</div>
          <h3>${safeText(machine.label)}</h3>
          <p>${machine.hostname ? `Hostname: ${safeText(machine.hostname)}. ` : ""}${machine.tailscale ? `Tailscale: ${safeText(machine.tailscale)}.` : ""}</p>
          <ul class="officeadmin-bullet-list">
            ${asArray(machine.notes).slice(0, 4).map((note) => `<li>${safeText(note)}</li>`).join("")}
          </ul>
        </div>
      `
    )
    .join("");
}

async function loadOfficeAdmin() {
  try {
    const response = await fetch("./data/system-map.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    state.data = data;
    state.model = buildModel(data);
    state.adjacency = adjacencyFor(state.model);

    const initialJourney = journeyById(state.activeJourney);
    setActiveNode(initialJourney?.focusId || "aiva", { pushHistory: false, preserveJourney: true });

    renderSnapshot(data);
    renderExplorer();
    renderSearch();
    renderRepos(data);
    renderAuthorityModel(data);
    renderWorkstreams(data);
    renderHealth(data);
    renderMachines(data);

    window.addEventListener("resize", () => {
      drawAtlasLines();
    });
  } catch (error) {
    console.error("Could not load generated system data", error);
    const fallbackTargets = [
      byId("generatedAt"),
      byId("generatedHost"),
      byId("detailPanel"),
    ].filter(Boolean);
    fallbackTargets.forEach((target) => {
      if (target.id === "detailPanel") {
        target.innerHTML = `<div class="officeadmin-detail-empty">Could not load generated system data.</div>`;
      } else {
        target.textContent = "Load failed";
      }
    });
  }
}

loadOfficeAdmin();
