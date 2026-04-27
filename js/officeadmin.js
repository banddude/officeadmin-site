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
  const rootGrid = document.getElementById("rootGrid");
  const edgeList = document.getElementById("edgeList");
  const rootsById = new Map((data.roots || []).map((root) => [root.id, root]));

  const detail = document.getElementById("graphDetail");

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
    detail.innerHTML = `
      <div class="officeadmin-detail-label">${root.type}</div>
      <h3>${root.label}</h3>
      <p>${root.description}</p>
      <p><code>${root.path}</code></p>
      <div class="officeadmin-inline-metrics">
        ${(root.metrics || []).map((metric) => chip(metric.label, metric.value)).join("")}
      </div>
    `;

    rootGrid.querySelectorAll(".officeadmin-root-card").forEach((node) => {
      node.classList.toggle("active", node.dataset.rootId === rootId);
    });
  }

  rootGrid.querySelectorAll(".officeadmin-root-card").forEach((node) => {
    const activate = () => showRoot(node.dataset.rootId);
    node.addEventListener("click", activate);
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

  document.getElementById("authorityCards").innerHTML = (data.authorities || [])
    .slice(0, 18)
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
