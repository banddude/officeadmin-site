// explorer.js — Cytoscape-based renderer for system-map.v2.json.
//
// Behavior:
//   - Initial view: subsystems + machines + their direct first-level children.
//     Avoids dumping all 2900+ nodes on screen at once.
//   - Click a node: focus on that node + its 1-hop neighborhood, re-laid out
//     with fcose, animated.
//   - Breadcrumb tracks the focus history; click any breadcrumb crumb to jump
//     back. Reset button returns to the overview.
//   - Search: type to filter the full graph; matches drop the focus mode.
//
// Data shape comes from scripts/generate-system-map.mjs (schema in BUILD-PLAN.md).

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

const state = {
  data: null,
  cy: null,
  focusStack: [], // node ids representing breadcrumb history
};

async function loadData() {
  const res = await fetch("../data/system-map.v2.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`failed to load system-map.v2.json: ${res.status}`);
  return res.json();
}

function nodeMap(nodes) {
  const m = new Map();
  for (const n of nodes) m.set(n.id, n);
  return m;
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
  // Subsystems, machines, and their direct first-level children.
  const subsystems = data.nodes.filter((n) => n.kind === "subsystem" || n.kind === "machine");
  const subsystemIds = new Set(subsystems.map((n) => n.id));
  const firstLevel = data.nodes.filter((n) => subsystemIds.has(n.parent));
  const all = [...subsystems, ...firstLevel];
  const allIds = new Set(all.map((n) => n.id));
  const edges = data.edges.filter((e) => allIds.has(e.source) && allIds.has(e.target));
  return { nodes: all, edges };
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

  // Also include the focus node's parent chain for context.
  let p = focus.parent;
  while (p) {
    visited.add(p);
    const pn = data.nodes.find((n) => n.id === p);
    p = pn ? pn.parent : null;
  }
  // And direct children of the focus node.
  for (const n of data.nodes) {
    if (n.parent === focusId) visited.add(n.id);
  }

  const nodes = data.nodes.filter((n) => visited.has(n.id));
  const edges = data.edges.filter((e) => visited.has(e.source) && visited.has(e.target));
  return { nodes, edges };
}

function toCyElements(sub, focusId) {
  const cyNodes = sub.nodes.map((n) => ({
    data: {
      id: n.id,
      label: n.label,
      kind: n.kind,
      parent: n.parent && sub.nodes.some((x) => x.id === n.parent) ? null : null, // we don't use compound nodes yet
    },
    classes: [n.kind, focusId && n.id === focusId ? "focus" : ""].filter(Boolean).join(" "),
  }));
  const cyEdges = sub.edges.map((e, i) => ({
    data: {
      id: `e${i}-${e.source}-${e.target}-${e.type}`,
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
        "background-color": "data(kind)",
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
      },
    },
    { selector: "node.focus", style: { "border-width": 3, "border-color": "#ffffff" } },
    { selector: "node:selected", style: { "border-width": 3, "border-color": "#4a9eff" } },
    {
      selector: "edge",
      style: {
        "width": 1,
        "line-color": "#3a3d44",
        "target-arrow-color": "#3a3d44",
        "target-arrow-shape": "triangle",
        "curve-style": "bezier",
        "arrow-scale": 0.8,
        "opacity": 0.7,
      },
    },
  ];
  for (const [kind, color] of Object.entries(NODE_COLOR)) {
    style.push({ selector: `node.${kind}`, style: { "background-color": color, "width": NODE_SIZE[kind] || 22, "height": NODE_SIZE[kind] || 22, "font-size": kind === "subsystem" ? 14 : (kind === "module" ? 12 : 10) } });
  }
  for (const [type, color] of Object.entries(EDGE_COLOR)) {
    style.push({ selector: `edge.${type}`, style: { "line-color": color, "target-arrow-color": color } });
  }
  return style;
}

function renderFocus(focusId = null) {
  const sub = focusId ? focusSubgraph(state.data, focusId, 1) : initialSubgraph(state.data);
  const elements = toCyElements(sub, focusId);

  if (!state.cy) {
    state.cy = cytoscape({
      container: document.getElementById("cy"),
      elements,
      style: buildStyle(),
      layout: { name: "fcose", animate: false, padding: 30, nodeRepulsion: 8000, idealEdgeLength: 80 },
      wheelSensitivity: 0.2,
      minZoom: 0.1,
      maxZoom: 4,
    });
    state.cy.on("tap", "node", (evt) => onNodeTap(evt.target.id()));
  } else {
    state.cy.batch(() => {
      state.cy.elements().remove();
      state.cy.add(elements);
    });
    state.cy.layout({ name: "fcose", animate: "end", animationDuration: 400, padding: 30, nodeRepulsion: 8000, idealEdgeLength: 80 }).run();
  }

  document.getElementById("stats").textContent = `${sub.nodes.length} nodes · ${sub.edges.length} edges`;
  updateBreadcrumb();
  updateInfoPanel(focusId);
}

function onNodeTap(id) {
  // Push onto stack unless it's the same as the current top.
  if (state.focusStack[state.focusStack.length - 1] !== id) {
    state.focusStack.push(id);
  }
  renderFocus(id);
}

function updateBreadcrumb() {
  const bc = document.getElementById("breadcrumb");
  bc.innerHTML = "";
  const crumbs = [{ id: "", label: "all subsystems" }, ...state.focusStack.map((id) => {
    const n = state.data.nodes.find((x) => x.id === id);
    return { id, label: n ? n.label : id };
  })];
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
      renderFocus(c.id || null);
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
      renderFocus(state.focusStack[state.focusStack.length - 1] || null);
      return;
    }
    const matches = state.data.nodes.filter((n) =>
      n.label.toLowerCase().includes(q) || n.id.toLowerCase().includes(q)
    ).slice(0, 200); // cap to keep layout sane
    const matchIds = new Set(matches.map((n) => n.id));
    const edges = state.data.edges.filter((e) => matchIds.has(e.source) && matchIds.has(e.target));
    const elements = toCyElements({ nodes: matches, edges }, null);
    state.cy.batch(() => {
      state.cy.elements().remove();
      state.cy.add(elements);
    });
    state.cy.layout({ name: "fcose", animate: false, padding: 30 }).run();
    document.getElementById("stats").textContent = `${matches.length} matches`;
  });
}

function bindReset() {
  document.getElementById("resetBtn").addEventListener("click", () => {
    state.focusStack = [];
    document.getElementById("search").value = "";
    renderFocus(null);
  });
}

async function main() {
  try {
    state.data = await loadData();
  } catch (err) {
    document.getElementById("stats").textContent = `error: ${err.message}`;
    console.error(err);
    return;
  }
  renderFocus(null);
  bindSearch();
  bindReset();
  console.log(`loaded ${state.data.nodes.length} nodes, ${state.data.edges.length} edges`);
}

main();
