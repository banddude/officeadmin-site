# officeadmin.io

Public site for OfficeAdmin — Mike Shaffer's productized AI back-office for
small business, built on the AIVA engine.

Live at [officeadmin.io](https://officeadmin.io).

## Structure

```
index.html              Landing page (marketing + interactive system graph + docs)
styles.css              Site styles (hand-drawn comic aesthetic)
script.js               Auto-populated graph + animated pipeline + mobile drill-down
docs.html               Auto-generated module documentation page
modules-docs.json       Module catalog, generated from ~/.aiva/modules/

bin/
  generate-docs.py      Reads ~/.aiva/modules/*/, writes modules-docs.json
  watch-modules.sh      fswatch wrapper that regenerates JSON on every change

architecture.html       Interactive architecture diagram (kept from prior site)
js/architecture.js      Diagram interactivity

officeadmin/            Internal system atlas — read-only generated map (Mike's)
js/officeadmin*.js      Atlas rendering
css/officeadmin-atlas.css
scripts/                Atlas generation scripts (Node + Python)

jason/                  One-off customer deliverable (3105 Ledgewood WiFi plan)
favicon.svg
```

## How it works

- Plain HTML/CSS/JS. No build step, no framework, no dependencies.
- GitHub Pages serves static files from the `main` branch.
- A Cloudflare Worker (`officeadmin-router`) proxies officeadmin.io → GitHub Pages.

## Updating the landing page

The interactive graph, the modules cards, and the docs page all read from
`modules-docs.json`, which is generated from `~/.aiva/modules/*/` (the source
of truth for what the system actually does).

```bash
python3 bin/generate-docs.py    # regenerates modules-docs.json from disk
git add -A
git commit -m "..."
git push                        # GitHub Pages rebuilds, CF Worker proxies
```

A launchd job (`com.officeadmin.site.watch-modules`) watches
`~/.aiva/modules/` and re-runs the generator whenever a `MODULE.md`,
`SKILL.md`, `module.json`, or `bin/*` file changes. So **the JSON stays
current as long as the watcher runs** — but you still need to commit + push
when you want the changes to go live.

For marketing copy (hero, trust tiers, FAQ, dossier examples, comparison
table, Mike's letter), edit `index.html` directly. Those sections are
intentionally hand-written.

## Updating the /officeadmin atlas

Separate generator, separate cadence (a launchd hourly cron handles this
automatically and auto-commits):

```bash
node scripts/generate-officeadmin-map.mjs
```

Reads AIVA docs, module tree, repo state, and runtime/archive paths, then
writes `officeadmin/data/system-map.json`.

## Cache purge

```bash
source ~/.aiva/state/skills/cloudflare/scripts/cloudflare-functions.sh
cf_set_zone officeadmin.io
# then POST to /purge_cache
```

## URLs

| Path | What |
|---|---|
| `/` | Landing page (marketing + interactive system graph) |
| `/docs.html` | Module documentation, all 70+ modules, searchable |
| `/architecture.html` | Architecture diagram (legacy, kept for depth) |
| `/officeadmin/` | Generated system atlas (Mike's internal view) |
| `/jason/` | One-off customer page |

## Design decisions

- Mobile-first. Designed for someone reading on a phone.
- Hand-drawn comic aesthetic (Caveat + Patrick Hand). No generic Inter slop.
- No build step. Static files only.
- Content is based on what the code actually does, not marketing fluff.
- Specific stats are pulled live from `modules-docs.json` so they never
  drift out of sync with the codebase.
