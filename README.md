# repit

A fast, offline rep counter for iPhone and Android. It's a plain web app (PWA), so it needs no app store, no account and no build step.

- **Count**: every exercise shows today's reps and the all-time total, with big **+1 / +5 / +10** buttons. Taps in quick succession form a set that you can undo in one go.
- **Trends**: last 7 days, all-time total, best day, streak, and a bar chart for the last 30 days, 26 weeks or 12 months.
- **Goals**: set a total-rep goal per exercise for **1 month, 6 months or 1 year**. A goal repeats every period from its start date and shows progress, pace and the reps per day needed to finish.
- **Share**: the share button at the top makes an image of today's reps and goal progress and opens your phone's share sheet (where sharing isn't available, it saves the image instead).
- **Your data stays on your device** (browser `localStorage`). Export a backup file and import it anywhere. There is no server, no analytics and no tracking.
- Works offline, follows the system light/dark setting, and installs to the home screen.

## Put it on GitHub Pages

1. Create a GitHub repository named `repit` and push these files to the `main` branch.
2. In the repository, open **Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch**, then **main** and **/ (root)**, and save.
3. After a minute or so the app is live at `https://<your-username>.github.io/repit/`.

All paths are relative, so it also works from any other folder or a custom domain.

## Install it on your phone

- **iPhone / iPad**: open the site in Safari, tap **Share**, then **Add to Home Screen**.
- **Android**: open the site in Chrome and tap **Install** (or **⋮ → Add to Home screen**).

On iPhone the Home Screen app keeps its own storage, separate from Safari. Install it before you start logging, or move existing data with Export/Import. Installing also keeps iOS from clearing the data of a site you haven't visited for a while.

## Backup and restore

Tap the settings icon in the top-right corner:

- **Export backup** saves `repit-backup-YYYY-MM-DD.json`. On iPhone this opens the share sheet, so you can pick *Save to Files*, AirDrop or Mail. On other devices it downloads the file.
- **Import backup** loads a backup file. It replaces the data on the device, and you can undo it right after.
- **Copy or paste as text** does the same through the clipboard, which is handy for moving data between Safari and the installed app.

The backup is readable JSON:

```json
{
  "app": "repit",
  "version": 1,
  "exportedAt": "2026-10-21T18:30:00.000Z",
  "exercises": [
    {
      "id": "k3j2h1a9x",
      "name": "Push-ups",
      "days": { "2026-10-20": 60, "2026-10-21": 45 },
      "goals": { "1m": { "target": 1500, "start": "2026-10-01" } }
    }
  ]
}
```

`days` maps local calendar dates to the reps logged that day. Goal periods are `1m`, `6m` and `1y`.

## Development

No dependencies and no build. Serve the folder with any static server and open it:

```bash
python3 -m http.server 8000
```

| File | What it does |
| --- | --- |
| `index.html` | Page structure and dialogs |
| `styles.css` | All styling, light and dark |
| `js/app.js` | UI: counting, trends, goals, backup, install prompt |
| `js/chart.js` | The SVG bar chart |
| `js/share.js` | Draws the share image |
| `js/store.js` | Storage, backup format and validation |
| `js/dates.js` | Calendar-day and goal-period math |
| `sw.js` | Offline cache (service worker) |
| `manifest.webmanifest`, `icons/` | Install metadata and app icons |

The service worker serves the app from its cache and refreshes it in the background, so a deploy reaches installed copies within a launch or two. To push an update right away, bump `VERSION` in `sw.js` (and in `js/app.js` so the settings screen shows it). Open copies then offer a **Reload**.
