# VibeLifeBench — project site

Static project page for **VibeLifeBench: Can Your Life Agent Be Proactive and Persistent in a Living World?**

Four pages, linked from the top navigation bar:

1. **Overview** (`index.html`) — logo, abstract, the three properties, key statistics, and the headline result.
2. **Leaderboard** (`leaderboard.html`) — main results (avg@3 / max@3 / min@3 / within-task σ) and per-run cost for five frontier models, plus the per-domain breakdown and the long-horizon / cost figures.
3. **Trajectories** (`trajectories/`) — an interactive browser over five representative task trajectories (requirement script, environment APIs, seed data, scoring criteria, and timeline replay). Reused from the `vibe-agent` demo, trimmed to five tasks.
4. **Live demo** — links out to the hosted demo at
   https://vibebench.github.io/VibeLifeBench_livedemo/

## Serving locally

It is a fully static site. From this folder:

```
python3 -m http.server 8099
```

then open <http://localhost:8099/>. (A static server is required because the pages fetch JSON via `fetch`.)

## GitHub Pages

`.nojekyll` is present so all files are served verbatim. Deployment is handled by
`.github/workflows/pages.yml` (GitHub Actions). Enable **Settings → Pages →
Source: GitHub Actions** on the repo; after a push to `main`, the site is at:

https://vibebench.github.io/VibeLifeBench_homepage/

## Layout

```
index.html            overview
leaderboard.html      leaderboard + per-domain + figures
assets/               logo, rendered figures, shared stylesheet
trajectories/         trimmed trajectory browser (5 tasks) + data/
(live demo is hosted separately; nav links point to VibeLifeBench_livedemo)
```
