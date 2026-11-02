# officeadmin.io

Public site for OfficeAdmin — Mike Shaffer's productized AI back-office for
small business, built on the AIVA engine.

Live at [officeadmin.io](https://officeadmin.io).

## Public boundary (READ THIS FIRST)

This is a **public** repository generated from a **private** assistant
installation. What may be published is defined by
[`scripts/public-allowlist.json`](scripts/public-allowlist.json):

- `modules-docs.json` may contain **only** the allowlisted product-facing
  module topics and fields (no full MODULE.md bodies, no bin inventories, no
  machine placement, no filesystem paths).
- The internal system atlas (`officeadmin/data/system-map*.json`) is **never
  published**. It is generated locally by `scripts/regenerate.sh` for local
  viewing; the files are gitignored.
- The retired deep-dive `architecture.html` and the `/officeadmin/` atlas UI
  are stubs; their previous content exists only in git history.
- Customer source under `jason/` is retained in this repository but excluded
  from GitHub Pages by `_config.yml`. Do not add `.nojekyll`, which bypasses
  that exclusion. Repository files and Git history are not made private by
  this site-publication rule; no history rewrite is part of this change.

`scripts/test-public-boundary.py` enforces all of the above and must pass
before anything is committed or pushed (`scripts/regenerate.sh` runs it;
wire it into any CI the same way):

```bash
python3 scripts/test-public-boundary.py
```

If it fails, the named file/field is outside the allowlist — fix the
generator or the allowlist, not the guard.

## Structure

```
index.html              Landing page (marketing + interactive system graph + docs)
styles.css              Site styles (hand-drawn comic aesthetic)
script.js               Auto-populated graph + animated pipeline + mobile drill-down
docs.html               Auto-generated module documentation page
modules-docs.json       Public module catalog, generated from ~/.aiva/modules/

bin/
  generate-docs.py      Reads ~/.aiva/modules/*/, projects onto the public
                        allowlist, writes modules-docs.json
  watch-modules.sh      fswatch wrapper that regenerates JSON on every change

architecture.html       Stub — the legacy deep-dive diagram is no longer published
officeadmin/            Stub — the internal system atlas is no longer published
scripts/                Generation + boundary tooling (local)
jason/                  Retained customer source; excluded from site publication
favicon.svg
```

## How it works

- Plain HTML/CSS/JS. No build step, no framework, no dependencies.
- GitHub Pages serves static files from the `main` branch.
- Its legacy Jekyll build reads the JSON-form `_config.yml` and excludes the
  private `jason/` directory and all descendants from the published output.
- A Cloudflare Worker (`officeadmin-router`) proxies officeadmin.io → GitHub Pages.

## Updating the landing page

The interactive graph, the modules cards, and the docs page all read from
`modules-docs.json`, which is generated from `~/.aiva/modules/*/` (the source
of truth for what the system actually does) and projected onto the public
allowlist before it is written.

```bash
python3 bin/generate-docs.py           # regenerates the public-safe catalog
python3 scripts/test-public-boundary.py
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

## Regenerating the local atlas (NOT published)

Separate generator, local-only:

```bash
node scripts/generate-officeadmin-map.mjs   # writes officeadmin/data/system-map.json
scripts/regenerate.sh                       # v2 map + privacy audit + boundary guard
```

The output under `officeadmin/data/` is gitignored and must stay that way;
the boundary guard fails the tree if it is ever added.

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
| `/docs.html` | Public module documentation (allowlisted modules only) |
| `/architecture.html` | Stub (legacy deep-dive retired from publication) |
| `/officeadmin/` | Stub (internal system atlas is local-only) |
| `/jason/` | Not published; customer source is retained only in the repository |

## Design decisions

- Mobile-first. Designed for someone reading on a phone.
- Hand-drawn comic aesthetic (Caveat + Patrick Hand). No generic Inter slop.
- No build step. Static files only.
- Content is based on what the code actually does, not marketing fluff.
- Specific stats are pulled live from `modules-docs.json` so they never
  drift out of sync with the codebase.
- Default-deny publication: anything not allowlisted stays private, and a
  committed guard fails the tree when that would change.
