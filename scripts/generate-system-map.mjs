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
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");
const OUTPUT_PATH = path.join(REPO_ROOT, "officeadmin", "data", "system-map.json");

// ---------------------------------------------------------------------------
// Source roots. Override with env vars for testing.
// ---------------------------------------------------------------------------

const SOURCES = {
  aivaPython: process.env.AIVA_PATH || path.join(process.env.HOME, ".aiva"),
  mikeshafferPython: process.env.MIKESHAFFER_PATH || path.join(process.env.HOME, "mikeshaffer"),
  launchAgents: process.env.LAUNCH_AGENTS_PATH || path.join(process.env.HOME, "Library", "LaunchAgents"),
  skills: process.env.SKILLS_PATH || path.join(process.env.HOME, ".claude", "skills"),
  // TypeScript and Swift roots TBD in their phases
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

const SUBSYSTEMS = new Set(["aiva", "mikeshaffer", "officeadmin-site", "ios-apps"]);
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
  "mcp.officeadmin.io",
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

async function parsePython(root, subsystem) {
  // TODO Phase 2: walk dir, parse .py with tree-sitter, emit
  // file/class/function nodes + imports/calls/contained_in edges.
  console.warn(`[stub] parsePython(${subsystem}) — Phase 2`);
  return { nodes: [], edges: [] };
}

async function parseLaunchd(root) {
  // TODO Phase 3: parse *.plist, emit launchd_job nodes + schedules edges.
  console.warn(`[stub] parseLaunchd — Phase 3`);
  return { nodes: [], edges: [] };
}

async function parseSkills(root) {
  // TODO Phase 3: walk SKILL.md frontmatter, emit skill nodes + implements edges.
  console.warn(`[stub] parseSkills — Phase 3`);
  return { nodes: [], edges: [] };
}

async function parseMcpRegistry() {
  // TODO Phase 3: read MCP registry, emit mcp_tool nodes + exposes_tool edges.
  console.warn(`[stub] parseMcpRegistry — Phase 3`);
  return { nodes: [], edges: [] };
}

async function parseTypescript() {
  // TODO Phase 4.
  console.warn(`[stub] parseTypescript — Phase 4`);
  return { nodes: [], edges: [] };
}

async function parseSwift() {
  // TODO Phase 5.
  console.warn(`[stub] parseSwift — Phase 5`);
  return { nodes: [], edges: [] };
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
