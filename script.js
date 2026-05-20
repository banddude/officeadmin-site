/* =============================================================
   OfficeAdmin — interactive bits
   1) Live activity ticker (clone list contents for seamless loop)
   2) Hand-drawn node graph of the modules powering OfficeAdmin
   Lightweight, no dependencies.
   ============================================================= */

// ---------- Auto-populate "Real modules, doing real jobs" list from JSON ----------
(function () {
  const list = document.getElementById('modulesAutoList');
  const foot = document.getElementById('modulesAutoFooter');
  if (!list) return;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

  // Trim the MODULE.md purpose paragraph to something card-friendly.
  function trim(text, max = 220) {
    if (!text) return '';
    const t = text.replace(/\s+/g, ' ').trim();
    if (t.length <= max) return t;
    // chop at the last sentence-end before the limit
    const cut = t.slice(0, max);
    const lastDot = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
    return (lastDot > 80 ? cut.slice(0, lastDot + 1) : cut.trimEnd()) + (lastDot > 80 ? '' : '…');
  }

  fetch('modules-docs.json', { cache: 'no-cache' })
    .then(r => r.ok ? r.json() : Promise.reject(new Error(r.status)))
    .then(data => {
      // featured modules in order, then fill with top-of-list if short
      const featured = data.modules
        .filter(m => Number.isInteger(m.featured_order))
        .sort((a, b) => a.featured_order - b.featured_order);

      const picks = featured.length ? featured : data.modules.slice(0, 10);

      // tiny inline-markdown: `code`, **bold**, *italic*
      function inlineMd(s) {
        let h = esc(s);
        h = h.replace(/`([^`]+)`/g, (_, c) => `<code style="font-family:'JetBrains Mono',monospace;font-size:0.9em;background:var(--paper-3);padding:0 4px;border-radius:3px;border:1px solid var(--ink-3);">${c}</code>`);
        h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        return h;
      }

      list.innerHTML = picks.map(m => `
        <li class="mod">
          <code class="mod__name">${esc(m.slug)}</code>
          <p class="mod__job">${inlineMd(trim(m.purpose || m.skill_description || m.notes || ''))}</p>
        </li>
      `).join('');

      if (foot) {
        const total = data.count;
        foot.innerHTML = `${total}-plus modules total in the codebase. These ${picks.length} do the heavy lifting on a normal Tuesday.
          <span style="display:block; font-size:13px; color:var(--ink-3); font-family:var(--hand-accent); margin-top:6px;">
            Auto-generated from <code style="font-family:'JetBrains Mono',monospace; font-size:11.5px; background:var(--paper-3); padding:1px 5px; border-radius:3px; border:1px solid var(--ink-3);">~/.aiva/modules/</code>
            · last refresh ${new Date(data.generated_at).toLocaleString()}
          </span>`;
      }
    })
    .catch(err => {
      console.warn('[modules list] could not load modules-docs.json:', err);
      list.innerHTML = '<li class="mod"><code class="mod__name">offline</code><p class="mod__job">Could not load the module catalog. Re-run <code>python3 bin/generate-docs.py</code> and refresh.</p></li>';
      if (foot) foot.textContent = '';
    });
})();

// ---------- Activity ticker (seamless loop) ----------
(function () {
  const list = document.getElementById('tickerList');
  if (!list) return;
  // duplicate every item so the -50% translate loops cleanly
  Array.from(list.children).forEach(li => {
    const c = li.cloneNode(true);
    c.setAttribute('aria-hidden', 'true');
    list.appendChild(c);
  });
})();

// ---------- Webmap (interactive system graph — loaded from modules-docs.json) ----------
// The catalog (modules, categories, edges) is now generated from
// ~/.aiva/modules/*/ by bin/generate-docs.py and lives in modules-docs.json.
// The block below is a fallback shipped with the script so the page still
// works if the JSON fetch fails (e.g. file:// previews).
(function () {
  const root = document.getElementById('webmap');
  if (!root) return;
  const svg = document.getElementById('webmapSvg');
  const panel = document.getElementById('webmapPanel');
  const panelHint = panel.querySelector('.panel__hint');
  const panelContent = panel.querySelector('.panel__content');
  const panelName = panel.querySelector('.panel__name');
  const panelCat = panel.querySelector('.panel__cat');
  const panelDesc = panel.querySelector('.panel__desc');
  const panelMachine = panel.querySelector('.panel__machine');
  const panelKind = panel.querySelector('.panel__kind');
  const panelPath = panel.querySelector('.panel__path');
  const panelEdges = panel.querySelector('.panel__edges');
  const filtersEl = document.getElementById('wmFilters');
  const searchEl = document.getElementById('wmSearch');
  const countEl = document.getElementById('webmapCount');

  // ---------- fallback static catalog (used only if JSON fetch fails) ----------
  // categories drive cluster layout + filter buttons + node color
  const FALLBACK_CATS = {
    inbound:  { label: 'Inbound',   tint: '#d9e7f1', stroke: '#4d6f95' },
    memory:   { label: 'Memory',    tint: '#d9eccf', stroke: '#5b8a3a' },
    workflow: { label: 'Workflow',  tint: '#fdf1bd', stroke: '#c98b2b' },
    business: { label: 'Business',  tint: '#fce5b9', stroke: '#b3492f' },
    macos:    { label: 'macOS',     tint: '#e4dcca', stroke: '#3a3733' },
    ai:       { label: 'AI engines',tint: '#e4d2eb', stroke: '#7a4f99' },
    output:   { label: 'Output',    tint: '#f3d2bf', stroke: '#c98b2b' },
    infra:    { label: 'Infra',     tint: '#e0d8c6', stroke: '#6a665e' },
    util:     { label: 'Utilities', tint: '#dcd6c3', stroke: '#7a7568' },
    personal: { label: 'Personal',  tint: '#ead7bf', stroke: '#8a6a1f' },
  };

  // each module: id, name, category, description, machine, kind
  const FALLBACK_M = {
    // INBOUND
    'email-labeler':   { c:'inbound',  n:'email-labeler', d:'Local Gmail classifier and Gmail→Stalwart archive sync across three accounts.', m:'aiva', k:'integration' },
    'imessage':        { c:'inbound',  n:'imessage',     d:'Reads incoming iMessages from Messages.app DB. Real-time search + send.', m:'split', k:'tool' },
    'whatsapp':        { c:'inbound',  n:'whatsapp',     d:'Reads WhatsApp group chats and DMs.', m:'aiva', k:'integration' },
    'instagram':       { c:'inbound',  n:'instagram',    d:'Reads Instagram DMs within the messaging window. Replies stay manual.', m:'aiva', k:'integration' },
    'google':          { c:'inbound',  n:'google',       d:'Umbrella for Gmail, Calendar, Drive, Sheets, Docs, Tasks. Auth + APIs.', m:'aiva', k:'integration' },
    'messages':        { c:'inbound',  n:'messages',     d:'Default responder message client. Used by the comms-pipeline auto-sender.', m:'aiva', k:'integration' },

    // MEMORY
    'know':            { c:'memory',   n:'know',         d:'Unified dossier CLI. Fans out to seven backends, merges in under a second.', m:'split', k:'utility', star:true },
    'mempalace':       { c:'memory',   n:'mempalace',    d:'Postgres + pgvector knowledge graph extracted from AI session transcripts.', m:'aiva', k:'tool' },
    'identity':        { c:'memory',   n:'identity',     d:'Resolves any name, slug, email, phone, or MemPalace ID to one canonical entity.', m:'source-local', k:'utility' },
    'memory':          { c:'memory',   n:'memory',       d:'Deprecated Apple-Notes-backed memory hydration. Kept for compatibility.', m:'split', k:'system' },
    'contacts':        { c:'memory',   n:'contacts',     d:'Apple Contacts CRUD + search.', m:'split', k:'integration' },
    'conversations':   { c:'memory',   n:'conversations',d:'Voice memos and Viaim phone calls → searchable transcripts with speaker ID.', m:'aiva', k:'integration' },
    'session-search':  { c:'memory',   n:'session-search',short:'sessions', d:'Cross-source search across Claude/Codex/OpenClaw sessions, conversations, iMessage.', m:'aiva', k:'utility' },
    'commitments':     { c:'memory',   n:'commitments',  d:'State machine for every in-flight thing between you and someone else. Open/blocked/done/dead.', m:'aiva', k:'tool' },
    'open-loops':      { c:'memory',   n:'open-loops',   d:'Conversation balls and follow-throughs. Older predecessor to commitments.', m:'aiva', k:'tool' },
    'dependency-tracker':{ c:'memory', n:'dependency-tracker', short:'dep-tracker', d:'waiting-on dependency chains. "You can\'t respond to A until B replies."', m:'aiva', k:'tool' },

    // WORKFLOW
    'comms-pipeline':  { c:'workflow', n:'comms-pipeline', d:'The orchestrator. Scan → resolve → know → draft → tier-classify → route. Runs on launchd cron.', m:'aiva', k:'system', star:true },
    'comms-expert':    { c:'workflow', n:'comms-expert',   d:'Interactive drafting brain. Researches context across channels, drafts messages. Never sends.', m:'split', k:'utility' },
    'schedule-send':   { c:'workflow', n:'schedule-send',  d:'One-shot future scheduler. Self-destructing LaunchAgent fires once and cleans itself up.', m:'aiva', k:'tool' },

    // BUSINESS
    'quickbooks':      { c:'business', n:'quickbooks',     d:'Creates estimates and invoices in QBO. Sends invoices by email. AR aging. Wraps QB Time too.', m:'aiva', k:'integration', star:true },
    'electrical-estimating':{ c:'business', n:'electrical-estimating', short:'estimating', d:'Pricing reference: rate, service-call fee, minimums, tax rate, materials markup. Skill-only (no CLI).', m:'split', k:'tool' },
    'mikeshaffer':     { c:'business', n:'mikeshaffer',    d:'Shaffer Construction work hub: tasks, jobs, bids, entities. CLI on top of the entities folder.', m:'aiva', k:'tool' },
    'akaunting':       { c:'business', n:'akaunting',      d:'Self-hosted business hub at officeadmin.shaffercon.com. Custom modules for habits, contacts, banking.', m:'aiva', k:'integration' },

    // MACOS
    'aiva':            { c:'macos',    n:'aiva',           d:'Signed gateway binary `macos`. Single entry point to all macOS system services.', m:'split', k:'system' },
    'calendar':        { c:'macos',    n:'calendar',       d:'Apple Calendar via EventKit. List/create/edit/delete events.', m:'split', k:'integration' },
    'reminders':       { c:'macos',    n:'reminders',      d:'Apple Reminders CRUD. Sync across iPhone / Mac / aiva.', m:'split', k:'integration' },
    'notes':           { c:'macos',    n:'notes',          d:'Apple Notes CRUD across folders.', m:'split', k:'integration' },
    'callhistory':     { c:'macos',    n:'callhistory',    d:'Privileged reader for macOS CallHistoryDB.', m:'laptop', k:'tool' },
    'apple-maps':      { c:'macos',    n:'apple-maps',     d:'Apple Maps search, geocoding, directions, guides.', m:'split', k:'integration' },
    'macos-file-tags': { c:'macos',    n:'macos-file-tags', short:'file-tags', d:'Finder tag management.', m:'split', k:'tool' },
    'osascript-shim':  { c:'macos',    n:'osascript-shim', d:'AppleScript serializer to prevent concurrent osascript wedging.', m:'aiva', k:'tool' },

    // AI
    'claude':          { c:'ai',       n:'claude',         d:'Anthropic Claude backend integration. BYOK.', m:'split', k:'model' },
    'codex':           { c:'ai',       n:'codex',          d:'OpenAI Codex backend integration. BYOK.', m:'split', k:'model' },
    'gemini':          { c:'ai',       n:'gemini',         d:'Google Gemini backend integration. BYOK.', m:'split', k:'model' },
    'glm':             { c:'ai',       n:'glm',            d:'Zhipu GLM backend integration. BYOK.', m:'split', k:'model' },

    // OUTPUT
    'sendblue':        { c:'output',   n:'sendblue',       d:'Outbound iMessage transport. Dispatches from your number.', m:'aiva', k:'integration' },
    'notify':          { c:'output',   n:'notify',         d:'AIVA notifications + API server. Webhook ingress.', m:'aiva', k:'integration' },
    'talk':            { c:'output',   n:'talk',           d:'Speech output with target routing (phone / laptop / aiva / all).', m:'split', k:'system' },

    // INFRA
    'sync':            { c:'infra',    n:'sync',           d:'Bidirectional git sync ~/.aiva and ~/mikeshaffer between laptop and aiva.', m:'aiva', k:'tool' },
    'system-inventory':{ c:'infra',    n:'system-inventory', short:'sys-inventory', d:'Living map of AIVA + OfficeAdmin. Source of truth for this graph.', m:'aiva', k:'system' },
    'system-fixes':    { c:'infra',    n:'system-fixes',     short:'sys-fixes', d:'Log of every systemic correction made to AIVA.', m:'aiva', k:'tool' },
    'launchd':         { c:'infra',    n:'launchd',        d:'Launchd guidance + service inventory.', m:'aiva', k:'system' },
    'agents':          { c:'infra',    n:'agents',         d:'Background tmux agent runner for AIVA.', m:'aiva', k:'system' },
    'jobs':            { c:'infra',    n:'jobs',           d:'Shared cross-module jobs system.', m:'aiva', k:'system' },
    'docs':            { c:'infra',    n:'docs',           d:'System documentation framework with drift checker.', m:'source-local', k:'utility' },
    'start-here':      { c:'infra',    n:'start-here',     d:'Cold-start orientation for fresh agents.', m:'source-local', k:'utility' },
    'module-suggester':{ c:'infra',    n:'module-suggester', short:'mod-suggester', d:'Reviews completed sessions, proposes new skills.', m:'aiva', k:'system' },

    // UTIL
    'ios':             { c:'util',     n:'ios',            d:'Full iOS app pipeline: build, test, sign, ship to TestFlight + App Store.', m:'laptop', k:'tool' },
    'frontend-design': { c:'util',     n:'frontend-design', short:'fe-design', d:'Frontend design skill.', m:'split', k:'utility' },
    'skill-creator':   { c:'util',     n:'skill-creator',  d:'Guide for creating effective AIVA / Claude skills.', m:'split', k:'utility' },
    'mcporter':        { c:'util',     n:'mcporter',       d:'MCP server discovery + CLI generation.', m:'split', k:'utility' },
    'copyparty':       { c:'util',     n:'copyparty',      d:'File-sharing links via CopyParty.', m:'aiva', k:'utility' },
    'transcribe':      { c:'util',     n:'transcribe',     d:'whisper-cpp transcription of files and YouTube URLs.', m:'split', k:'utility' },
    'agent-browser':   { c:'util',     n:'agent-browser',  d:'Vercel Labs agent-browser. AI-native headless Chrome CLI.', m:'split', k:'tool' },
    'cloudflare':      { c:'util',     n:'cloudflare',     d:'Cloudflare DNS, tunnels, cache management.', m:'split', k:'integration' },
    'n8n':             { c:'util',     n:'n8n',            d:'Workflow building, expressions, validation.', m:'split', k:'integration' },
    'g2c':             { c:'util',     n:'g2c',            d:'Cleans a GLM session so Claude can resume it.', m:'aiva', k:'utility' },
    'aiva-user-chat-session':{ c:'util', n:'aiva-user-chat-session', short:'chat-session', d:'Inspects Claude Code chat JSONL tied to AIVA responder.', m:'aiva', k:'utility' },

    // PERSONAL (off-product)
    'alpaca':          { c:'personal', n:'alpaca',         d:'Alpaca stock and crypto trading.', m:'aiva', k:'integration' },
    'pidog':           { c:'personal', n:'pidog',          d:'SunFounder PiDog robot HTTP control.', m:'split', k:'tool' },
    'shaffer-blogger': { c:'personal', n:'shaffer-blogger',d:'shaffercon.com EV-charging blog automation.', m:'laptop', k:'integration' },
    'skatefit-github': { c:'personal', n:'skatefit-github',d:'SkateFit app data sync via GitHub.', m:'split', k:'integration' },
    'habits':          { c:'personal', n:'habits',         d:'Daily habit tracker.', m:'aiva', k:'tool' },
    'family':          { c:'personal', n:'family',         d:'Family relationship hub with sub-skills per person.', m:'split', k:'utility' },
    'grandma-mac':     { c:'personal', n:'grandma-mac',    d:'Remote control of Grandma\'s Mac over Tailscale.', m:'laptop', k:'integration' },
  };

  // explicit relationships (directional: from → to)
  // only the meaningful ones — keeps the graph readable
  const FALLBACK_EDGES = [
    // inbound to pipeline
    ['email-labeler','comms-pipeline'], ['imessage','comms-pipeline'], ['whatsapp','comms-pipeline'],
    ['instagram','comms-pipeline'], ['google','comms-pipeline'], ['messages','comms-pipeline'],
    ['conversations','comms-pipeline'],
    // pipeline outputs
    ['comms-pipeline','identity'], ['comms-pipeline','know'], ['comms-pipeline','comms-expert'],
    ['comms-pipeline','commitments'], ['comms-pipeline','schedule-send'],
    ['comms-pipeline','sendblue'], ['comms-pipeline','notify'], ['comms-pipeline','talk'],
    // know fan-out
    ['know','identity'], ['know','mempalace'], ['know','contacts'],
    ['know','conversations'], ['know','session-search'], ['know','commitments'],
    ['know','callhistory'],
    // memory feeders
    ['conversations','mempalace'], ['contacts','identity'],
    ['dependency-tracker','commitments'], ['open-loops','commitments'],
    // business links
    ['quickbooks','know'], ['quickbooks','mikeshaffer'], ['mikeshaffer','akaunting'],
    ['electrical-estimating','comms-expert'],
    // AI engines feed drafters
    ['claude','comms-expert'], ['claude','comms-pipeline'],
    ['codex','comms-expert'], ['gemini','comms-expert'], ['glm','comms-expert'],
    // macos bridge
    ['aiva','contacts'], ['aiva','calendar'], ['aiva','reminders'],
    ['aiva','notes'], ['aiva','callhistory'], ['aiva','apple-maps'],
    // schedule-send drives outputs
    ['schedule-send','sendblue'], ['schedule-send','messages'],
    // module-suggester reads sessions
    ['module-suggester','session-search'],
  ];

  // ---------- load catalog from JSON (with static fallback) ----------
  let CATS, M, EDGES;

  fetch('modules-docs.json', { cache: 'no-cache' })
    .then(r => r.ok ? r.json() : Promise.reject(new Error(r.status)))
    .then(data => {
      // build M from data.modules
      M = {};
      for (const mod of data.modules) {
        // skip personal/off-product? no — show them, just in their cluster.
        M[mod.slug] = {
          c: mod.product_category || 'util',
          n: mod.slug,
          short: mod.short_label,
          d: mod.purpose || mod.skill_description || mod.notes || '',
          m: mod.machine || '—',
          k: mod.kind || '—',
          star: !!mod.star,
        };
      }
      // edges
      EDGES = (data.edges || []).filter(([a, b]) => M[a] && M[b]);
      // categories — merge fetched + defaults so missing ones don't break
      CATS = Object.assign({}, FALLBACK_CATS, data.categories || {});
      if (countEl && data.generated_at) {
        const when = new Date(data.generated_at);
        countEl.dataset.generated = when.toISOString();
      }
      renderEverything();
    })
    .catch(err => {
      console.warn('[webmap] could not load modules-docs.json, using fallback:', err);
      CATS = FALLBACK_CATS;
      M = FALLBACK_M;
      EDGES = FALLBACK_EDGES;
      renderEverything();
    });

  // Everything below runs inside renderEverything() so it sees the loaded
  // CATS, M, EDGES instead of capturing the fallback values at parse time.
  function renderEverything() {

  // ---------- desktop cluster layout (slots in a 3x3 grid, auto-sized) ----------
  // Each cluster: a slot position + a desired column count for its modules.
  // The actual region size is computed from member count after we group by category.
  const SLOTS = {
    // top row (close to "you" / inbound side)
    inbound:  { col: 0, row: 0, cols: 1, label: 'INBOUND' },
    memory:   { col: 1, row: 0, cols: 2, label: 'MEMORY' },
    workflow: { col: 2, row: 0, cols: 1, label: 'WORKFLOW' },
    output:   { col: 3, row: 0, cols: 2, label: 'OUTPUT' },
    // middle row
    business: { col: 2, row: 1, cols: 1, label: 'BUSINESS' },
    ai:       { col: 3, row: 1, cols: 2, label: 'AI ENGINES' },
    // bottom row
    macos:    { col: 0, row: 2, cols: 2, label: 'MACOS BRIDGE' },
    infra:    { col: 1, row: 2, cols: 2, label: 'INFRASTRUCTURE' },
    util:     { col: 2, row: 2, cols: 2, label: 'UTILITIES', spanCols: 2 },
    // bottom strip (off-product)
    personal: { col: 0, row: 3, cols: 4, label: 'PERSONAL · off-product', spanCols: 4 },
  };

  const NODE_W = 110, NODE_H = 34, GAP = 8, PAD = 12, HEAD_H = 28;
  const COL_GAP = 18, ROW_GAP = 22;
  const ORIGIN_X = 20, ORIGIN_Y = 60;

  // pre-group modules by cat so we can size each cluster
  const byCat = {};
  for (const id in M) {
    const c = M[id].c;
    (byCat[c] = byCat[c] || []).push(id);
  }

  // compute each cluster's box, then arrange in row tracks
  const REGIONS = {};
  // step 1: compute internal width/height per cluster from cols + member count
  for (const cKey in SLOTS) {
    const slot = SLOTS[cKey];
    const items = byCat[cKey] || [];
    const cols = slot.cols;
    const rows = Math.max(1, Math.ceil(items.length / cols));
    REGIONS[cKey] = {
      slot,
      cols,
      rows,
      w: PAD * 2 + cols * NODE_W + (cols - 1) * GAP,
      h: HEAD_H + PAD + rows * NODE_H + (rows - 1) * GAP + 6,
    };
  }
  // step 2: arrange clusters left-to-right within each row, top-to-bottom by row
  // group regions by row
  const rowsMap = {};
  for (const cKey in REGIONS) {
    const r = REGIONS[cKey];
    (rowsMap[r.slot.row] = rowsMap[r.slot.row] || []).push(cKey);
  }
  // sort each row by col index for stable ordering
  Object.values(rowsMap).forEach(arr => arr.sort((a, b) => REGIONS[a].slot.col - REGIONS[b].slot.col));

  let cursorY = ORIGIN_Y;
  Object.keys(rowsMap).map(Number).sort((a,b)=>a-b).forEach(rowIdx => {
    const row = rowsMap[rowIdx];
    // place each in this row L→R
    let cursorX = ORIGIN_X;
    let rowH = 0;
    row.forEach(cKey => {
      const r = REGIONS[cKey];
      r.x = cursorX;
      r.y = cursorY;
      cursorX += r.w + COL_GAP;
      rowH = Math.max(rowH, r.h);
    });
    // store this row's height for advance
    cursorY += rowH + ROW_GAP;
  });

  // adjust viewBox to fit
  let maxX = 0, maxY = 0;
  for (const cKey in REGIONS) {
    const r = REGIONS[cKey];
    if (r.x + r.w > maxX) maxX = r.x + r.w;
    if (r.y + r.h > maxY) maxY = r.y + r.h;
  }
  const VB_W = Math.max(1000, maxX + ORIGIN_X);
  const VB_H = maxY + 30;
  svg.setAttribute('viewBox', `0 0 ${VB_W} ${VB_H}`);

  // ---------- render ----------
  // build a defs block + cluster regions + edges layer + nodes layer
  const NS = 'http://www.w3.org/2000/svg';
  function el(name, attrs, parent) {
    const e = document.createElementNS(NS, name);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  // wipe + create layers
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  el('title', {}, svg).textContent = 'AIVA module graph';

  // YOU label (top-left corner, floating outside any region)
  const youG = el('g', { class: 'you-label' }, svg);
  el('text', { x: 30, y: 28, class: 'you-text' }, youG).textContent = 'YOU';
  el('text', { x: 30, y: 46, class: 'you-sub' }, youG).textContent = 'always in control';

  // AIVA label (anchor, just inside top-right with a margin)
  const aivaG = el('g', { class: 'aiva-label' }, svg);
  el('text', { x: VB_W - 30, y: 28, class: 'aiva-text', 'text-anchor': 'end' }, aivaG).textContent = 'AIVA';
  el('text', { x: VB_W - 30, y: 46, class: 'aiva-sub', 'text-anchor': 'end' }, aivaG).textContent = 'the engine';

  // CLUSTER REGIONS (dashed labeled rectangles)
  for (const cKey in REGIONS) {
    const r = REGIONS[cKey];
    const tint = CATS[cKey].tint;
    const stroke = CATS[cKey].stroke;
    const g = el('g', { class: 'cluster', 'data-cat': cKey }, svg);
    el('rect', {
      x: r.x, y: r.y, width: r.w, height: r.h, rx: 14,
      class: 'cluster__box',
      fill: tint, 'fill-opacity': '0.45',
      stroke: stroke, 'stroke-opacity': '0.55',
      'stroke-width': '1.4', 'stroke-dasharray': '5 4'
    }, g);
    el('text', { x: r.x + 12, y: r.y + 20, class: 'cluster__label', fill: stroke }, g).textContent = CATS[cKey].label;
  }

  // EDGES layer (between clusters and nodes for layering)
  const edgesLayer = el('g', { class: 'edges-layer' }, svg);

  // NODES layer
  const nodesLayer = el('g', { class: 'nodes-layer' }, svg);

  // ---------- position modules within each region ----------
  const POS = {};
  for (const cKey in byCat) {
    const r = REGIONS[cKey];
    const ids = byCat[cKey];
    const cols = r.cols;
    const innerY0 = r.y + HEAD_H;
    ids.forEach((id, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = r.x + PAD + col * (NODE_W + GAP);
      const y = innerY0 + row * (NODE_H + GAP);
      POS[id] = { x, y, w: NODE_W, h: NODE_H, cx: x + NODE_W / 2, cy: y + NODE_H / 2 };
    });
  }

  // ---------- render edges (after positions known) ----------
  // edges are hidden by default (CSS opacity 0); they fade in only when a
  // related node is focused/hovered.
  EDGES.forEach(([from, to]) => {
    if (!POS[from] || !POS[to]) return;
    const a = POS[from], b = POS[to];
    const dx = b.cx - a.cx, dy = b.cy - a.cy;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const k = Math.min(40, len * 0.10);
    const cx = (a.cx + b.cx) / 2 + nx * k;
    const cy = (a.cy + b.cy) / 2 + ny * k;
    el('path', {
      class: 'wedge',
      'data-from': from,
      'data-to': to,
      d: `M ${a.cx} ${a.cy} Q ${cx} ${cy} ${b.cx} ${b.cy}`,
      fill: 'none',
      stroke: '#3a3733',
      'stroke-width': '1.4',
      'stroke-linecap': 'round',
    }, edgesLayer);
  });

  // ---------- render nodes ----------
  for (const id in POS) {
    const p = POS[id];
    const m = M[id];
    const isStar = !!m.star;
    const isHub = id === 'comms-pipeline';
    const tint = CATS[m.c].tint;
    const stroke = CATS[m.c].stroke;

    const cls = ['wnode'];
    if (isStar) cls.push('wnode--star');
    if (isHub)  cls.push('wnode--hub');

    const g = el('g', {
      class: cls.join(' '),
      transform: `translate(${p.x} ${p.y})`,
      'data-id': id,
      'data-cat': m.c,
      tabindex: '0',
      role: 'button',
      'aria-label': m.n,
    }, nodesLayer);

    el('rect', {
      width: p.w, height: p.h, rx: 7,
      class: 'wnode__rect',
      fill: isHub ? '#1f1c18' : tint,
      stroke: isHub ? '#1f1c18' : stroke,
      'stroke-width': isHub ? '2.4' : (isStar ? '2.2' : '1.4'),
    }, g);

    const t = el('text', {
      x: p.w / 2, y: p.h / 2 + 1,
      class: 'wnode__text',
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
    }, g);
    t.textContent = m.short || m.n;

    // hub gets a tiny "★ HUB" badge floating above
    if (isHub) {
      const b = el('g', { class: 'wnode__badge' }, g);
      el('rect', {
        x: p.w/2 - 22, y: -18, width: 44, height: 16, rx: 8,
        fill: '#c98b2b', stroke: '#1f1c18', 'stroke-width': '1.4',
      }, b);
      el('text', {
        x: p.w/2, y: -10,
        'text-anchor': 'middle', 'dominant-baseline': 'middle',
        'font-family': 'Kalam, Patrick Hand, sans-serif',
        'font-size': '10.5', 'font-weight': '700',
        fill: '#1f1c18', 'letter-spacing': '1.4',
      }, b).textContent = '★ HUB';
    }
  }

  // ---------- filter buttons ----------
  const activeCats = new Set(Object.keys(CATS));
  function renderFilters() {
    filtersEl.innerHTML = '';
    for (const cKey in CATS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'wm-filter' + (activeCats.has(cKey) ? ' is-on' : '');
      b.dataset.cat = cKey;
      b.style.setProperty('--cat-color', CATS[cKey].stroke);
      const dot = document.createElement('span');
      dot.className = 'wm-filter__dot';
      b.appendChild(dot);
      b.appendChild(document.createTextNode(CATS[cKey].label + ' · ' + (byCat[cKey] || []).length));
      b.addEventListener('click', () => {
        if (activeCats.size === Object.keys(CATS).length) {
          // first click on a filter — solo it
          activeCats.clear();
          activeCats.add(cKey);
        } else {
          if (activeCats.has(cKey)) activeCats.delete(cKey);
          else activeCats.add(cKey);
          if (activeCats.size === 0) {
            // re-enable all if user toggled off the last one
            Object.keys(CATS).forEach(k => activeCats.add(k));
          }
        }
        applyFilters();
        renderFilters();
      });
      filtersEl.appendChild(b);
    }
    // "all" reset button
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'wm-filter wm-filter--reset';
    reset.textContent = 'all';
    reset.addEventListener('click', () => {
      activeCats.clear();
      Object.keys(CATS).forEach(k => activeCats.add(k));
      if (searchEl) searchEl.value = '';
      applyFilters();
      renderFilters();
    });
    filtersEl.appendChild(reset);
  }

  function applyFilters() {
    const q = (searchEl?.value || '').trim().toLowerCase();
    let visible = 0, total = Object.keys(M).length;
    // nodes
    nodesLayer.querySelectorAll('.wnode').forEach(n => {
      const id = n.dataset.id;
      const m = M[id];
      const catHit = activeCats.has(m.c);
      const qHit = !q || m.n.toLowerCase().includes(q) || (m.d || '').toLowerCase().includes(q);
      const show = catHit && qHit;
      n.classList.toggle('is-hidden', !show);
      if (show) visible++;
    });
    // clusters: dim empty ones
    svg.querySelectorAll('.cluster').forEach(c => {
      const cat = c.dataset.cat;
      c.classList.toggle('is-dim', !activeCats.has(cat));
    });
    // edges: hide if either end is hidden
    edgesLayer.querySelectorAll('.wedge').forEach(e => {
      const a = M[e.dataset.from], b = M[e.dataset.to];
      const aHit = a && activeCats.has(a.c) && (!q || (a.n + ' ' + (a.d||'')).toLowerCase().includes(q));
      const bHit = b && activeCats.has(b.c) && (!q || (b.n + ' ' + (b.d||'')).toLowerCase().includes(q));
      e.classList.toggle('is-hidden', !(aHit && bHit));
    });
    countEl.textContent = `${visible} / ${total} modules shown`;
  }

  // ---------- interaction: focus a node ----------
  function focus(id) {
    if (!id || !M[id]) { clear(); return; }
    const m = M[id];
    // relations
    const out = [], inn = [];
    EDGES.forEach(([a, b]) => {
      if (a === id) out.push(b);
      if (b === id) inn.push(a);
    });

    root.classList.add('is-focused');
    nodesLayer.querySelectorAll('.wnode').forEach(n => {
      const k = n.dataset.id;
      n.classList.remove('is-active', 'is-connected');
      if (k === id) n.classList.add('is-active');
      else if (out.includes(k) || inn.includes(k)) n.classList.add('is-connected');
    });
    edgesLayer.querySelectorAll('.wedge').forEach(e => {
      const hit = e.dataset.from === id || e.dataset.to === id;
      e.classList.toggle('is-highlight', hit);
    });

    panelHint.hidden = true;
    panelContent.hidden = false;
    panelName.textContent = m.n;
    panelCat.textContent = CATS[m.c].label;
    panelCat.style.background = CATS[m.c].tint;
    panelCat.style.borderColor = CATS[m.c].stroke;
    panelDesc.textContent = m.d;
    panelMachine.textContent = m.m || '—';
    panelKind.textContent = m.k || '—';
    panelPath.textContent = '~/.aiva/modules/' + id + '/';

    const lines = [];
    if (inn.length) lines.push('<strong>called by:</strong> ' + inn.map(i => `<code>${(M[i]?.n)||i}</code>`).join(' · '));
    if (out.length) lines.push('<strong>calls:</strong> ' + out.map(i => `<code>${(M[i]?.n)||i}</code>`).join(' · '));
    panelEdges.innerHTML = lines.join('<br>');
    panelEdges.style.display = lines.length ? '' : 'none';
  }

  function clear() {
    root.classList.remove('is-focused');
    nodesLayer.querySelectorAll('.wnode').forEach(n => n.classList.remove('is-active', 'is-connected'));
    edgesLayer.querySelectorAll('.wedge').forEach(e => e.classList.remove('is-highlight'));
    panelHint.hidden = false;
    panelContent.hidden = true;
  }

  // node events
  nodesLayer.addEventListener('click', e => {
    const g = e.target.closest('.wnode');
    if (g) {
      if (isMobile()) drillTo(g.dataset.id);
      else focus(g.dataset.id);
    }
  });
  nodesLayer.addEventListener('mouseover', e => {
    if (isMobile()) return;          // no hover focus on touch devices
    const g = e.target.closest('.wnode');
    if (g) focus(g.dataset.id);
  });
  nodesLayer.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('wnode')) {
      e.preventDefault();
      if (isMobile()) drillTo(e.target.dataset.id);
      else focus(e.target.dataset.id);
    }
  });
  svg.addEventListener('mouseleave', () => { if (!isMobile()) clear(); });

  // search
  if (searchEl) {
    searchEl.addEventListener('input', applyFilters);
  }

  // ====================================================================
  // MOBILE DRILL-DOWN MODE
  // On narrow viewports, show only the focal node + its direct neighbors
  // arranged radially. Tap a neighbor → drill in (becomes new focal).
  // ====================================================================
  function isMobile() {
    return window.matchMedia('(max-width: 760px)').matches;
  }

  // path of focal nodes (for back navigation)
  let drillStack = ['comms-pipeline'];

  function relations(id) {
    const out = [], inn = [];
    EDGES.forEach(([a, b]) => {
      if (a === id) out.push(b);
      if (b === id) inn.push(a);
    });
    return { out, inn, all: Array.from(new Set([...out, ...inn])) };
  }

  // count how many connections each node has total (used for "+N more" hint)
  const DEGREE = {};
  EDGES.forEach(([a,b]) => { DEGREE[a]=(DEGREE[a]||0)+1; DEGREE[b]=(DEGREE[b]||0)+1; });

  function renderMobile(focalId) {
    // hide desktop layout, build a radial layout in the same SVG
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    el('title', {}, svg).textContent = 'AIVA module graph (drill-down)';

    const m = M[focalId];
    if (!m) return;
    const rels = relations(focalId);
    const outs = rels.out.filter(k => M[k]);   // what focal calls
    const ins  = rels.inn.filter(k => M[k]);   // what calls focal
    // de-dupe (if a node is both in and out, treat as out)
    const outSet = new Set(outs);
    const insOnly = ins.filter(k => !outSet.has(k));
    const N = outs.length + insOnly.length;

    // viewBox sized for two concentric rings
    const W = 520;
    const H = Math.max(620, 460 + Math.max(outs.length, insOnly.length) * 12);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

    const cx = W / 2;
    const cy = H * 0.52;
    const focalW = 150, focalH = 56;
    const nodeW = 104, nodeH = 32;

    // ring radii: inner = outputs, outer = inputs.
    // outer radius must keep half-a-node inside the viewBox: max = (W - nodeW)/2
    const ringInner = Math.min(W * 0.28, 140);
    const ringOuter = (W - nodeW) / 2 - 6;   // 6px breathing room from edge

    // crumb / back row at top
    const crumbsG = el('g', { class: 'crumbs' }, svg);
    if (drillStack.length > 1) {
      const back = el('g', { class: 'crumbs__back', tabindex: '0', role: 'button', 'aria-label': 'Back' }, crumbsG);
      el('rect', { x: 12, y: 14, width: 64, height: 30, rx: 8, fill: '#f4eee0', stroke: '#1f1c18', 'stroke-width': '1.6' }, back);
      el('text', {
        x: 44, y: 33, 'text-anchor': 'middle',
        'font-family': 'Kalam, Patrick Hand, sans-serif',
        'font-size': '14', 'font-weight': '700',
        fill: '#1f1c18',
      }, back).textContent = '← back';
    }
    // breadcrumb path
    const path = drillStack.map(id => (M[id] ? M[id].n : id)).join(' › ');
    el('text', {
      x: W - 14, y: 32, 'text-anchor': 'end',
      'font-family': 'Caveat, cursive', 'font-size': '15',
      fill: '#6a665e',
    }, crumbsG).textContent = path;

    // ring layer for connections
    const ringLayer = el('g', { class: 'm-ring' }, svg);

    // helper to render a set of nodes around a ring
    let animIdx = 0;
    function renderRing(ids, radius, dir /* "out" or "in" */) {
      const count = ids.length;
      if (!count) return;
      // alternate so neighbors aren't all on the same vertical (start at top, sweep)
      // outer ring is rotated half a step so it interleaves with the inner ring
      const angleOffset = (dir === 'in') ? (Math.PI / count) : 0;
      ids.forEach((id, i) => {
        const angle = (i / count) * Math.PI * 2 - Math.PI / 2 + angleOffset;
        const nx = cx + Math.cos(angle) * radius;
        const ny = cy + Math.sin(angle) * radius;
        const m2 = M[id];
        const tint = (CATS[m2.c] || {}).tint || '#fff';
        const stroke = (CATS[m2.c] || {}).stroke || '#1f1c18';

        // edge from focal to this neighbor
        el('path', {
          class: 'm-edge',
          d: `M ${cx} ${cy} L ${nx} ${ny}`,
          fill: 'none',
          stroke: dir === 'in' ? '#4d6f95' : '#3a3733',
          'stroke-width': '1.2',
          'stroke-opacity': dir === 'in' ? '0.42' : '0.42',
          'stroke-linecap': 'round',
        }, ringLayer);

        // node
        const g = el('g', {
          class: 'm-node m-node--' + dir,
          transform: `translate(${nx - nodeW/2} ${ny - nodeH/2})`,
          'data-id': id,
          tabindex: '0',
          role: 'button',
          'aria-label': m2.n + ' (' + (dir === 'in' ? 'calls focal' : 'called by focal') + ')',
          style: `--anim-delay: ${(animIdx++) * 40}ms`,
        }, ringLayer);
        el('rect', {
          width: nodeW, height: nodeH, rx: 8,
          class: 'm-node__rect',
          fill: tint, stroke: stroke, 'stroke-width': '1.6',
        }, g);
        el('text', {
          x: nodeW/2, y: nodeH/2 + 1,
          'text-anchor': 'middle', 'dominant-baseline': 'middle',
          'font-family': 'JetBrains Mono, IBM Plex Mono, Menlo, monospace',
          'font-size': '10.5', 'font-weight': '600',
          fill: '#1f1c18',
        }, g).textContent = m2.short || m2.n;

        // "+N more" pill if neighbor has connections beyond the focal
        const otherDegree = (DEGREE[id] || 0) - 1;
        if (otherDegree > 0) {
          const pill = el('g', { class: 'm-node__more' }, g);
          const pillTxt = '+' + otherDegree;
          const pillW = 20 + (pillTxt.length - 2) * 6;
          el('rect', {
            x: nodeW - pillW + 4, y: -8, width: pillW, height: 14, rx: 7,
            fill: '#1f1c18', stroke: stroke, 'stroke-width': '1.2',
          }, pill);
          el('text', {
            x: nodeW - pillW/2 + 4, y: -0,
            'text-anchor': 'middle', 'dominant-baseline': 'middle',
            'font-family': 'Kalam, sans-serif', 'font-size': '9', 'font-weight': '700',
            fill: '#f4eee0',
          }, pill).textContent = pillTxt;
        }
      });
    }

    // decide ring assignment based on counts
    const totalOnSingleRing = (outs.length + insOnly.length) <= 8;
    if (totalOnSingleRing) {
      // single ring at midpoint
      renderRing([...outs, ...insOnly.map(k => k)], (ringInner + ringOuter)/2, 'out');
    } else {
      // outputs inner, inputs outer
      renderRing(outs, ringInner, 'out');
      renderRing(insOnly, ringOuter, 'in');
    }

    // ring legend (tiny labels above each ring concept)
    if (!totalOnSingleRing) {
      el('text', {
        x: cx, y: cy - ringOuter - 14,
        'text-anchor': 'middle',
        'font-family': 'Kalam, sans-serif', 'font-size': '11', 'font-weight': '700',
        'letter-spacing': '1.5', fill: '#4d6f95',
      }, ringLayer).textContent = 'CALLED BY ↓';
      el('text', {
        x: cx + ringInner + 10, y: cy + 4,
        'text-anchor': 'start',
        'font-family': 'Kalam, sans-serif', 'font-size': '10', 'font-weight': '700',
        'letter-spacing': '1.5', fill: '#6a665e',
      }, ringLayer).textContent = '→ CALLS';
    }

    // focal in center (drawn last so it sits on top)
    const focalG = el('g', {
      class: 'm-focal',
      transform: `translate(${cx - focalW/2} ${cy - focalH/2})`,
      'data-id': focalId,
    }, svg);
    const tint = (CATS[m.c] || {}).tint || '#fff';
    const stroke = (CATS[m.c] || {}).stroke || '#1f1c18';
    el('rect', {
      width: focalW, height: focalH, rx: 12,
      fill: '#1f1c18', stroke: '#1f1c18', 'stroke-width': '2.4',
    }, focalG);
    el('text', {
      x: focalW/2, y: focalH/2 - 4,
      'text-anchor': 'middle', 'dominant-baseline': 'middle',
      'font-family': 'JetBrains Mono, monospace',
      'font-size': '14', 'font-weight': '700',
      fill: '#f4eee0',
    }, focalG).textContent = m.n;
    el('text', {
      x: focalW/2, y: focalH/2 + 13,
      'text-anchor': 'middle', 'dominant-baseline': 'middle',
      'font-family': 'Kalam, sans-serif',
      'font-size': '10.5', 'letter-spacing': '1.2',
      fill: 'rgba(244,238,224,0.7)',
    }, focalG).textContent = (CATS[m.c] || {}).label || '';

    // count footer
    if (countEl) {
      const parts = [];
      if (outs.length) parts.push(outs.length + ' outgoing');
      if (insOnly.length) parts.push(insOnly.length + ' incoming');
      countEl.textContent = `${m.n} · ` + (parts.join(' · ') || 'no connections') + ' · tap any to drill in';
    }
  }

  function drillTo(id) {
    if (!M[id]) return;
    if (drillStack[drillStack.length - 1] !== id) drillStack.push(id);
    renderMobile(id);
    focus(id); // also fill the panel
  }
  function drillBack() {
    if (drillStack.length <= 1) return;
    drillStack.pop();
    const prev = drillStack[drillStack.length - 1];
    renderMobile(prev);
    focus(prev);
  }

  // mobile delegated click handler
  svg.addEventListener('click', e => {
    if (!isMobile()) return;
    const back = e.target.closest('.crumbs__back');
    if (back) { drillBack(); return; }
    const node = e.target.closest('.m-node, .m-focal');
    if (node && node.dataset.id) drillTo(node.dataset.id);
  });
  svg.addEventListener('keydown', e => {
    if (!isMobile()) return;
    if (e.key === 'Enter' || e.key === ' ') {
      const back = e.target.closest('.crumbs__back');
      if (back) { e.preventDefault(); drillBack(); return; }
      const node = e.target.closest('.m-node, .m-focal');
      if (node && node.dataset.id) { e.preventDefault(); drillTo(node.dataset.id); }
    }
  });

  // ---------- responsive: switch modes when viewport crosses the breakpoint ----------
  const fullDesktopRender = () => {
    // re-render the full desktop graph (currently in DOM via the code above)
    // simplest approach: reload the page section by re-running the IIFE.
    // For now, since this code path is just for re-render after a resize,
    // we rebuild the desktop SVG by re-running the layout block.
    location.reload();
  };

  let lastMode = isMobile() ? 'mobile' : 'desktop';
  if (lastMode === 'mobile') {
    drillStack = ['comms-pipeline'];
    renderMobile('comms-pipeline');
    focus('comms-pipeline');
  }

  let resizeT = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => {
      const mode = isMobile() ? 'mobile' : 'desktop';
      if (mode !== lastMode) {
        if (mode === 'mobile') {
          drillStack = ['comms-pipeline'];
          renderMobile('comms-pipeline');
          focus('comms-pipeline');
          lastMode = 'mobile';
        } else {
          fullDesktopRender();
        }
      }
    }, 200);
  });

  // init
  renderFilters();
  applyFilters();

  } // end renderEverything
})();

// ---------- Animated pipeline ("A real message, in slow motion") ----------
(function () {
  const pipe = document.getElementById('pipeFlow');
  if (!pipe) return;

  function play() {
    // arm + play on click. when finished, the animation leaves all stages
    // visible (forwards fill mode), so removing .is-armed isn't required.
    pipe.classList.add('is-armed');
    pipe.classList.remove('is-playing');
    // force reflow so the animation restarts cleanly
    void pipe.offsetWidth;
    pipe.classList.add('is-playing');
    // after the longest animation completes, drop .is-armed so initial-state
    // overrides stop applying and a future scroll never traps content.
    clearTimeout(playTimer);
    playTimer = setTimeout(() => pipe.classList.remove('is-armed'), 8500);
  }
  let playTimer = 0;

  // replay button
  const replay = pipe.querySelector('[data-replay]');
  if (replay) {
    replay.addEventListener('click', play);
  }
})();

// ---------- System map ----------
(function () {
  const mount = document.getElementById('systemMap');
  if (!mount) return;

  // ---- data ----
  // Each cluster is a category of capability. Each node is one real
  // module shipped in the AIVA codebase that powers a piece of OfficeAdmin.
  const clusters = [
    {
      id: 'comms',
      label: 'Inbound communication',
      color: '#c98b2b',
      cx: 0.22, cy: 0.30, rx: 0.18, ry: 0.18,
      nodes: [
        { id: 'gmail',       name: 'Gmail',          desc: 'Reads, labels, drafts, archives. Routes by job and customer.' },
        { id: 'email-lab',   name: 'email-labeler',  desc: 'Local Gmail classification. Backs up to Stalwart so you own the archive.' },
        { id: 'imessage',    name: 'iMessage',       desc: 'Reads and sends from your number. Real time.' },
        { id: 'whatsapp',    name: 'WhatsApp',       desc: 'Reads group chats and DMs.' },
        { id: 'instagram',   name: 'Instagram DMs',  desc: 'Reads Instagram inquiries inside the message window.' },
        { id: 'sendblue',    name: 'Sendblue',       desc: 'Outbound iMessage channel of record.' },
        { id: 'voice',       name: 'Voice memos',    desc: '"Do this later" turns into a draft, an invoice, a calendar hold.' },
      ]
    },
    {
      id: 'knowledge',
      label: 'Memory & dossier',
      color: '#4f7a3a',
      cx: 0.78, cy: 0.30, rx: 0.18, ry: 0.18,
      nodes: [
        { id: 'know',        name: 'know',           desc: 'Unified dossier front-end. One question, every source.' },
        { id: 'mempalace',   name: 'MemPalace',      desc: 'Long-term knowledge graph. Everything you and your team have ever known.' },
        { id: 'identity',    name: 'identity',       desc: 'Resolves any name, slug, email, or phone to one canonical person.' },
        { id: 'memory-graph',name: 'memory-graph',   desc: 'Neo4j-backed persistent memory across sessions.' },
        { id: 'session',     name: 'session-search', desc: 'Cross-channel transcript and log search.' },
        { id: 'contacts',    name: 'contacts',       desc: 'Apple Contacts as the canonical person index.' },
      ]
    },
    {
      id: 'workflow',
      label: 'Trust tiers & follow-through',
      color: '#7a4f99',
      cx: 0.50, cy: 0.55, rx: 0.22, ry: 0.18,
      nodes: [
        { id: 'pipeline',    name: 'comms-pipeline', desc: 'The triage and drafting engine. Tier-classifies, auto-sends Tier 1, surfaces Tier 3.' },
        { id: 'drafts',      name: 'drafts',         desc: 'Pending-drafts review surface. The "review" side of the pipeline.' },
        { id: 'commitments', name: 'commitments',    desc: 'Tracks every in-flight thing between you and another person.' },
        { id: 'waiton',      name: 'waiting-on',     desc: 'Catches the dropped balls when you owe an answer that depends on someone else.' },
        { id: 'open-loops',  name: 'open-loops',     desc: 'Conversation balls and follow-throughs.' },
        { id: 'schedule-send', name: 'schedule-send', desc: 'Future-message scheduler. Self-cleaning.' },
        { id: 'comms-expert', name: 'comms-expert',  desc: 'The drafting and wording brain. Decides what to say.' },
      ]
    },
    {
      id: 'business',
      label: 'Business & money',
      color: '#b3492f',
      cx: 0.20, cy: 0.78, rx: 0.18, ry: 0.16,
      nodes: [
        { id: 'qb',          name: 'QuickBooks',     desc: 'Customers, invoices, estimates, items. Sends and reconciles.' },
        { id: 'qb-time',     name: 'QuickBooks Time',desc: 'Tracks crew hours and payroll-grade timesheets.' },
        { id: 'mikeshaffer', name: 'mikeshaffer',    desc: 'Work hub: tasks, jobs, bids, entities. Lives in your repo.' },
        { id: 'akaunting',   name: 'Akaunting',      desc: 'Self-hosted business hub at officeadmin.shaffercon.com.' },
        { id: 'estimating',  name: 'electrical-estimating', desc: 'Bid and service-call pricing.' },
      ]
    },
    {
      id: 'ai',
      label: 'AI engines (BYOK)',
      color: '#365a8a',
      cx: 0.80, cy: 0.78, rx: 0.18, ry: 0.16,
      nodes: [
        { id: 'claude',      name: 'Claude',         desc: 'Anthropic Claude. Bring your own key.' },
        { id: 'codex',       name: 'Codex',          desc: 'OpenAI Codex. Bring your own key.' },
        { id: 'gemini',      name: 'Gemini',         desc: 'Google Gemini. Bring your own key.' },
        { id: 'glm',         name: 'GLM',            desc: 'Zhipu GLM. Bring your own key.' },
        { id: 'agents',      name: 'agents',         desc: 'Background tmux agent runner. The hands behind the brain.' },
        { id: 'module-sug',  name: 'module-suggester', desc: 'Reviews completed sessions and proposes new skills.' },
      ]
    },
    {
      id: 'macos',
      label: 'macOS bridge',
      color: '#3a3733',
      cx: 0.50, cy: 0.18, rx: 0.18, ry: 0.10,
      nodes: [
        { id: 'aiva',        name: 'macos',           desc: 'The signed gateway to all macOS system services.' },
        { id: 'reminders',   name: 'Reminders',       desc: 'Apple Reminders CRUD. Your tasks, kept honest.' },
        { id: 'calendar',    name: 'Calendar',        desc: 'Apple Calendar via EventKit. Books, holds, reschedules.' },
        { id: 'notes',       name: 'Notes',           desc: 'Apple Notes CRUD across folders.' },
        { id: 'callhist',    name: 'Call history',    desc: 'Privileged reader for macOS CallHistoryDB.' },
      ]
    },
  ];

  // Curated "core" nodes shown bigger.
  const big = new Set(['pipeline', 'know', 'mempalace', 'commitments', 'qb', 'gmail', 'imessage', 'claude']);

  // ---- layout ----
  const W = 1100, H = 540; // viewBox-ish
  const svgNS = 'http://www.w3.org/2000/svg';

  // build SVG
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  mount.appendChild(svg);

  // tooltip
  const tip = document.createElement('div');
  tip.className = 'node-tooltip';
  mount.appendChild(tip);

  // background dotted clusters
  clusters.forEach(c => {
    const g = document.createElementNS(svgNS, 'g');

    // soft cluster blob
    const blob = document.createElementNS(svgNS, 'ellipse');
    blob.setAttribute('cx', c.cx * W);
    blob.setAttribute('cy', c.cy * H);
    blob.setAttribute('rx', c.rx * W);
    blob.setAttribute('ry', c.ry * H);
    blob.setAttribute('fill', c.color);
    blob.setAttribute('fill-opacity', '0.07');
    blob.setAttribute('stroke', c.color);
    blob.setAttribute('stroke-opacity', '0.55');
    blob.setAttribute('stroke-width', '1.4');
    blob.setAttribute('stroke-dasharray', '6 5');
    g.appendChild(blob);

    // cluster label
    const t = document.createElementNS(svgNS, 'text');
    t.setAttribute('x', c.cx * W);
    t.setAttribute('y', (c.cy - c.ry) * H - 6);
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('font-family', 'Caveat, cursive');
    t.setAttribute('font-size', '20');
    t.setAttribute('fill', c.color);
    t.textContent = c.label;
    g.appendChild(t);

    svg.appendChild(g);

    // place nodes around the cluster center using polar layout
    const n = c.nodes.length;
    c.nodes.forEach((node, i) => {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
      const jitterAngle = angle + (Math.sin(i * 13.7 + c.cx * 100) * 0.18);
      const baseR = Math.min(c.rx, c.ry) * 0.78;
      const r = baseR + Math.sin(i * 5.1 + c.cy * 80) * baseR * 0.18;
      const x = (c.cx + Math.cos(jitterAngle) * r * (W / Math.max(W, H))) * W;
      const y = (c.cy + Math.sin(jitterAngle) * r * (H / Math.max(W, H)) * 1.2) * H;

      node._x = x; node._y = y; node._color = c.color; node._cluster = c.label;

      const isBig = big.has(node.id);
      const radius = isBig ? 26 : 18;

      // group
      const ng = document.createElementNS(svgNS, 'g');
      ng.setAttribute('class', 'node');
      ng.setAttribute('transform', `translate(${x} ${y})`);

      // circle
      const cir = document.createElementNS(svgNS, 'circle');
      cir.setAttribute('class', 'node-circle');
      cir.setAttribute('r', radius);
      cir.setAttribute('fill', c.color);
      ng.appendChild(cir);

      // label
      const lbl = document.createElementNS(svgNS, 'text');
      lbl.setAttribute('class', 'node-label');
      lbl.setAttribute('y', radius + 14);
      lbl.textContent = node.name;
      ng.appendChild(lbl);

      // events
      ng.addEventListener('mouseenter', e => showTip(e, node));
      ng.addEventListener('mousemove', e => moveTip(e));
      ng.addEventListener('mouseleave', hideTip);
      ng.addEventListener('focus', e => showTip(e, node));
      ng.addEventListener('blur', hideTip);
      ng.addEventListener('click', e => showTip(e, node, true));
      ng.setAttribute('tabindex', '0');
      ng.setAttribute('role', 'button');
      ng.setAttribute('aria-label', node.name + ': ' + node.desc);

      svg.appendChild(ng);
    });
  });

  // draw a few subtle edges between conceptually linked nodes
  const edges = [
    ['gmail', 'pipeline'], ['imessage', 'pipeline'], ['voice', 'pipeline'], ['whatsapp', 'pipeline'],
    ['pipeline', 'drafts'], ['pipeline', 'comms-expert'],
    ['pipeline', 'know'], ['drafts', 'know'],
    ['know', 'mempalace'], ['know', 'identity'], ['know', 'contacts'], ['know', 'memory-graph'],
    ['comms-expert', 'claude'], ['pipeline', 'claude'], ['agents', 'claude'],
    ['pipeline', 'commitments'], ['commitments', 'waiton'], ['commitments', 'open-loops'],
    ['mikeshaffer', 'qb'], ['mikeshaffer', 'estimating'], ['mikeshaffer', 'akaunting'],
    ['aiva', 'reminders'], ['aiva', 'calendar'], ['aiva', 'notes'], ['aiva', 'callhist'],
  ];
  // map id -> {x,y}
  const byId = {};
  clusters.forEach(c => c.nodes.forEach(n => byId[n.id] = n));

  // create edge layer behind nodes
  const edgeLayer = document.createElementNS(svgNS, 'g');
  edgeLayer.setAttribute('opacity', '0.35');
  edges.forEach(([a, b]) => {
    const A = byId[a], B = byId[b];
    if (!A || !B) return;
    const path = document.createElementNS(svgNS, 'path');
    const mx = (A._x + B._x) / 2;
    const my = (A._y + B._y) / 2 + (Math.random() * 24 - 12);
    path.setAttribute('d', `M${A._x} ${A._y} Q${mx} ${my} ${B._x} ${B._y}`);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#3a3733');
    path.setAttribute('stroke-width', '1.1');
    path.setAttribute('stroke-dasharray', '3 4');
    path.setAttribute('stroke-linecap', 'round');
    edgeLayer.appendChild(path);
  });
  // insert edge layer before nodes (after cluster blobs)
  // find first .node group
  const firstNode = svg.querySelector('.node');
  if (firstNode) svg.insertBefore(edgeLayer, firstNode);
  else svg.appendChild(edgeLayer);

  // ---- tooltip behavior ----
  function showTip(e, node, sticky = false) {
    tip.innerHTML = `<strong>${escapeHtml(node.name)}</strong>${escapeHtml(node.desc)}<br/><span style="opacity:0.7;font-size:12px;">${escapeHtml(node._cluster)}</span>`;
    tip.classList.add('is-show');
    moveTip(e);
  }
  function moveTip(e) {
    const rect = mount.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    tip.style.left = x + 'px';
    tip.style.top = (y - 8) + 'px';
  }
  function hideTip() { tip.classList.remove('is-show'); }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }
})();
