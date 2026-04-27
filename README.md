# officeadmin.io

Public site for OfficeAdmin / AIVA, a personal AI operations system that runs a small business.

Live at [officeadmin.io](https://officeadmin.io).

## Structure

```
index.html          Home page
architecture.html   Interactive architecture diagram (SVG with click-to-reveal details)
modules.html        Expandable module list organized by category
stack.html          Technology inventory
officeadmin/        Generated read only system map and status surface
css/style.css       All styles (mobile-first, dark mode)
js/main.js          Shared nav toggle
js/architecture.js  Diagram interactivity (node details on click)
js/officeadmin.js   Generated map rendering
favicon.svg         Site icon
```

## How it works

Plain HTML/CSS/JS. No build step, no framework, no dependencies.

- GitHub Pages serves the static files from the `main` branch
- A Cloudflare Worker (`officeadmin-router`) proxies requests from officeadmin.io to GitHub Pages

## Updating

Edit files, commit, push. GitHub Pages rebuilds automatically and the Cloudflare Worker picks up the new content (cached for 5 minutes for HTML, 1 hour for assets).

The `/officeadmin` area is backed by a generated snapshot. Refresh it before pushing:

```bash
node scripts/generate-officeadmin-map.mjs
```

That script reads from the local AIVA docs and module tree, repo state, and available runtime or archive paths, then writes `officeadmin/data/system-map.json`.

To purge the cache immediately:

```bash
source ~/.aiva/state/skills/cloudflare/scripts/cloudflare-functions.sh
cf_set_zone officeadmin.io
# Then use curl to POST to /purge_cache endpoint
```

## Design decisions

- Mobile-first. Designed for showing someone at a bar on a phone.
- Dark mode only. Matches the terminal-forward nature of the system.
- No build tools. Keeps deployment simple and the site fast.
- All content is based on real system research, not generic descriptions.
