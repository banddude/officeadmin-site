const graphLayout = {
  "officeadmin-site": { x: 150, y: 90 },
  aiva: { x: 460, y: 90 },
  mikeshaffer: { x: 460, y: 240 },
  mempalace: { x: 720, y: 90 },
  openclaw: { x: 720, y: 240 },
  "apple-apps": { x: 460, y: 390 },
  "google-workspace": { x: 720, y: 390 },
  archives: { x: 150, y: 390 },
};

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
  const svg = document.getElementById("systemGraph");
  const rootsById = new Map((data.roots || []).map((root) => [root.id, root]));
  const width = 960;
  const height = 520;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

  const edges = (data.edges || [])
    .map((edge) => {
      const from = graphLayout[edge.from];
      const to = graphLayout[edge.to];
      if (!from || !to) return "";
      return `
        <g class="officeadmin-edge">
          <line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" />
          <text x="${(from.x + to.x) / 2}" y="${(from.y + to.y) / 2 - 10}">${edge.label}</text>
        </g>
      `;
    })
    .join("");

  const nodes = (data.roots || [])
    .map((root) => {
      const point = graphLayout[root.id];
      if (!point) return "";
      const statusClass = root.present ? "present" : "missing";
      return `
        <g class="officeadmin-node officeadmin-node-${statusClass}" data-root-id="${root.id}" tabindex="0" role="button" aria-label="${root.label}">
          <rect x="${point.x - 115}" y="${point.y - 42}" width="230" height="84" rx="16"></rect>
          <text x="${point.x}" y="${point.y - 8}" class="officeadmin-node-title">${root.label}</text>
          <text x="${point.x}" y="${point.y + 16}" class="officeadmin-node-subtitle">${root.type}</text>
        </g>
      `;
    })
    .join("");

  svg.innerHTML = `
    <defs>
      <linearGradient id="officeadminNodeFill" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#151723" />
        <stop offset="100%" stop-color="#101117" />
      </linearGradient>
    </defs>
    ${edges}
    ${nodes}
  `;

  const detail = document.getElementById("graphDetail");

  function showRoot(rootId) {
    const root = rootsById.get(rootId);
    if (!root) return;
    detail.innerHTML = `
      <div class="officeadmin-detail-label">${root.type}</div>
      <h3>${root.label}</h3>
      <p>${root.description}</p>
      <p><code>${root.path}</code></p>
      <div class="officeadmin-inline-metrics">
        ${(root.metrics || []).map((metric) => chip(metric.label, metric.value)).join("")}
      </div>
    `;

    svg.querySelectorAll(".officeadmin-node").forEach((node) => {
      node.classList.toggle("active", node.dataset.rootId === rootId);
    });
  }

  svg.querySelectorAll(".officeadmin-node").forEach((node) => {
    const activate = () => showRoot(node.dataset.rootId);
    node.addEventListener("click", activate);
    node.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        activate();
      }
    });
  });

  showRoot("aiva");
}

function renderRepos(data) {
  document.getElementById("repoGrid").innerHTML = (data.repos || [])
    .map((repo) => {
      const metrics = [
        chip("Branch", repo.branch || "n/a"),
        chip("Files", repo.trackedFileCount ?? "n/a"),
        chip("Dirty", repo.dirtyFileCount ?? "excluded"),
      ].join("");

      return `
        <div class="overview-card">
          <h3>${repo.label}</h3>
          <p><code>${repo.path}</code></p>
          <div class="officeadmin-inline-metrics">${metrics}</div>
          <p class="officeadmin-small-copy">${repo.lastCommit?.subject || "No commit info available."}</p>
          <p class="officeadmin-small-copy">${formatDateTime(repo.lastCommit?.authoredAt)}</p>
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

  document.getElementById("authorityTableBody").innerHTML = (data.authorities || [])
    .slice(0, 18)
    .map(
      (row) => `
        <tr>
          <td>${row.domain}</td>
          <td>${row.category}</td>
          <td><code>${row.where || "n/a"}</code></td>
          <td>${row.sourceOfTruth}</td>
        </tr>
      `
    )
    .join("");
}

function renderWorkstreams(data) {
  document.getElementById("workstreams").innerHTML = (data.roadmap?.workstreams || [])
    .map((workstream) => {
      const items = []
        .concat(workstream.deliverables || [])
        .concat(workstream.output || [])
        .concat(workstream.nearTermOutcomes || [])
        .slice(0, 4)
        .map((item) => `<li>${item}</li>`)
        .join("");

      return `
        <div class="overview-card">
          <div class="officeadmin-detail-label">Workstream</div>
          <h3>${workstream.title}</h3>
          <p>${workstream.goal || "Goal not parsed."}</p>
          <ul class="officeadmin-bullet-list">${items}</ul>
        </div>
      `;
    })
    .join("");
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
