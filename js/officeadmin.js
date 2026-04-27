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

const lanePresentation = {
  runtime: {
    label: "Runtime",
    summary: "What runs the system and executes work.",
    roots: ["aiva", "openclaw"],
  },
  workspace: {
    label: "Workspace",
    summary: "Where durable work state and operator memory live.",
    roots: ["mikeshaffer", "officeadmin-site"],
  },
  memory: {
    label: "Memory",
    summary: "How context survives across time and sessions.",
    roots: ["mempalace"],
  },
  authority: {
    label: "Authorities",
    summary: "The systems that actually own truth.",
    roots: ["apple-apps", "google-workspace"],
  },
  archive: {
    label: "Archives",
    summary: "Cold storage and mirrored history.",
    roots: ["archives"],
  },
};

function buildAdjacency(edges) {
  const map = new Map();
  for (const edge of edges || []) {
    if (!map.has(edge.from)) map.set(edge.from, []);
    if (!map.has(edge.to)) map.set(edge.to, []);
    map.get(edge.from).push({ id: edge.to, label: edge.label, direction: "out" });
    map.get(edge.to).push({ id: edge.from, label: edge.label, direction: "in" });
  }
  return map;
}

function renderSnapshot(data) {
  document.getElementById("generatedAt").textContent = formatDateTime(data.generatedAt);
  document.getElementById("generatedHost").textContent = data.generatedOnHost || "n/a";

  const warningList = document.getElementById("warningList");
  warningList.innerHTML = (data.warnings || [])
    .map(
      (warning) =>
        `<div class="officeadmin-warning officeadmin-warning-${warning.level || "info"}">${warning.message}</div>`
    )
    .join("");

  const snapshotStats = [
    ["Modules", data.snapshot.modules],
    ["Public commands", data.snapshot.publicCommands],
    ["Docs", data.snapshot.docs],
    ["Stale docs", data.snapshot.staleDocs],
    ["Entity folders", data.snapshot.entities],
    ["MemPalace triples", data.snapshot.mempalaceTriples],
    ["OpenClaw sessions", data.snapshot.openclawSessions],
    ["Drive archive", data.snapshot.driveArchive],
  ];

  document.getElementById("snapshotStats").innerHTML = snapshotStats
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

function renderGraph(data) {
  const storyRail = document.getElementById("storyRail");
  const rootGrid = document.getElementById("rootGrid");
  const edgeList = document.getElementById("edgeList");
  const rootsById = new Map((data.roots || []).map((root) => [root.id, root]));
  const adjacency = buildAdjacency(data.edges || []);

  const detail = document.getElementById("graphDetail");

  storyRail.innerHTML = Object.entries(lanePresentation)
    .map(
      ([laneId, lane]) => `
        <button class="officeadmin-story-card" data-lane-id="${laneId}" type="button">
          <span class="officeadmin-story-title">${lane.label}</span>
          <span class="officeadmin-story-copy">${lane.summary}</span>
        </button>
      `
    )
    .join("");

  rootGrid.innerHTML = (data.roots || [])
    .map((root) => {
      const leadMetric = (root.metrics || [])[0];
      return `
        <button class="officeadmin-root-card ${root.present ? "present" : "missing"}" data-root-id="${root.id}" type="button">
          <div class="officeadmin-root-card-top">
            <span class="officeadmin-root-title">${root.label}</span>
            <span class="officeadmin-root-type">${root.type}</span>
          </div>
          <p class="officeadmin-root-copy">${root.description}</p>
          ${
            leadMetric
              ? `<div class="officeadmin-root-metric"><span>${leadMetric.label}</span><strong>${leadMetric.value}</strong></div>`
              : ""
          }
        </button>
      `;
    })
    .join("");

  edgeList.innerHTML = (data.edges || [])
    .map((edge) => {
      const from = rootsById.get(edge.from);
      const to = rootsById.get(edge.to);
      if (!from || !to) return "";
      return `
        <div class="officeadmin-edge-chip">
          <strong>${from.label}</strong>
          <span>${edge.label}</span>
          <strong>${to.label}</strong>
        </div>
      `;
    })
    .join("");

  function showRoot(rootId) {
    const root = rootsById.get(rootId);
    if (!root) return;
    const connected = (adjacency.get(rootId) || [])
      .map((item) => {
        const target = rootsById.get(item.id);
        if (!target) return "";
        return `
          <button class="officeadmin-connection-chip" type="button" data-root-id="${target.id}">
            <strong>${item.direction === "out" ? "Feeds" : "Reads"}</strong>
            <span>${target.label}</span>
          </button>
        `;
      })
      .join("");

    detail.innerHTML = `
      <div class="officeadmin-detail-label">${root.type}</div>
      <h3>${root.label}</h3>
      <p>${root.description}</p>
      <p><code>${root.path}</code></p>
      <div class="officeadmin-inline-metrics">
        ${(root.metrics || []).map((metric) => chip(metric.label, metric.value)).join("")}
      </div>
      <div class="officeadmin-connection-group">
        <div class="officeadmin-connection-heading">Connected parts</div>
        <div class="officeadmin-connection-list">${connected || '<span class="officeadmin-small-copy">No direct links captured in this snapshot.</span>'}</div>
      </div>
    `;

    rootGrid.querySelectorAll(".officeadmin-root-card").forEach((node) => {
      node.classList.toggle("active", node.dataset.rootId === rootId);
    });

    storyRail.querySelectorAll(".officeadmin-story-card").forEach((card) => {
      const lane = lanePresentation[card.dataset.laneId];
      card.classList.toggle("active", Boolean(lane?.roots.includes(rootId)));
    });

    detail.querySelectorAll(".officeadmin-connection-chip").forEach((button) => {
      button.addEventListener("click", () => showRoot(button.dataset.rootId));
    });
  }

  rootGrid.querySelectorAll(".officeadmin-root-card").forEach((node) => {
    const activate = () => showRoot(node.dataset.rootId);
    node.addEventListener("click", activate);
  });

  storyRail.querySelectorAll(".officeadmin-story-card").forEach((node) => {
    node.addEventListener("click", () => {
      const lane = lanePresentation[node.dataset.laneId];
      if (lane?.roots?.[0]) showRoot(lane.roots[0]);
    });
  });

  showRoot("aiva");
}

function renderRepos(data) {
  document.getElementById("repoGrid").innerHTML = (data.repos || [])
    .map((repo) => {
      const presentation = repoPresentation[repo.id] || {
        label: repo.label,
        role: "Tracked surface",
        authority: "Git backed system surface.",
        source: "Tracked surface",
      };
      const metrics = [
        chip("Role", presentation.role),
        chip("Files", repo.trackedFileCount ?? "n/a"),
        chip("Branch", repo.branch || "n/a"),
      ].join("");

      return `
        <div class="overview-card">
          <div class="officeadmin-detail-label">${presentation.source}</div>
          <h3>${presentation.label}</h3>
          <p>${presentation.authority}</p>
          <div class="officeadmin-inline-metrics">${metrics}</div>
          <p class="officeadmin-small-copy"><code>${repo.path}</code></p>
          <p class="officeadmin-small-copy">${repo.lastCommit?.subject || "Read only generated surface, commit metadata intentionally de-emphasized."}</p>
        </div>
      `;
    })
    .join("");
}

function renderAuthorityModel(data) {
  document.getElementById("sourceOfTruthList").innerHTML = (data.roadmap?.sourceOfTruth || [])
    .map((line) => `<li>${line}</li>`)
    .join("");

  document.getElementById("generatedSourcesList").innerHTML = (data.generatedSources || [])
    .map(
      (source) =>
        `<li><strong>${source.label}</strong>, <code>${source.path}</code>, ${source.present ? "present" : "missing"}.</li>`
    )
    .join("");

  const items = data.authorities || [];
  const target = document.getElementById("authorityCards");
  const toggle = document.getElementById("authorityToggle");
  let expanded = false;

  function paint() {
    const visible = expanded ? items : items.slice(0, 6);
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
    toggle.hidden = items.length <= 6;
    toggle.textContent = expanded ? "Show fewer authorities" : "Show more authorities";
  }

  toggle.onclick = () => {
    expanded = !expanded;
    paint();
  };

  paint();
}

function renderWorkstreams(data) {
  const items = data.roadmap?.workstreams || [];
  const target = document.getElementById("workstreams");
  const toggle = document.getElementById("workstreamToggle");
  let expanded = false;

  function paint() {
    const visible = expanded ? items : items.slice(0, 6);
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
    toggle.hidden = items.length <= 6;
    toggle.textContent = expanded ? "Show fewer workstreams" : "Show more workstreams";
  }

  toggle.onclick = () => {
    expanded = !expanded;
    paint();
  };

  paint();
}

function renderHealth(data) {
  const docsSummary = document.getElementById("docsSummary");
  docsSummary.innerHTML = `
    <div class="officeadmin-inline-metrics">
      ${chip("Docs", data.docs?.count || 0)}
      ${chip("Current", data.docs?.byStatus?.current || 0)}
      ${chip("Work in progress", data.docs?.byStatus?.["work-in-progress"] || 0)}
      ${chip("Stale", data.docs?.staleCount || 0)}
    </div>
    <div class="officeadmin-chip-list">
      ${Object.entries(data.docs?.byConfidence || {})
        .map(([label, value]) => `<span class="officeadmin-chip">${label}: ${value}</span>`)
        .join("")}
    </div>
    <ul class="officeadmin-bullet-list">
      ${(data.docs?.stale || []).slice(0, 5).map((doc) => `<li>${doc.file}, ${doc.ageDays} days old.</li>`).join("")}
    </ul>
  `;

  const moduleSummary = document.getElementById("moduleSummary");
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
    <ul class="officeadmin-bullet-list">
      ${(data.modules?.topDependencies || [])
        .slice(0, 5)
        .map(
          (module) =>
            `<li>${module.id}, ${module.moduleDependencyCount} module deps, ${module.authProfileCount} auth profiles.</li>`
        )
        .join("")}
    </ul>
  `;
}

function renderMachines(data) {
  document.getElementById("machineGrid").innerHTML = (data.machines || [])
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

async function loadOfficeAdmin() {
  try {
    const response = await fetch("./data/system-map.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    renderSnapshot(data);
    renderGraph(data);
    renderRepos(data);
    renderAuthorityModel(data);
    renderWorkstreams(data);
    renderHealth(data);
    renderMachines(data);
  } catch (error) {
    document.getElementById("warningList").innerHTML =
      `<div class="officeadmin-warning officeadmin-warning-error">Could not load generated system data, ${error.message}.</div>`;
  }
}

loadOfficeAdmin();
