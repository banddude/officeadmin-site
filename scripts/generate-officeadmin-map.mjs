#!/usr/bin/env node

import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const outputDir = path.join(repoRoot, "officeadmin", "data");
const outputFile = path.join(outputDir, "system-map.json");
const home = os.homedir();
const now = new Date();

const sourcePaths = {
  aivaRepo: path.join(home, ".aiva"),
  mikeshafferRepo: path.join(home, "mikeshaffer"),
  docsDir: path.join(home, ".aiva", "modules", "docs", "content"),
  modulesDir: path.join(home, ".aiva", "modules"),
  mempalaceDb: path.join(home, ".mempalace", "knowledge_graph.sqlite3"),
  openclawSessions: path.join(home, ".openclaw", "agents", "main", "sessions"),
  openclawCronRuns: path.join(home, ".openclaw", "cron", "runs"),
  conversationsDb: path.join(home, ".aiva", "state", "conversations", "conversations.db"),
  externalDriveArchive: "/Volumes/MIKES HD/gws-drive-archive",
  stalwartArchive: "/var/lib/stalwart",
  officeadminRepo: repoRoot,
};

function exists(targetPath) {
  return fs.existsSync(targetPath);
}

function ensureDir(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function readFileSafe(targetPath) {
  try {
    return fs.readFileSync(targetPath, "utf8");
  } catch {
    return null;
  }
}

function statSafe(targetPath) {
  try {
    return fs.statSync(targetPath);
  } catch {
    return null;
  }
}

function humanBytes(bytes) {
  if (bytes == null || Number.isNaN(bytes)) return "n/a";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[index]}`;
}

function run(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      cwd: options.cwd || repoRoot,
      encoding: "utf8",
      timeout: options.timeout || 5000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function runShell(commandString, options = {}) {
  return run("bash", ["-lc", commandString], options);
}

function runRemote(commandString) {
  return run(
    "ssh",
    ["-o", "BatchMode=yes", "-o", "ConnectTimeout=4", "aiva", commandString],
    { cwd: repoRoot, timeout: 6000 }
  );
}

function parseIntSafe(value) {
  const numeric = Number.parseInt(String(value || "").trim(), 10);
  return Number.isNaN(numeric) ? null : numeric;
}

function countFilesWithExt(dirPath, extension) {
  if (!exists(dirPath)) return 0;
  let count = 0;
  const stack = [dirPath];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(extension)) {
        count += 1;
      }
    }
  }
  return count;
}

function countImmediateDirectories(dirPath) {
  if (!exists(dirPath)) return 0;
  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .length;
}

function countAllFiles(dirPath) {
  if (!exists(dirPath)) return 0;
  let count = 0;
  const stack = [dirPath];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === ".git") continue;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile()) {
        count += 1;
      }
    }
  }
  return count;
}

function repoInfo(repoPath, options = {}) {
  if (!exists(path.join(repoPath, ".git"))) {
    return {
      id: options.id,
      label: options.label,
      path: repoPath,
      present: false,
    };
  }

  const branch = run("git", ["-C", repoPath, "rev-parse", "--abbrev-ref", "HEAD"]);
  const sha = options.excludeLastCommit ? null : run("git", ["-C", repoPath, "rev-parse", "--short", "HEAD"]);
  const subject = options.excludeLastCommit ? null : run("git", ["-C", repoPath, "log", "-1", "--pretty=%s"]);
  const authoredAt = options.excludeLastCommit ? null : run("git", ["-C", repoPath, "log", "-1", "--pretty=%cI"]);
  const dirtyOutput = run("git", ["-C", repoPath, "status", "--porcelain"]) || "";
  const trackedFiles = options.fileCountMode === "filesystem"
    ? countAllFiles(repoPath)
    : (run("git", ["-C", repoPath, "ls-files"]) || "").split("\n").filter(Boolean).length;
  const remoteUrl = run("git", ["-C", repoPath, "remote", "get-url", "origin"]);

  return {
    id: options.id,
    label: options.label,
    path: repoPath,
    present: true,
    branch,
    shortSha: sha,
    lastCommit: {
      subject,
      authoredAt,
    },
    trackedFileCount: trackedFiles || 0,
    dirtyFileCount: options.includeDirty === false ? null : dirtyOutput.split("\n").filter(Boolean).length,
    remoteUrl,
  };
}

function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const result = {};
  for (const line of match[1].split("\n")) {
    const parts = line.split(":");
    if (parts.length < 2) continue;
    const key = parts.shift().trim();
    const value = parts.join(":").trim();
    result[key] = value;
  }
  return result;
}

function daysSince(dateString) {
  if (!dateString) return null;
  const value = new Date(dateString);
  if (Number.isNaN(value.getTime())) return null;
  return Math.floor((now.getTime() - value.getTime()) / (1000 * 60 * 60 * 24));
}

function docsHealth() {
  const files = exists(sourcePaths.docsDir)
    ? fs.readdirSync(sourcePaths.docsDir).filter((file) => file.endsWith(".md"))
    : [];
  const docs = files.map((file) => {
    const fullPath = path.join(sourcePaths.docsDir, file);
    const text = readFileSafe(fullPath) || "";
    const frontmatter = parseFrontmatter(text);
    return {
      file,
      title: text.match(/^#\s+(.+)$/m)?.[1] || file,
      status: frontmatter.status || "unknown",
      confidence: frontmatter.confidence || "unknown",
      lastVerified: frontmatter["last-verified"] || null,
      ageDays: daysSince(frontmatter["last-verified"]),
      path: fullPath,
    };
  });

  const byStatus = {};
  const byConfidence = {};
  for (const doc of docs) {
    byStatus[doc.status] = (byStatus[doc.status] || 0) + 1;
    byConfidence[doc.confidence] = (byConfidence[doc.confidence] || 0) + 1;
  }

  const stale = docs
    .filter((doc) => doc.ageDays != null && doc.ageDays > 30)
    .sort((a, b) => b.ageDays - a.ageDays)
    .slice(0, 12);

  return {
    count: docs.length,
    byStatus,
    byConfidence,
    staleThresholdDays: 30,
    staleCount: stale.length,
    stale,
    recentlyVerified: docs
      .filter((doc) => doc.lastVerified)
      .sort((a, b) => new Date(b.lastVerified) - new Date(a.lastVerified))
      .slice(0, 8),
  };
}

function modulesSummary() {
  if (!exists(sourcePaths.modulesDir)) {
    return {
      count: 0,
      byKind: {},
      byMachine: {},
      byHostRequirement: {},
      publicCommands: 0,
      publicSkills: 0,
      daemonCount: 0,
      topDependencies: [],
      topAuthProfiles: [],
    };
  }

  const modules = [];
  for (const entry of fs.readdirSync(sourcePaths.modulesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(sourcePaths.modulesDir, entry.name, "module.json");
    if (!exists(manifestPath)) continue;
    const raw = readFileSafe(manifestPath);
    if (!raw) continue;
    const manifest = JSON.parse(raw);
    modules.push({
      id: manifest.id,
      name: manifest.name,
      kind: manifest.kind || "unknown",
      machine: manifest.runtime?.machine || "unknown",
      hostRequirements: manifest.runtime?.host_requirements || [],
      publicCommands: (manifest.public_commands || []).length,
      publicSkills: (manifest.public_skills || []).length,
      moduleDeps: manifest.dependencies?.modules || [],
      authProfiles: manifest.dependencies?.auth_profiles || [],
      coreFeatures: manifest.dependencies?.core_features || [],
      hasDaemon: Boolean(manifest.daemon),
    });
  }

  const byKind = {};
  const byMachine = {};
  const byHostRequirement = {};
  const authProfiles = new Map();

  let publicCommands = 0;
  let publicSkills = 0;
  let daemonCount = 0;

  for (const module of modules) {
    byKind[module.kind] = (byKind[module.kind] || 0) + 1;
    byMachine[module.machine] = (byMachine[module.machine] || 0) + 1;
    publicCommands += module.publicCommands;
    publicSkills += module.publicSkills;
    if (module.hasDaemon) daemonCount += 1;

    for (const requirement of module.hostRequirements) {
      byHostRequirement[requirement] = (byHostRequirement[requirement] || 0) + 1;
    }

    for (const profile of module.authProfiles) {
      authProfiles.set(profile, (authProfiles.get(profile) || 0) + 1);
    }
  }

  return {
    count: modules.length,
    byKind,
    byMachine,
    byHostRequirement,
    publicCommands,
    publicSkills,
    daemonCount,
    topDependencies: modules
      .map((module) => ({
        id: module.id,
        name: module.name,
        moduleDependencyCount: module.moduleDeps.length,
        authProfileCount: module.authProfiles.length,
        coreFeatureCount: module.coreFeatures.length,
      }))
      .sort((a, b) => b.moduleDependencyCount - a.moduleDependencyCount || b.authProfileCount - a.authProfileCount)
      .slice(0, 10),
    topAuthProfiles: [...authProfiles.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12),
  };
}

function extractSection(markdown, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`^## ${escaped}\\n([\\s\\S]*?)(?=^## |\\Z)`, "m");
  return markdown.match(regex)?.[1] || "";
}

function parseMachines(markdown) {
  const ids = ["aiva (Mac mini)", "laptop (Mike's Apple Silicon laptop)", "imessage laptop"];
  return ids
    .map((heading) => {
      const section = extractSection(markdown, heading);
      if (!section) return null;
      const role = section.match(/- Role: \*\*(.+?)\*\*/) ? section.match(/- Role: \*\*(.+?)\*\*/)[1] : null;
      const hostname = section.match(/- Hostname: `(.+?)`/)?.[1] || null;
      const tailscale = section.match(/- Tailscale: `(.+?)`/)?.[1] || null;
      const keyPathsMatch = section.match(/Key paths on .*?:\n([\s\S]*?)$/);
      const keyPaths = keyPathsMatch
        ? keyPathsMatch[1]
            .split("\n")
            .filter((line) => line.trim().startsWith("- "))
            .map((line) => line.replace(/^- /, "").trim())
        : [];
      const notes = section
        .split("\n")
        .filter((line) => line.trim().startsWith("- ") && !line.includes("Role:") && !line.includes("Hostname:") && !line.includes("Tailscale:"))
        .slice(0, 6)
        .map((line) => line.replace(/^- /, "").trim());
      return {
        id: heading.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
        label: heading,
        role,
        hostname,
        tailscale,
        keyPaths,
        notes,
      };
    })
    .filter(Boolean);
}

function parseRoadmap(markdown) {
  const sourceOfTruthSection = markdown.match(/^### Source of truth\n([\s\S]*?)(?=^### |^## |\Z)/m)?.[1] || "";
  const sourceOfTruth = sourceOfTruthSection
    .split("\n")
    .filter((line) => line.trim().startsWith("- "))
    .map((line) => line.replace(/^- /, "").trim());

  const workstreamSection = markdown.match(/^## Workstreams\n([\s\S]*)$/m)?.[1] || "";
  const chunks = workstreamSection
    .split(/^### /m)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  const workstreams = chunks.map((chunk) => {
    const lines = chunk.split("\n");
    const title = lines[0].trim();
    const goal = chunk.match(/Goal: (.+)/)?.[1] || null;
    const deliverableBlock = chunk.match(/Deliverables:\n([\s\S]*?)(?=\n[A-Z][^\n]*:|\nValidation:|\nNear-term outcomes:|\Z)/);
    const validationBlock = chunk.match(/Validation:\n```[\s\S]*?\n([\s\S]*?)```/);
    const outputBlock = chunk.match(/Output:\n([\s\S]*?)(?=\n[A-Z][^\n]*:|\nValidation:|\nNear-term outcomes:|\Z)/);
    const nearTermBlock = chunk.match(/Near-term outcomes:\n([\s\S]*?)(?=\n[A-Z][^\n]*:|\nValidation:|\Z)/);

    function bulletLines(blockMatch) {
      if (!blockMatch) return [];
      return blockMatch[1]
        .split("\n")
        .filter((line) => line.trim().startsWith("- ") || /^\d+\./.test(line.trim()))
        .map((line) => line.replace(/^[-0-9. ]+/, "").trim());
    }

    return {
      id: title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      title,
      goal,
      deliverables: bulletLines(deliverableBlock),
      output: bulletLines(outputBlock),
      nearTermOutcomes: bulletLines(nearTermBlock),
      validations: validationBlock
        ? validationBlock[1]
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
        : [],
    };
  });

  return { sourceOfTruth, workstreams };
}

function parseMarkdownTable(tableText) {
  const lines = tableText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|"));
  if (lines.length < 2) return [];
  const headers = lines[0]
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim());
  return lines
    .slice(2)
    .map((line) =>
      line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim())
    )
    .filter((cells) => cells.some(Boolean))
    .map((cells) => {
      const row = {};
      headers.forEach((header, index) => {
        row[header] = cells[index] || "";
      });
      return row;
    });
}

function parseMemoryMap(markdown) {
  const matches = [...markdown.matchAll(/^## Category (\d+) - (.+)$/gm)];
  const categories = matches.map((match, index) => {
    const start = match.index + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index : markdown.length;
    const section = markdown.slice(start, end);
    const tableMatch = section.match(/(\|.+\|\n\|[-| ]+\|\n(?:\|.*\|\n?)*)/);
    return {
      id: Number.parseInt(match[1], 10),
      title: match[2].trim(),
      owner: section.match(/Module owner(?:s)?: (.+?)(?:\.|\n)/)?.[1] || null,
      rows: tableMatch ? parseMarkdownTable(tableMatch[1]) : [],
      note: section
        .trim()
        .split("\n")
        .find((line) => line && !line.startsWith("|") && !line.startsWith("Module owner") && !line.startsWith("Launchd")) || null,
    };
  });

  const authorities = [];
  for (const category of categories) {
    for (const row of category.rows) {
      const sourceOfTruth = row["Source of truth"] || row["Notes"] || "";
      if (!sourceOfTruth) continue;
      authorities.push({
        domain: row.What || category.title,
        category: category.title,
        where: row.Where || "",
        size: row.Size || "",
        sourceOfTruth,
      });
    }
  }

  return { categories, authorities };
}

function remoteOrLocalCount(localPath, remoteCommand) {
  const localCount = parseIntSafe(runShell(`find '${localPath}' -type f 2>/dev/null | wc -l`));
  if (localCount != null && localCount > 0) return localCount;
  return parseIntSafe(runRemote(remoteCommand));
}

function remoteOrLocalPathInfo(localPath, remoteExistCommand, remoteSizeCommand) {
  const localStats = statSafe(localPath);
  if (localStats) {
    return {
      present: true,
      size: localStats.isFile() ? humanBytes(localStats.size) : runShell(`du -sh '${localPath}' 2>/dev/null | cut -f1`) || "n/a",
      location: "local",
    };
  }

  const remotePresent = runRemote(remoteExistCommand);
  if (remotePresent === "present") {
    return {
      present: true,
      size: runRemote(remoteSizeCommand) || "n/a",
      location: "aiva",
    };
  }

  return {
    present: false,
    size: "n/a",
    location: null,
  };
}

function buildRoots(modules, docs, repos, memoryMap, roadmap) {
  const entityFolders = countImmediateDirectories(path.join(sourcePaths.mikeshafferRepo, "entities"));
  const workRecords = countFilesWithExt(path.join(sourcePaths.mikeshafferRepo, "entities"), ".json");
  const memoryNotes = countFilesWithExt(path.join(sourcePaths.mikeshafferRepo, "memory"), ".md");

  const mempalaceEntities = parseIntSafe(runShell(`sqlite3 '${sourcePaths.mempalaceDb}' 'select count(*) from entities;'`)) ||
    parseIntSafe(runRemote(`sqlite3 ~/.mempalace/knowledge_graph.sqlite3 'select count(*) from entities;'`));
  const mempalaceTriples = parseIntSafe(runShell(`sqlite3 '${sourcePaths.mempalaceDb}' 'select count(*) from triples;'`)) ||
    parseIntSafe(runRemote(`sqlite3 ~/.mempalace/knowledge_graph.sqlite3 'select count(*) from triples;'`));

  const mempalaceInfo = remoteOrLocalPathInfo(
    sourcePaths.mempalaceDb,
    "[ -f ~/.mempalace/knowledge_graph.sqlite3 ] && echo present",
    "du -sh ~/.mempalace/knowledge_graph.sqlite3 2>/dev/null | cut -f1"
  );

  const openclawSessionCount = remoteOrLocalCount(
    sourcePaths.openclawSessions,
    "find ~/.openclaw/agents/main/sessions -name '*.jsonl' -type f 2>/dev/null | wc -l"
  );
  const openclawRunCount = remoteOrLocalCount(
    sourcePaths.openclawCronRuns,
    "find ~/.openclaw/cron/runs -name '*.jsonl' -type f 2>/dev/null | wc -l"
  );

  const driveArchive = remoteOrLocalPathInfo(
    sourcePaths.externalDriveArchive,
    "[ -d '/Volumes/MIKES HD/gws-drive-archive' ] && echo present",
    "du -sh '/Volumes/MIKES HD/gws-drive-archive' 2>/dev/null | cut -f1"
  );
  const stalwartArchive = remoteOrLocalPathInfo(
    sourcePaths.stalwartArchive,
    "[ -d /var/lib/stalwart ] && echo present",
    "du -sh /var/lib/stalwart 2>/dev/null | cut -f1"
  );

  return [
    {
      id: "aiva",
      label: "AIVA",
      type: "runtime",
      path: sourcePaths.aivaRepo,
      present: exists(sourcePaths.aivaRepo),
      description: "Runtime host code, generated command surface, module orchestration, and shared state policy.",
      metrics: [
        { label: "Modules", value: modules.count },
        { label: "Public commands", value: modules.publicCommands },
        { label: "Docs", value: docs.count },
      ],
    },
    {
      id: "mikeshaffer",
      label: "mikeshaffer",
      type: "workspace",
      path: sourcePaths.mikeshafferRepo,
      present: exists(sourcePaths.mikeshafferRepo),
      description: "Durable work memory, entity folders, doctrine, drafts, and historical notes.",
      metrics: [
        { label: "Entity folders", value: entityFolders },
        { label: "Tracked JSON docs", value: workRecords },
        { label: "Memory notes", value: memoryNotes },
      ],
    },
    {
      id: "mempalace",
      label: "MemPalace",
      type: "memory",
      path: sourcePaths.mempalaceDb,
      present: mempalaceInfo.present,
      description: "Temporal memory graph and semantic recall substrate for long term context.",
      metrics: [
        { label: "Entities", value: mempalaceEntities ?? "n/a" },
        { label: "Triples", value: mempalaceTriples ?? "n/a" },
        { label: "DB size", value: mempalaceInfo.size },
      ],
    },
    {
      id: "openclaw",
      label: "OpenClaw",
      type: "runtime",
      path: path.join(home, ".openclaw"),
      present: openclawSessionCount != null,
      description: "Attached AI runtime for chat, subagents, cron, and session generation.",
      metrics: [
        { label: "Session files", value: openclawSessionCount ?? "n/a" },
        { label: "Cron runs", value: openclawRunCount ?? "n/a" },
        { label: "Role", value: "attached runtime" },
      ],
    },
    {
      id: "apple-apps",
      label: "Apple Apps",
      type: "authority",
      path: "Contacts, Notes, Reminders, Calendar, Messages",
      present: true,
      description: "Native authority layer for identity, tasks, notes, calendar, and iMessage source data.",
      metrics: [
        { label: "Authority rules", value: roadmap.sourceOfTruth.filter((line) => line.includes("Apple")).length || 3 },
        { label: "Docs categories", value: memoryMap.categories.filter((category) => /Apple|iMessage/i.test(category.title)).length },
        { label: "Mode", value: "source of truth" },
      ],
    },
    {
      id: "google-workspace",
      label: "Google Workspace",
      type: "authority",
      path: "Gmail, Drive, Calendar, Chat",
      present: true,
      description: "Live collaboration and communications surface, with archive and mirror layers around it.",
      metrics: [
        { label: "Auth profiles", value: modules.topAuthProfiles.filter((item) => item.name.startsWith("google.")).length },
        { label: "Archive mirror", value: stalwartArchive.present ? "present" : "missing" },
        { label: "Drive archive", value: driveArchive.present ? driveArchive.size : "missing" },
      ],
    },
    {
      id: "archives",
      label: "Archives",
      type: "storage",
      path: "/Volumes/MIKES HD, /var/lib/stalwart",
      present: driveArchive.present || stalwartArchive.present,
      description: "Cold storage and mirrored history for Gmail, Google Drive, media, and other large state.",
      metrics: [
        { label: "Drive archive", value: driveArchive.present ? driveArchive.size : "missing" },
        { label: "Mail archive", value: stalwartArchive.present ? stalwartArchive.size : "missing" },
        { label: "Authority mode", value: "mirror + backup" },
      ],
    },
    {
      id: "officeadmin-site",
      label: "officeadmin-site",
      type: "surface",
      path: repoRoot,
      present: true,
      description: "Read only generated view over docs, repos, and runtime snapshots for fast system understanding.",
      metrics: [
        { label: "Files", value: repos.find((repo) => repo.id === "officeadmin-site")?.trackedFileCount || 0 },
        { label: "Generated page", value: "/officeadmin" },
        { label: "Refresh", value: "local generator" },
      ],
    },
  ];
}

function buildEdges() {
  return [
    { from: "officeadmin-site", to: "aiva", label: "docs + repo state" },
    { from: "officeadmin-site", to: "mikeshaffer", label: "workspace + entity state" },
    { from: "aiva", to: "mikeshaffer", label: "reads doctrine + work memory" },
    { from: "aiva", to: "mempalace", label: "hydrates context" },
    { from: "openclaw", to: "mempalace", label: "session ingest" },
    { from: "aiva", to: "openclaw", label: "attached runtime" },
    { from: "aiva", to: "apple-apps", label: "native authorities" },
    { from: "aiva", to: "google-workspace", label: "live comms + files" },
    { from: "aiva", to: "archives", label: "mirrors + backups" },
  ];
}

function buildWarnings(docs, modules, repos, roots) {
  const warnings = [];
  if (docs.staleCount > 0) {
    warnings.push({
      level: "warning",
      message: `${docs.staleCount} docs are older than ${docs.staleThresholdDays} days.`,
    });
  }
  const dirtyRepos = repos.filter((repo) => repo.dirtyFileCount != null && repo.dirtyFileCount > 0);
  if (dirtyRepos.length > 0) {
    warnings.push({
      level: "warning",
      message: `${dirtyRepos.length} tracked repos have uncommitted changes.`,
    });
  }
  if (!roots.find((root) => root.id === "archives")?.present) {
    warnings.push({
      level: "warning",
      message: "Archive roots are not visible from this snapshot host.",
    });
  }
  if (modules.count === 0) {
    warnings.push({
      level: "error",
      message: "No module manifests were discovered under ~/.aiva/modules.",
    });
  }
  return warnings;
}

function buildSnapshot(modules, docs, roots, repos, workstreams) {
  const root = (id) => roots.find((item) => item.id === id);
  return {
    modules: modules.count,
    publicCommands: modules.publicCommands,
    publicSkills: modules.publicSkills,
    docs: docs.count,
    staleDocs: docs.staleCount,
    entities: root("mikeshaffer")?.metrics.find((metric) => metric.label === "Entity folders")?.value || 0,
    mempalaceTriples: root("mempalace")?.metrics.find((metric) => metric.label === "Triples")?.value || "n/a",
    openclawSessions: root("openclaw")?.metrics.find((metric) => metric.label === "Session files")?.value || "n/a",
    dirtyRepos: repos.filter((repo) => repo.dirtyFileCount != null && repo.dirtyFileCount > 0).length,
    workstreams: workstreams.length,
    driveArchive: root("archives")?.metrics.find((metric) => metric.label === "Drive archive")?.value || "n/a",
  };
}

function buildGeneratedSources() {
  return [
    { label: "AIVA docs", path: sourcePaths.docsDir, present: exists(sourcePaths.docsDir), type: "docs" },
    { label: "AIVA modules", path: sourcePaths.modulesDir, present: exists(sourcePaths.modulesDir), type: "code" },
    { label: "AIVA repo", path: sourcePaths.aivaRepo, present: exists(sourcePaths.aivaRepo), type: "repo" },
    { label: "mikeshaffer repo", path: sourcePaths.mikeshafferRepo, present: exists(sourcePaths.mikeshafferRepo), type: "repo" },
    { label: "MemPalace DB", path: sourcePaths.mempalaceDb, present: exists(sourcePaths.mempalaceDb), type: "state" },
    { label: "OpenClaw sessions", path: sourcePaths.openclawSessions, present: exists(sourcePaths.openclawSessions), type: "state" },
    { label: "Stalwart archive", path: sourcePaths.stalwartArchive, present: exists(sourcePaths.stalwartArchive), type: "archive" },
    { label: "GWS drive archive", path: sourcePaths.externalDriveArchive, present: exists(sourcePaths.externalDriveArchive), type: "archive" },
  ];
}

function main() {
  const machinesMarkdown = readFileSafe(path.join(sourcePaths.docsDir, "MACHINES.md")) || "";
  const roadmapMarkdown = readFileSafe(path.join(sourcePaths.docsDir, "PRODUCTION-READINESS-ROADMAP.md")) || "";
  const memoryMapMarkdown = readFileSafe(path.join(sourcePaths.docsDir, "MEMORY-MAP.md")) || "";

  const docs = docsHealth();
  const modules = modulesSummary();
  const repos = [
    repoInfo(sourcePaths.aivaRepo, { id: "aiva", label: "AIVA" }),
    repoInfo(sourcePaths.mikeshafferRepo, { id: "mikeshaffer", label: "mikeshaffer" }),
    repoInfo(repoRoot, {
      id: "officeadmin-site",
      label: "officeadmin-site",
      includeDirty: false,
      excludeLastCommit: true,
      fileCountMode: "filesystem",
    }),
  ];
  const machines = parseMachines(machinesMarkdown);
  const roadmap = parseRoadmap(roadmapMarkdown);
  const memoryMap = parseMemoryMap(memoryMapMarkdown);
  const roots = buildRoots(modules, docs, repos, memoryMap, roadmap);
  const warnings = buildWarnings(docs, modules, repos, roots);
  const snapshot = buildSnapshot(modules, docs, roots, repos, roadmap.workstreams);

  const data = {
    version: 1,
    generatedAt: now.toISOString(),
    generatedOnHost: os.hostname(),
    refreshCommand: "node scripts/generate-officeadmin-map.mjs",
    warnings,
    snapshot,
    repos,
    docs,
    modules,
    machines,
    roadmap,
    roots,
    edges: buildEdges(),
    authorities: memoryMap.authorities,
    memoryCategories: memoryMap.categories,
    generatedSources: buildGeneratedSources(),
  };

  ensureDir(outputDir);
  fs.writeFileSync(outputFile, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  process.stdout.write(`Wrote ${outputFile}\n`);
}

main();
