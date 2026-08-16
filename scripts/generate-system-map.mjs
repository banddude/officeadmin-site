#!/usr/bin/env node
/**
 * generate-system-map.mjs — v2 generator (code-level graph)
 *
 * Builds officeadmin/data/system-map.json by parsing real code across
 * Python, TypeScript, Swift sources plus launchd plists, SKILL.md files,
 * and the MCP registry.
 *
 * Schema and privacy rules are in officeadmin/BUILD-PLAN.md. Read that
 * before editing this file.
 *
 * Status: Phase 1 scaffolding. Schema + sanitization + writer wired up.
 * Parsers are stubs; Phase 2 (Python) is next.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");
// During v2 development we write to a separate file so the live site keeps
// serving the v1 map. Swap this to "system-map.json" when v2 reaches parity.
const OUTPUT_PATH = path.join(REPO_ROOT, "officeadmin", "data", "system-map.v2.json");

// Force the system Python — Homebrew's 3.14 has a broken pyexpat.
const PYTHON_BIN = "/usr/bin/python3";

// ---------------------------------------------------------------------------
// Source roots. Override with env vars for testing.
// ---------------------------------------------------------------------------

const SOURCES = {
  aivaPython: process.env.AIVA_PATH || path.join(process.env.HOME, ".aiva"),
  mikeshafferPython: process.env.MIKESHAFFER_PATH || path.join(process.env.HOME, "mikeshaffer"),
  launchAgents: process.env.LAUNCH_AGENTS_PATH || path.join(process.env.HOME, "Library", "LaunchAgents"),
  skills: process.env.SKILLS_PATH || path.join(process.env.HOME, ".claude", "skills"),
  // TypeScript sources
  qbCli: process.env.QB_CLI_PATH || path.join(process.env.HOME, ".aiva", "modules", "quickbooks", "qb-cli"),
  openclaw: process.env.OPENCLAW_PATH || path.join(process.env.HOME, ".openclaw", "workspace"),
  // Swift sources
  aivaSwift: process.env.AIVA_SWIFT_PATH || path.join(process.env.HOME, "AIVA"),
  claudeIsland: process.env.CLAUDE_ISLAND_PATH || path.join(process.env.HOME, ".claude", "claude-island"),
};

// ---------------------------------------------------------------------------
// Schema validators. Keep these strict — anything not in the allowed shape
// gets dropped so nothing sensitive can leak in by accident.
// ---------------------------------------------------------------------------

const NODE_KINDS = new Set([
  "subsystem", "repo", "module", "file", "class", "function",
  "cli", "skill", "mcp_tool", "launchd_job", "machine", "endpoint",
]);

const EDGE_TYPES = new Set([
  "imports", "calls", "schedules", "triggers", "reads_from", "writes_to",
  "exposes_tool", "deploys_to", "depends_on", "implements", "contained_in",
]);

const NODE_FIELDS = new Set([
  "id", "label", "kind", "parent", "subsystem", "language", "tags",
]);

const EDGE_FIELDS = new Set([
  "source", "target", "type", "weight",
]);

const SUBSYSTEMS = new Set(["aiva", "mikeshaffer", "officeadmin-site", "ios-apps", "openclaw"]);
const LANGUAGES = new Set(["python", "typescript", "javascript", "swift", "config", "shell"]);

// ---------------------------------------------------------------------------
// Sanitization. Two layers:
//   1. Schema enforcement — only allowed fields survive.
//   2. Content denylist — fail loudly if any output value matches a
//      sensitive pattern. This is a guard, not the primary defense; the
//      primary defense is that parsers should never emit this stuff in the
//      first place. But belt + suspenders since the site is public.
// ---------------------------------------------------------------------------

const DENY_PATTERNS = [
  /\/Users\//,                          // absolute home paths
  /\/home\//,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,   // emails
  /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/,            // US phone numbers
  /\bsk-[A-Za-z0-9]{20,}\b/,            // OpenAI-style keys
  /\bAKIA[0-9A-Z]{16}\b/,               // AWS keys
];

// Strings that show up in node IDs/labels and ARE safe (public infra)
const PUBLIC_ALLOWLIST = [
  "officeadmin.io",
  "terminal.officeadmin.io",
  "files.officeadmin.io",
];

function sanitizeNode(raw) {
  if (!raw || typeof raw !== "object") return null;
  const out = {};
  for (const k of Object.keys(raw)) {
    if (!NODE_FIELDS.has(k)) continue;
    out[k] = raw[k];
  }
  if (typeof out.id !== "string" || !out.id) return null;
  if (typeof out.label !== "string" || !out.label) return null;
  if (!NODE_KINDS.has(out.kind)) return null;
  if (out.subsystem && !SUBSYSTEMS.has(out.subsystem)) return null;
  if (out.language && !LANGUAGES.has(out.language)) return null;
  if (out.tags && !Array.isArray(out.tags)) delete out.tags;
  return out;
}

function sanitizeEdge(raw) {
  if (!raw || typeof raw !== "object") return null;
  const out = {};
  for (const k of Object.keys(raw)) {
    if (!EDGE_FIELDS.has(k)) continue;
    out[k] = raw[k];
  }
  if (typeof out.source !== "string" || typeof out.target !== "string") return null;
  if (!EDGE_TYPES.has(out.type)) return null;
  if (out.weight !== undefined && typeof out.weight !== "number") delete out.weight;
  return out;
}

function assertNoSensitiveContent(nodes, edges) {
  const violations = [];
  const check = (where, value) => {
    if (typeof value !== "string") return;
    if (PUBLIC_ALLOWLIST.some((s) => value.includes(s))) return;
    for (const pat of DENY_PATTERNS) {
      if (pat.test(value)) {
        violations.push({ where, value, pattern: pat.toString() });
        return;
      }
    }
  };
  for (const n of nodes) {
    check(`node.${n.id}.id`, n.id);
    check(`node.${n.id}.label`, n.label);
    check(`node.${n.id}.parent`, n.parent);
    if (n.tags) n.tags.forEach((t, i) => check(`node.${n.id}.tags[${i}]`, t));
  }
  for (const e of edges) {
    check(`edge.${e.source}->${e.target}.source`, e.source);
    check(`edge.${e.source}->${e.target}.target`, e.target);
  }
  if (violations.length > 0) {
    console.error("FATAL: sanitization violations:");
    for (const v of violations) {
      console.error(`  ${v.where}: ${v.value} matches ${v.pattern}`);
    }
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Parsers. Each returns { nodes: [...], edges: [...] }. Stubs for now.
// ---------------------------------------------------------------------------

// Per-subsystem Python source allowlists. Empty list = walk everything in the
// root (respecting parse-python.py's HARD_SKIP_DIRS). Keep these tight to avoid
// pulling in data directories with sensitive content.
const PYTHON_ALLOWLISTS = {
  aiva: ["modules", "ops", "bin", "scripts", "core", "mcp-server", "build"],
  mikeshaffer: ["scripts", "speaker-embed", "work", "bin"],
};

async function parsePython(root, subsystem) {
  if (!fs.existsSync(root)) {
    console.warn(`parsePython(${subsystem}): root not found at ${root.replace(process.env.HOME, "~")}`);
    return { nodes: [], edges: [] };
  }
  const helper = path.join(__dirname, "parse-python.py");
  const allow = (PYTHON_ALLOWLISTS[subsystem] || []).join(",");
  const args = [helper, root, subsystem];
  if (allow) args.push("--allowlist", allow);
  const result = spawnSync(PYTHON_BIN, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) {
    console.error(`parsePython(${subsystem}) failed:`, result.stderr);
    return { nodes: [], edges: [] };
  }
  if (result.stderr) {
    // Warnings (e.g. missing root) from the helper.
    process.stderr.write(result.stderr);
  }
  try {
    const out = JSON.parse(result.stdout);
    console.log(`parsePython(${subsystem}): ${out.nodes.length} nodes, ${out.edges.length} edges`);
    return out;
  } catch (err) {
    console.error(`parsePython(${subsystem}): failed to parse helper output:`, err);
    return { nodes: [], edges: [] };
  }
}

function runPythonHelper(scriptName, ...extraArgs) {
  const helper = path.join(__dirname, scriptName);
  const result = spawnSync(PYTHON_BIN, [helper, ...extraArgs], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    console.error(`${scriptName} failed:`, result.stderr);
    return { nodes: [], edges: [] };
  }
  if (result.stderr) process.stderr.write(result.stderr);
  try {
    return JSON.parse(result.stdout);
  } catch (err) {
    console.error(`${scriptName}: failed to parse output:`, err);
    return { nodes: [], edges: [] };
  }
}

async function parseLaunchd() {
  const out = runPythonHelper("parse-system.py", "--only", "launchd");
  console.log(`parseLaunchd: ${out.nodes.length} nodes, ${out.edges.length} edges`);
  return out;
}

async function parseSkills() {
  const out = runPythonHelper("parse-system.py", "--only", "skills");
  console.log(`parseSkills: ${out.nodes.length} nodes, ${out.edges.length} edges`);
  return out;
}

async function parseMcpRegistry() {
  const out = runPythonHelper("parse-system.py", "--only", "mcp");
  console.log(`parseMcpRegistry: ${out.nodes.length} nodes, ${out.edges.length} edges`);
  return out;
}

async function parseTypescript() {
  // qb-cli (QuickBooks MCP server) under aiva
  const qbResult = runPythonHelper("parse-typescript.py", SOURCES.qbCli, "aiva", "--allowlist", "src");
  console.log(`parseTypescript(qb-cli): ${qbResult.nodes.length} nodes, ${qbResult.edges.length} edges`);

  // openclaw workspace (small, separate subsystem)
  const ocResult = runPythonHelper("parse-typescript.py", SOURCES.openclaw, "openclaw");
  console.log(`parseTypescript(openclaw): ${ocResult.nodes.length} nodes, ${ocResult.edges.length} edges`);

  return {
    nodes: [...qbResult.nodes, ...ocResult.nodes],
    edges: [...qbResult.edges, ...ocResult.edges],
  };
}

async function parseSwift() {
  // AIVA iOS/macOS apps
  const aivaResult = runPythonHelper("parse-swift.py", SOURCES.aivaSwift, "ios-apps");
  console.log(`parseSwift(aiva): ${aivaResult.nodes.length} nodes, ${aivaResult.edges.length} edges`);

  // Claude Island (macOS notch app)
  const islandResult = runPythonHelper("parse-swift.py", SOURCES.claudeIsland, "ios-apps");
  console.log(`parseSwift(claude-island): ${islandResult.nodes.length} nodes, ${islandResult.edges.length} edges`);

  return {
    nodes: [...aivaResult.nodes, ...islandResult.nodes],
    edges: [...aivaResult.edges, ...islandResult.edges],
  };
}

// ---------------------------------------------------------------------------
// Seed: the top-level subsystem and machine nodes that anchor the graph
// even before parsers fill it in. These are hand-defined because they're
// the orientation skeleton.
// ---------------------------------------------------------------------------

function seedNodes() {
  return [
    { id: "aiva", label: "AIVA", kind: "subsystem", subsystem: "aiva" },
    { id: "mikeshaffer", label: "mikeshaffer CRM", kind: "subsystem", subsystem: "mikeshaffer" },
    { id: "officeadmin-site", label: "officeadmin.io", kind: "subsystem", subsystem: "officeadmin-site" },
    { id: "ios-apps", label: "iOS Apps", kind: "subsystem", subsystem: "ios-apps" },
    { id: "machine.aiva", label: "aiva (mac server)", kind: "machine" },
    { id: "machine.laptop", label: "laptop (M4 air)", kind: "machine" },
    { id: "machine.grandma", label: "grandma-mac", kind: "machine" },
  ];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("generate-system-map.mjs — v2 (scaffolding)");
  const allNodes = [...seedNodes()];
  const allEdges = [];

  const sources = [
    await parsePython(SOURCES.aivaPython, "aiva"),
    await parsePython(SOURCES.mikeshafferPython, "mikeshaffer"),
    await parseLaunchd(SOURCES.launchAgents),
    await parseSkills(SOURCES.skills),
    await parseMcpRegistry(),
    await parseTypescript(),
    await parseSwift(),
  ];

  for (const { nodes, edges } of sources) {
    for (const n of nodes) {
      const clean = sanitizeNode(n);
      if (clean) allNodes.push(clean);
    }
    for (const e of edges) {
      const clean = sanitizeEdge(e);
      if (clean) allEdges.push(clean);
    }
  }

  // Dedupe nodes by id; keep first.
  const seen = new Set();
  const nodes = allNodes.filter((n) => {
    if (seen.has(n.id)) return false;
    seen.add(n.id);
    return true;
  });

  // Drop edges to/from unknown nodes so we never render dangling lines.
  const ids = new Set(nodes.map((n) => n.id));
  const edges = allEdges.filter((e) => ids.has(e.source) && ids.has(e.target));

  assertNoSensitiveContent(nodes, edges);

  const output = {
    version: 2,
    generatedAt: new Date().toISOString(),
    schema: "code-level-graph",
    nodes,
    edges,
    counts: { nodes: nodes.length, edges: edges.length },
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n");
  console.log(`Wrote ${nodes.length} nodes, ${edges.length} edges → ${path.relative(REPO_ROOT, OUTPUT_PATH)}`);
}

main().catch((err) => {
  console.error("generate-system-map.mjs failed:", err);
  process.exit(1);
});
