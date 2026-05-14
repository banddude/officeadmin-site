// Line 1: signal IMMEDIATELY that explorer.js parsed and executed. If you
// see "explorer.js script tag fired onload" but not "explorer.js EXECUTING",
// the file loaded but parse/exec failed before reaching line 1.
try { window.__BOOT_UPDATE__ && window.__BOOT_UPDATE__("explorer.js EXECUTING"); } catch (e) {}
window.__EXPLORER_VERSION__ = "2026-05-12-v8";
// Hide the boot diagnostic 3s after explorer takes over.
(function () {
  var b = document.getElementById("boot");
  if (b) setTimeout(function () { if (b) b.style.display = "none"; }, 3000);
})();

// explorer.js — Cytoscape-based renderer for system-map.v2.json.
//
// Behavior:
//   - Overview: subsystems + machines + direct children (~100 nodes).
//   - Click a node: focus on that node + its 1-hop neighborhood, re-laid out.
//   - Compound nodes: parent field used for visible grouping via Cytoscape
//     compound support. fcose handles compound layouts natively.
//   - Semantic zoom: within any view, zoom thresholds control which tiers
//     are visible. Low: subsystems/machines. Mid: + modules/skills/jobs.
//     High: + files/classes/functions. Labels hidden at low zoom.
//   - Breadcrumb tracks the focus history; reset button returns to overview.
//   - Search: type to filter; matches drop the focus mode.

const NODE_COLOR = {
  subsystem: "#4a9eff",
  machine: "#ef4444",
  module: "#7c5cff",
  file: "#d9d9d9",
  function: "#6b7280",
  class: "#f59e0b",
  launchd_job: "#10b981",
  skill: "#ec4899",
  mcp_tool: "#06b6d4",
  cli: "#f97316",
  endpoint: "#94a3b8",
};

const NODE_SIZE = {
  subsystem: 60,
  machine: 48,
  module: 36,
  file: 22,
  class: 22,
  function: 14,
  launchd_job: 28,
  skill: 28,
  mcp_tool: 28,
  cli: 22,
  endpoint: 22,
};

const EDGE_COLOR = {
  contained_in: "#3a3d44",
  imports: "#4a9eff",
  schedules: "#10b981",
  implements: "#ec4899",
  calls: "#f59e0b",
  triggers: "#f97316",
  reads_from: "#06b6d4",
  writes_to: "#06b6d4",
  exposes_tool: "#06b6d4",
  deploys_to: "#94a3b8",
  depends_on: "#94a3b8",
};

const KIND_TIER = {
  subsystem: 0,
  machine: 0,
  module: 1,
  launchd_job: 1,
  skill: 1,
  mcp_tool: 1,
  cli: 1,
  file: 2,
  class: 2,
  function: 2,
  endpoint: 2,
};

const ZOOM_LOW = 0.15;
const ZOOM_MID = 0.5;

const state = {
  data: null,
  cy: null,
  focusStack: [],
  currentElements: null, // the subgraph currently displayed
  searchMode: false,
};

async function loadData(progress) {
  progress("fetching data...");
  const res = await fetch("../data/system-map.v2.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} loading system-map.v2.json`);
  const len = +(res.headers.get("content-length") || 0);
  if (!res.body || !len) {
    progress("parsing data...");
    return res.json();
  }
  // Streamed read with progress so mobile users see it's actually working,
  // not silently downloading 4MB.
  const reader = res.body.getReader();
  const chunks = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    const pct = Math.floor((received / len) * 100);
    progress(`fetching data... ${pct}% (${(received/1024/1024).toFixed(1)}MB / ${(len/1024/1024).toFixed(1)}MB)`);
  }
  progress("parsing data...");
  const text = new TextDecoder().decode(new Blob(chunks).slice(0));
  // Blob.slice is synchronous but returns a Blob; need to use arrayBuffer instead
  const blob = new Blob(chunks);
  const txt = await blob.text();
  return JSON.parse(txt);
}

function buildAdjacency(edges) {
  const out = new Map();
  const inc = new Map();
  for (const e of edges) {
    if (!out.has(e.source)) out.set(e.source, []);
    if (!inc.has(e.target)) inc.set(e.target, []);
    out.get(e.source).push(e);
    inc.get(e.target).push(e);
  }
  return { out, inc };
}

function initialSubgraph(data) {
  const subsystems = data.nodes.filter((n) => n.kind === "subsystem" || n.kind === "machine");
  const subsystemIds = new Set(subsystems.map((n) => n.id));
  // First-level children of subsystems/machines.
  const firstLevel = data.nodes.filter((n) => subsystemIds.has(n.parent));
  const all = [...subsystems, ...firstLevel];
  const allIds = new Set(all.map((n) => n.id));
  // Also include second-level children so they're available for zoom-in reveal.
  const secondLevel = data.nodes.filter((n) => allIds.has(n.parent));
  const expanded = [...all, ...secondLevel];
  const expandedIds = new Set(expanded.map((n) => n.id));
  const edges = data.edges.filter((e) => expandedIds.has(e.source) && expandedIds.has(e.target));
  return { nodes: expanded, edges };
}

function focusSubgraph(data, focusId, hops = 1) {
  const focus = data.nodes.find((n) => n.id === focusId);
  if (!focus) return initialSubgraph(data);

  const { out, inc } = buildAdjacency(data.edges);
  const visited = new Set([focusId]);
  const frontier = new Set([focusId]);
  for (let h = 0; h < hops; h++) {
    const next = new Set();
    for (const id of frontier) {
      for (const e of out.get(id) || []) if (!visited.has(e.target)) next.add(e.target);
      for (const e of inc.get(id) || []) if (!visited.has(e.source)) next.add(e.source);
    }
    for (const id of next) visited.add(id);
    if (next.size === 0) break;
    frontier.clear();
    for (const id of next) frontier.add(id);
  }

  // Parent chain for context.
  let p = focus.parent;
  while (p) {
    visited.add(p);
    const pn = data.nodes.find((n) => n.id === p);
    p = pn ? pn.parent : null;
  }
  // Direct children of focus.
  for (const n of data.nodes) {
    if (n.parent === focusId) visited.add(n.id);
  }

  const nodes = data.nodes.filter((n) => visited.has(n.id));
  const edges = data.edges.filter((e) => visited.has(e.source) && visited.has(e.target));
  return { nodes, edges };
}

function toCyElements(sub, focusId) {
  const subIds = new Set(sub.nodes.map((n) => n.id));
  const cyNodes = sub.nodes.map((n) => ({
    data: {
      id: n.id,
      label: n.label,
      kind: n.kind,
      subsystem: n.subsystem || "",
      language: n.language || "",
      // Only set parent if the parent is also in this subgraph (compound node).
      parent: n.parent && subIds.has(n.parent) ? n.parent : undefined,
      tier: KIND_TIER[n.kind] ?? 2,
    },
    classes: [n.kind, focusId && n.id === focusId ? "focus" : ""].filter(Boolean).join(" "),
  }));
  const cyEdges = sub.edges.map((e, i) => ({
    data: {
      id: `e${i}-${e.source}-${e.target}`,
      source: e.source,
      target: e.target,
      type: e.type,
    },
    classes: e.type,
  }));
  return [...cyNodes, ...cyEdges];
}

function buildStyle() {
  const style = [
    {
      selector: "node",
      style: {
        "background-color": "#333",
        "label": "data(label)",
        "color": "#e4e6eb",
        "font-size": 10,
        "text-margin-y": -4,
        "text-valign": "bottom",
        "text-halign": "center",
        "text-outline-color": "#0d0e10",
        "text-outline-width": 2,
        "border-width": 0,
        "width": 22,
        "height": 22,
        "opacity": 1,
      },
    },
    ...Object.entries(NODE_COLOR).map(([kind, color]) => ({
      selector: `node.${kind}`,
      style: {
        "background-color": color,
        "width": NODE_SIZE[kind] || 22,
        "height": NODE_SIZE[kind] || 22,
        "font-size": kind === "subsystem" ? 14 : (kind === "module" ? 12 : 10),
      },
    })),
    { selector: "node.focus", style: { "border-width": 3, "border-color": "#ffffff" } },
    { selector: "node:selected", style: { "border-width": 3, "border-color": "#4a9eff" } },
    // Compound parent nodes: subtle background, border, label at top.
    {
      selector: "$node > node",
      style: {
        "background-color": "#16181c",
        "background-opacity": 0.25,
        "border-width": 1,
        "border-color": "#2a2d33",
        "border-opacity": 0.6,
        "font-size": 11,
        "text-valign": "top",
        "text-halign": "center",
        "text-margin-y": 4,
        "label": "data(label)",
        "color": "#8b8f96",
        "padding": 15,
      },
    },
    {
      selector: "edge",
      style: {
        "width": 1,
        "line-color": "#3a3d44",
        "target-arrow-color": "#3a3d44",
        "target-arrow-shape": "triangle",
        "curve-style": "bezier",
        "arrow-scale": 0.6,
        "opacity": 0.5,
      },
    },
    ...Object.entries(EDGE_COLOR).map(([type, color]) => ({
      selector: `edge.${type}`,
      style: {
        "line-color": color,
        "target-arrow-color": color,
      },
    })),
    // contained_in: subtle, no arrow, dotted.
    {
      selector: "edge.contained_in",
      style: {
        "target-arrow-shape": "none",
        "line-style": "dotted",
        "opacity": 0.15,
        "width": 0.5,
      },
    },
  ];
  return style;
}

function applySemanticZoom(cy) {
  const z = cy.zoom();
  let maxTier, showLabels;
  if (z < ZOOM_LOW) {
    maxTier = 0;
    showLabels = false;
  } else if (z < ZOOM_MID) {
    maxTier = 1;
    showLabels = true;
  } else {
    maxTier = 2;
    showLabels = true;
  }

  cy.batch(() => {
    cy.nodes().forEach((node) => {
      const tier = node.data("tier") ?? 2;

      // Compound parents: always show subsystems/machines as anchors;
      // otherwise visible if any child is at the current tier.
      if (node.isParent()) {
        const kind = node.data("kind");
        const anchor = kind === "subsystem" || kind === "machine";
        const children = node.children();
        const anyChildVisible = children.some((c) => (c.data("tier") ?? 2) <= maxTier);
        node.style("display", anchor || anyChildVisible ? "element" : "none");
        node.style("label", showLabels ? "data(label)" : "");
        return;
      }

      const kind = node.data("kind");
      // Subsystems and machines are the orientation anchors — keep them
      // visible at every zoom level. Labels still follow the zoom rule.
      const alwaysVisible = kind === "subsystem" || kind === "machine";
      const visible = alwaysVisible || tier <= maxTier;
      node.style("display", visible ? "element" : "none");
      node.style("label", showLabels ? "data(label)" : "");
    });

    cy.edges().forEach((edge) => {
      const src = edge.source();
      const tgt = edge.target();
      const srcVis = src.style("display") !== "none";
      const tgtVis = tgt.style("display") !== "none";
      edge.style("display", srcVis && tgtVis ? "element" : "none");
    });
  });
}

function renderView(focusId = null) {
  const sub = focusId ? focusSubgraph(state.data, focusId, 1) : initialSubgraph(state.data);
  state.currentElements = sub;
  const elements = toCyElements(sub, focusId);

  if (!state.cy) {
    state.cy = cytoscape({
      container: document.getElementById("cy"),
      elements,
      style: buildStyle(),
      layout: {
        name: "fcose",
        animate: false,
        padding: 40,
        nodeRepulsion: 10000,
        idealEdgeLength: 90,
        nestingFactor: 1.2,
      },
      wheelSensitivity: 0.3,
      minZoom: 0.05,
      maxZoom: 6,
    });
    state.cy.on("tap", "node", (evt) => onNodeTap(evt.target.id()));
    state.cy.on("zoom", () => {
      if (state.searchMode) return;
      applySemanticZoom(state.cy);
    });
    // Floor the initial fit zoom: if fcose auto-fits to a near-invisible
    // level (common on small viewports with many nodes), bump to ZOOM_MID.
    state.cy.one("layoutstop", () => {
      if (state.cy.zoom() < ZOOM_LOW) {
        state.cy.zoom(ZOOM_MID);
        state.cy.center();
        applySemanticZoom(state.cy);
      }
    });
  } else {
    state.cy.batch(() => {
      state.cy.elements().remove();
      state.cy.add(elements);
    });
    // Ensure initial zoom never drops below a usable threshold (mobile
    // viewports auto-fit way out and hide everything otherwise).
    // Listen on the cy core (more reliable than the layout object) BEFORE run.
    state.cy.one("layoutstop", () => {
      // After fcose auto-fits, bump zoom if it's below mid threshold so we
      // start in the "modules + labels" tier rather than "tier 0 only".
      const z = state.cy.zoom();
      if (z < ZOOM_MID) {
        state.cy.zoom(ZOOM_MID);
        state.cy.center();
      }
      applySemanticZoom(state.cy);
    });
    state.cy.layout({
      name: "fcose",
      animate: focusId ? "end" : false,
      animationDuration: 400,
      padding: 40,
      nodeRepulsion: focusId ? 8000 : 10000,
      idealEdgeLength: focusId ? 80 : 90,
      nestingFactor: 1.2,
    }).run();
  }

  // Apply initial semantic zoom.
  applySemanticZoom(state.cy);

  document.getElementById("stats").textContent = `${sub.nodes.length} nodes · ${sub.edges.length} edges`;
  updateBreadcrumb();
  updateInfoPanel(focusId);
}

function onNodeTap(id) {
  if (state.searchMode) {
    document.getElementById("search").value = "";
    state.searchMode = false;
  }
  if (state.focusStack[state.focusStack.length - 1] !== id) {
    state.focusStack.push(id);
  }
  renderView(id);
}

function updateBreadcrumb() {
  const bc = document.getElementById("breadcrumb");
  bc.innerHTML = "";
  const crumbs = [
    { id: "", label: "all subsystems" },
    ...state.focusStack.map((id) => {
      const n = state.data.nodes.find((x) => x.id === id);
      return { id, label: n ? n.label : id };
    }),
  ];
  crumbs.forEach((c, i) => {
    if (i > 0) {
      const sep = document.createElement("span");
      sep.className = "sep";
      sep.textContent = "›";
      bc.appendChild(sep);
    }
    const a = document.createElement("a");
    a.textContent = c.label;
    a.onclick = () => {
      state.focusStack = state.focusStack.slice(0, i);
      if (c.id) {
        renderView(c.id);
      } else {
        renderView(null);
      }
    };
    bc.appendChild(a);
  });
}

function updateInfoPanel(focusId) {
  const info = document.getElementById("info");
  if (!focusId) { info.classList.remove("visible"); return; }
  const node = state.data.nodes.find((n) => n.id === focusId);
  if (!node) { info.classList.remove("visible"); return; }
  const incoming = state.data.edges.filter((e) => e.target === focusId);
  const outgoing = state.data.edges.filter((e) => e.source === focusId);
  const summarize = (edges, dir) => {
    if (edges.length === 0) return "";
    const byType = {};
    for (const e of edges) byType[e.type] = (byType[e.type] || 0) + 1;
    return `${dir}: ${Object.entries(byType).map(([t, n]) => `${n} ${t}`).join(", ")}`;
  };
  info.innerHTML = `
    <h3>${node.label}</h3>
    <div class="meta">${node.kind}${node.subsystem ? ` · ${node.subsystem}` : ""}${node.language ? ` · ${node.language}` : ""}</div>
    <div class="neighbors">${[summarize(outgoing, "out"), summarize(incoming, "in")].filter(Boolean).join("<br>") || "no edges"}</div>
    <div class="meta" style="margin-top: 8px; font-family: ui-monospace, monospace; font-size: 10px; word-break: break-all;">${node.id}</div>
  `;
  info.classList.add("visible");
}

function bindSearch() {
  const input = document.getElementById("search");
  input.addEventListener("input", (e) => {
    const q = e.target.value.toLowerCase().trim();
    if (!q) {
      state.searchMode = false;
      const focusId = state.focusStack[state.focusStack.length - 1] || null;
      renderView(focusId);
      return;
    }
    state.searchMode = true;
    const matches = state.data.nodes.filter((n) =>
      n.label.toLowerCase().includes(q) || n.id.toLowerCase().includes(q)
    ).slice(0, 200);
    const matchIds = new Set(matches.map((n) => n.id));
    const elements = toCyElements({ nodes: matches, edges: state.data.edges.filter((e) => matchIds.has(e.source) && matchIds.has(e.target)) }, null);
    state.cy.batch(() => {
      state.cy.elements().remove();
      state.cy.add(elements);
    });
    state.cy.layout({ name: "fcose", animate: false, padding: 30, nestingFactor: 1.2 }).run();
    document.getElementById("stats").textContent = `${matches.length} matches`;
  });
}

function bindReset() {
  document.getElementById("resetBtn").addEventListener("click", () => {
    state.focusStack = [];
    state.searchMode = false;
    document.getElementById("search").value = "";
    renderView(null);
  });
}

function setStatus(msg) {
  const el = document.getElementById("stats");
  if (el) el.textContent = msg;
}

function showFatal(err) {
  const el = document.getElementById("stats");
  if (el) {
    el.style.color = "#c00";
    el.style.fontWeight = "bold";
    el.textContent = `ERROR: ${err && err.message ? err.message : String(err)}`;
  }
  // Also try to surface in the main area so it isn't tucked under the toolbar
  const main = document.querySelector("main") || document.body;
  const banner = document.createElement("div");
  banner.style.cssText = "position:fixed;top:60px;left:8px;right:8px;background:#fee;border:2px solid #c00;color:#600;padding:12px;font-family:monospace;font-size:12px;z-index:9999;white-space:pre-wrap;overflow:auto;max-height:50vh;";
  banner.textContent = `Explorer failed.\n\n${err && err.stack ? err.stack : err}`;
  main.appendChild(banner);
  console.error("explorer fatal:", err);
}

// Capture top-level errors so silent failures become visible.
window.addEventListener("error", (e) => showFatal(e.error || e.message || "unknown error"));
window.addEventListener("unhandledrejection", (e) => showFatal(e.reason || "unhandled rejection"));

async function main() {
  try {
    setStatus("starting...");
    if (typeof cytoscape === "undefined") {
      throw new Error("cytoscape global not loaded — check CDN scripts");
    }
    state.data = await loadData(setStatus);
    setStatus(`building graph (${state.data.nodes.length} nodes, ${state.data.edges.length} edges)...`);
    await new Promise(r => setTimeout(r, 0)); // let UI paint
    renderView(null);
    setStatus(`${state.data.nodes.length} nodes · ${state.data.edges.length} edges`);
    bindSearch();
    bindReset();
    console.log(`loaded ${state.data.nodes.length} nodes, ${state.data.edges.length} edges`);
  } catch (err) {
    showFatal(err);
  }
}

main();
