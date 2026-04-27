function byId(id) {
  return document.getElementById(id);
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

const laneMeta = {
  runtime: {
    label: "Runtime",
    summary: "What actually runs and executes the system.",
    color: "runtime",
  },
  workspace: {
    label: "Workspace",
    summary: "Where durable work state and operator context live.",
    color: "workspace",
  },
  memory: {
    label: "Memory",
    summary: "How context persists and becomes recallable.",
    color: "memory",
  },
  authority: {
    label: "Authorities",
    summary: "What systems own truth instead of just mirroring it.",
    color: "authority",
  },
  archive: {
    label: "Archives",
    summary: "Where mirrored and cold history is stored.",
    color: "archive",
  },
};

const rootProfiles = {
  aiva: {
    lane: "runtime",
    role: "Runtime core",
    why: "AIVA is the orchestration center. If you want to know how the system actually behaves, this is usually the first place to look.",
    owns: [
      "Module orchestration and generated command surfaces",
      "Shared runtime state policy",
      "Routing into Apple apps, Google, archives, and memory",
    ],
  },
  openclaw: {
    lane: "runtime",
    role: "Attached AI runtime",
    why: "OpenClaw is not the system core, but it is a major runtime participant for chat, cron, subagents, and session generation.",
    owns: [
      "Chat and gateway runtime",
      "Subagent sessions and cron runs",
      "Session output that feeds memory extraction",
    ],
  },
  mikeshaffer: {
    lane: "workspace",
    role: "Operator workspace",
    why: "This is the durable work surface. It is where entities, doctrine, drafts, memory notes, and structured operating state live.",
    owns: [
      "Entity folders and work memory",
      "Doctrine and operating rules",
      "Long-lived business and personal work state",
    ],
  },
  "officeadmin-site": {
    lane: "workspace",
    role: "Read only surface",
    why: "This site should explain and navigate the system, not own it. It is a lens over the real sources of truth.",
    owns: [
      "Visual navigation and explanation",
      "Generated system map surface",
      "No primary business or runtime truth",
    ],
  },
  mempalace: {
    lane: "memory",
    role: "Long term graph memory",
    why: "MemPalace is where extracted entities, notes, and triples become durable contextual memory.",
    owns: [
      "Temporal knowledge graph",
      "Long term extracted context",
      "Recall substrate for dossier and context building",
    ],
  },
  "apple-apps": {
    lane: "authority",
    role: "Native authority layer",
    why: "These are native, human-facing systems that own real data instead of derived copies.",
    owns: [
      "Contacts identity authority",
      "Notes, Reminders, Calendar, Messages source layers",
      "Native user state that should not be duplicated casually",
    ],
  },
  "google-workspace": {
    lane: "authority",
    role: "Live collaboration authority",
    why: "Google Workspace is still the live authority for active email, shared docs, chat, and some calendar workflows.",
    owns: [
      "Gmail and live communication state",
      "Shared office documents and collaboration",
      "Live cloud workflow surfaces before archive/mirror",
    ],
  },
  archives: {
    lane: "archive",
    role: "Mirror and cold storage",
    why: "Archives are not the live authority, but they preserve history and let the system retain older state without paying for all of it in Google forever.",
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
    label: "How context is assembled",
    path: ["google-workspace", "apple-apps", "aiva", "mempalace", "mikeshaffer"],
  },
  {
    id: "work",
    label: "Where work actually lives",
    path: ["aiva", "mikeshaffer", "officeadmin-site"],
  },
  {
    id: "archives",
    label: "How live systems become archives",
    path: ["google-workspace", "aiva", "archives"],
  },
  {
    id: "runtime",
    label: "What actually runs the system",
    path: ["openclaw", "aiva", "apple-apps", "google-workspace"],
  },
];

function buildModel(data) {
  const nodes = [];
  const edges = data.edges || [];

  Object.entries(laneMeta).forEach(([id, lane]) => {
    nodes.push({
      id,
      label: lane.label,
      type: "lane",
      lane: id,
      summary: lane.summary,
      description: lane.summary,
      metrics: [],
      path: `System / ${lane.label}`,
      owns: (data.roots || [])
        .filter((root) => rootProfiles[root.id]?.lane === id)
        .map((root) => root.label),
    });
  });

  (data.roots || []).forEach((root) => {
    const profile = rootProfiles[root.id] || {};
    nodes.push({
      id: root.id,
      label: root.label,
      type: root.type,
      lane: profile.lane || "workspace",
      summary: profile.role || root.type,
      description: root.description,
      metrics: root.metrics || [],
      path: `System / ${(laneMeta[profile.lane || "workspace"] || {}).label || "Workspace"} / ${root.label}`,
      owns: profile.owns || [],
      why: profile.why || root.description,
      raw: root,
    });
    edges.push({
      from: profile.lane || "workspace",
      to: root.id,
      label: "contains",
      kind: "lane",
    });
  });

  return {
    nodes,
    edges,
  };
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

const state = {
  data: null,
  model: null,
  adjacency: null,
  activeId: "aiva",
  activeLane: null,
  activeTab: "overview",
  history: ["aiva"],
  activeJourney: null,
  searchOpen: false,
};

function renderSnapshot(data) {
  const generatedAt = byId("generatedAt");
  const generatedHost = byId("generatedHost");
  const warningList = byId("warningList");
  const snapshotStatsEl = byId("snapshotStats");
  if (!generatedAt || !generatedHost || !warningList || !snapshotStatsEl) return;

  generatedAt.textContent = formatDateTime(data.generatedAt);
  generatedHost.textContent = data.generatedOnHost || "n/a";

  warningList.innerHTML = (data.warnings || [])
    .map(
      (warning) =>
        `<div class="officeadmin-warning officeadmin-warning-${warning.level || "info"}">${warning.message}</div>`
    )
    .join("");

  const snapshotStats = [
    ["Modules", data.snapshot.modules],
    ["Commands", data.snapshot.publicCommands],
    ["Docs", data.snapshot.docs],
    ["Entity folders", data.snapshot.entities],
    ["Triples", data.snapshot.mempalaceTriples],
    ["Sessions", data.snapshot.openclawSessions],
  ];

  snapshotStatsEl.innerHTML = snapshotStats
    .map(
      ([label, value]) => `
        <div class="officeadmin-stat-card">
          <div class="officeadmin-stat-value">${value}</div>
          <div class="officeadmin-stat-label">${label}</div>
        </div>
      `
    )
    .join("");
}

function getNode(id) {
  return state.model.nodes.find((node) => node.id === id) || null;
}

function nodeButton(node, columnClass) {
  const leadMetric = (node.metrics || [])[0];
  return `
    <button class="officeadmin-scene-node ${columnClass}" data-node-id="${node.id}" type="button">
      <span class="officeadmin-scene-node-label">${node.label}</span>
      <span class="officeadmin-scene-node-type">${node.summary || node.type}</span>
      ${leadMetric ? `<span class="officeadmin-scene-node-metric">${leadMetric.label}: ${leadMetric.value}</span>` : ""}
    </button>
  `;
}

function activeConnections() {
  return state.adjacency.get(state.activeId) || { inbound: [], outbound: [] };
}

function renderLaneRail() {
  const laneRail = byId("laneRail");
  if (!laneRail) return;
  laneRail.innerHTML = Object.entries(laneMeta)
    .map(
      ([laneId, lane]) => `
        <button class="officeadmin-lane-pill ${state.activeLane === laneId ? "active" : ""}" data-lane-id="${laneId}" type="button">
          <span>${lane.label}</span>
        </button>
      `
    )
    .join("");

  laneRail.querySelectorAll(".officeadmin-lane-pill").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeLane = button.dataset.laneId;
      const first = state.model.nodes.find((node) => node.lane === state.activeLane && node.type !== "lane");
      if (first) setActiveNode(first.id, { preserveJourney: false });
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
          ${journey.label}
        </button>
      `
    )
    .join("");

  journeyRail.querySelectorAll(".officeadmin-journey-chip").forEach((button) => {
    button.addEventListener("click", () => {
      const journey = journeyMeta.find((item) => item.id === button.dataset.journeyId);
      if (!journey) return;
      state.activeJourney = journey.id;
      if (journey.path[0]) {
        state.history = [...journey.path];
        setActiveNode(journey.path[journey.path.length - 1], { pushHistory: false, preserveJourney: true });
      }
      renderExplorer();
    });
  });
}

function renderBreadcrumbs() {
  const breadcrumbs = byId("breadcrumbs");
  if (!breadcrumbs) return;
  const path = state.history.slice(-5).map((id) => getNode(id)).filter(Boolean);
  breadcrumbs.innerHTML = path
    .map(
      (node, index) => `
        <button class="officeadmin-breadcrumb ${index === path.length - 1 ? "active" : ""}" data-node-id="${node.id}" type="button">
          ${node.label}
        </button>
      `
    )
    .join('<span class="officeadmin-breadcrumb-sep">/</span>');

  breadcrumbs.querySelectorAll(".officeadmin-breadcrumb").forEach((button) => {
    button.addEventListener("click", () => {
      setActiveNode(button.dataset.nodeId, { pushHistory: false, preserveJourney: false });
      const index = state.history.lastIndexOf(button.dataset.nodeId);
      if (index >= 0) state.history = state.history.slice(0, index + 1);
      renderExplorer();
    });
  });
}

function renderScene() {
  const left = byId("focusLeft");
  const center = byId("focusCenter");
  const right = byId("focusRight");
  const related = byId("focusRelated");
  const lines = byId("focusSceneLines");
  if (!left || !center || !right || !related || !lines) return;

  const node = getNode(state.activeId);
  const connections = activeConnections();
  const inboundNodes = connections.inbound.map((edge) => getNode(edge.from)).filter(Boolean);
  const outboundNodes = connections.outbound.map((edge) => getNode(edge.to)).filter(Boolean);
  const siblingNodes = state.model.nodes
    .filter((candidate) => candidate.lane === node.lane && candidate.id !== node.id && candidate.type !== "lane")
    .slice(0, 5);

  left.innerHTML = inboundNodes.map((item) => nodeButton(item, "officeadmin-scene-node-side")).join("");
  center.innerHTML = `
    <button class="officeadmin-scene-node officeadmin-scene-node-center" data-node-id="${node.id}" type="button">
      <span class="officeadmin-scene-node-label">${node.label}</span>
      <span class="officeadmin-scene-node-type">${node.summary || node.type}</span>
      <span class="officeadmin-scene-node-copy">${node.why || node.description}</span>
    </button>
  `;
  right.innerHTML = outboundNodes.map((item) => nodeButton(item, "officeadmin-scene-node-side")).join("");
  related.innerHTML = siblingNodes.length
    ? siblingNodes
        .map(
          (item) =>
            `<button class="officeadmin-related-chip" data-node-id="${item.id}" type="button">${item.label}</button>`
        )
        .join("")
    : `<div class="officeadmin-related-empty">No sibling nodes in this lane.</div>`;

  document
    .querySelectorAll("[data-node-id]")
    .forEach((button) =>
      button.addEventListener("click", (event) => {
        const target = event.currentTarget.dataset.nodeId;
        if (!target) return;
        setActiveNode(target, { preserveJourney: false });
        renderExplorer();
      })
    );

  requestAnimationFrame(drawSceneLines);
}

function drawSceneLines() {
  const scene = byId("focusScene");
  const lines = byId("focusSceneLines");
  const centerNode = scene?.querySelector(".officeadmin-scene-node-center");
  if (!scene || !lines || !centerNode) return;

  const sceneRect = scene.getBoundingClientRect();
  const centerRect = centerNode.getBoundingClientRect();
  const cx = centerRect.left + centerRect.width / 2 - sceneRect.left;
  const cy = centerRect.top + centerRect.height / 2 - sceneRect.top;

  const nodes = [...scene.querySelectorAll(".officeadmin-scene-node-side")];
  lines.setAttribute("viewBox", `0 0 ${scene.clientWidth} ${scene.clientHeight}`);
  lines.innerHTML = nodes
    .map((node) => {
      const rect = node.getBoundingClientRect();
      const x = rect.left + rect.width / 2 - sceneRect.left;
      const y = rect.top + rect.height / 2 - sceneRect.top;
      return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}"></line>`;
    })
    .join("");
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

  tabs.innerHTML = [
    detailTabButton("overview", "Overview"),
    detailTabButton("owns", "Owns"),
    detailTabButton("connects", "Connects"),
    detailTabButton("status", "Status"),
  ].join("");

  const inbound = connections.inbound
    .map((edge) => getNode(edge.from))
    .filter(Boolean)
    .map((item) => `<li>${item.label}</li>`)
    .join("");
  const outbound = connections.outbound
    .map((edge) => getNode(edge.to))
    .filter(Boolean)
    .map((item) => `<li>${item.label}</li>`)
    .join("");
  const metrics = (node.metrics || []).map((metric) => chip(metric.label, metric.value)).join("");
  const repo = state.data.repos.find((item) => item.id === node.id);
  const machineHints = (state.data.machines || [])
    .filter((machine) => (node.label || "").toLowerCase().includes("aiva") ? machine.id.includes("aiva") : false)
    .map((machine) => `<li>${machine.label}, ${machine.role || "machine"}.</li>`)
    .join("");

  const views = {
    overview: `
      <div class="officeadmin-detail-label">${node.summary || node.type}</div>
      <h3>${node.label}</h3>
      <p>${node.why || node.description}</p>
      <p><code>${node.path}</code></p>
      <div class="officeadmin-inline-metrics">${metrics}</div>
    `,
    owns: `
      <div class="officeadmin-detail-label">Owns</div>
      <h3>${node.label}</h3>
      <ul class="officeadmin-bullet-list">${(node.owns || []).map((item) => `<li>${item}</li>`).join("") || "<li>No explicit ownership notes yet.</li>"}</ul>
    `,
    connects: `
      <div class="officeadmin-detail-label">Connections</div>
      <h3>${node.label}</h3>
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
      <div class="officeadmin-detail-label">Status</div>
      <h3>${node.label}</h3>
      <div class="officeadmin-inline-metrics">${metrics || chip("State", "No metrics")}</div>
      ${repo ? `<p class="officeadmin-small-copy"><code>${repo.path}</code></p>` : ""}
      ${repo ? `<p class="officeadmin-small-copy">${repo.lastCommit?.subject || "No commit note available."}</p>` : ""}
      ${machineHints ? `<ul class="officeadmin-bullet-list">${machineHints}</ul>` : ""}
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
      .filter((node) => node.type !== "lane")
      .filter((node) => node.label.toLowerCase().includes(query) || (node.summary || "").toLowerCase().includes(query))
      .slice(0, 8);
    results.innerHTML = matches
      .map(
        (node) => `
          <button class="officeadmin-search-result" data-node-id="${node.id}" type="button">
            <strong>${node.label}</strong>
            <span>${node.summary || node.type}</span>
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
        setActiveNode(button.dataset.nodeId, { preserveJourney: false });
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
  if (options.pushHistory !== false) {
    if (state.history[state.history.length - 1] !== id) {
      state.history.push(id);
    }
  }
  if (!options.preserveJourney) state.activeJourney = null;
}

function renderExplorer() {
  renderLaneRail();
  renderJourneyRail();
  renderBreadcrumbs();
  renderScene();
  renderDetail();
}

function renderRepos(data) {
  const repoGrid = byId("repoGrid");
  if (!repoGrid) return;
  repoGrid.innerHTML = (data.repos || [])
    .map((repo) => {
      const presentation = repoPresentation[repo.id] || {
        label: repo.label,
        role: "Tracked surface",
        authority: "Git backed system surface.",
        source: "Tracked surface",
      };
      return `
        <div class="overview-card">
          <div class="officeadmin-detail-label">${presentation.source}</div>
          <h3>${presentation.label}</h3>
          <p>${presentation.authority}</p>
          <div class="officeadmin-inline-metrics">
            ${chip("Role", presentation.role)}
            ${chip("Files", repo.trackedFileCount ?? "n/a")}
            ${chip("Branch", repo.branch || "n/a")}
          </div>
          <p class="officeadmin-small-copy"><code>${repo.path}</code></p>
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

  sourceList.innerHTML = (data.roadmap?.sourceOfTruth || [])
    .map((line) => `<li>${line}</li>`)
    .join("");

  generatedList.innerHTML = (data.generatedSources || [])
    .map((source) => `<li><strong>${source.label}</strong>, <code>${source.path}</code>, ${source.present ? "present" : "missing"}.</li>`)
    .join("");

  const items = data.authorities || [];
  let expanded = false;

  function paint() {
    const visible = expanded ? items : items.slice(0, 4);
    target.innerHTML = visible
      .map(
        (row) => `
          <div class="overview-card officeadmin-authority-card">
            <div class="officeadmin-detail-label">${row.category}</div>
            <h3>${row.domain}</h3>
            <p><code>${row.where || "n/a"}</code></p>
            <p>${row.sourceOfTruth}</p>
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
  const items = data.roadmap?.workstreams || [];
  let expanded = false;

  function paint() {
    const visible = expanded ? items : items.slice(0, 4);
    target.innerHTML = visible
      .map((workstream) => {
        const bullets = []
          .concat(workstream.deliverables || [])
          .concat(workstream.output || [])
          .concat(workstream.nearTermOutcomes || [])
          .slice(0, 3)
          .map((item) => `<li>${item}</li>`)
          .join("");
        return `
          <div class="overview-card">
            <div class="officeadmin-detail-label">Workstream</div>
            <h3>${workstream.title}</h3>
            <p>${workstream.goal || "Goal not parsed."}</p>
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
        .map(([label, value]) => `<span class="officeadmin-chip">${label}: ${value}</span>`)
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
        .map(([label, value]) => `<span class="officeadmin-chip">${label}: ${value}</span>`)
        .join("")}
    </div>
  `;
}

function renderMachines(data) {
  const machineGrid = byId("machineGrid");
  if (!machineGrid) return;
  machineGrid.innerHTML = (data.machines || [])
    .map(
      (machine) => `
        <div class="overview-card">
          <div class="officeadmin-detail-label">${machine.role || "machine"}</div>
          <h3>${machine.label}</h3>
          <p>${machine.hostname ? `Hostname: ${machine.hostname}. ` : ""}${machine.tailscale ? `Tailscale: ${machine.tailscale}.` : ""}</p>
          <ul class="officeadmin-bullet-list">
            ${(machine.notes || []).slice(0, 4).map((note) => `<li>${note}</li>`).join("")}
          </ul>
        </div>
      `
    )
    .join("");
}

function updatePlanDoc() {
  return null;
}

async function loadOfficeAdmin() {
  try {
    const response = await fetch("./data/system-map.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    state.data = data;
    state.model = buildModel(data);
    state.adjacency = adjacencyFor(state.model);
    setActiveNode("aiva", { pushHistory: false, preserveJourney: false });
    renderSnapshot(data);
    renderExplorer();
    renderSearch();
    renderRepos(data);
    renderAuthorityModel(data);
    renderWorkstreams(data);
    renderHealth(data);
    renderMachines(data);
    window.addEventListener("resize", drawSceneLines);
  } catch (error) {
    const warningList = byId("warningList");
    if (warningList) {
      warningList.innerHTML = `<div class="officeadmin-warning officeadmin-warning-error">Could not load generated system data, ${error.message}.</div>`;
    }
  }
}

loadOfficeAdmin();
