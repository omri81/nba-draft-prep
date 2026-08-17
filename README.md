# NBA Draft Prep

A personal fantasy-basketball draft board. Single user, no backend, no auth —
everything runs in the browser and lives in `localStorage`. Built to be added to
an iPhone home screen and used live during a draft, offline.

- Import Basketball Monster projections (`.xls` / `.xlsx`) straight from the phone
- Drag players into a custom rank order (dedicated handle, no scroll conflict)
- Tap the checkbox to cross players off as they're drafted
- Tap a row for the full stat sheet, analyst notes and NBA headshot
- Works with no signal once installed; photos are cached by the service worker

## Running locally

```bash
npm install
npm run dev
```

## Importing projections

Export projections from Basketball Monster, then **⋯ → Import projections** and
pick the file. The columns are detected by name, case-insensitively, and the
common aliases are handled — Basketball Monster's per-game form (`p/g`, `r/g`,
`a/g`, `s/g`, `b/g`, `3/g`, `fg/g`, `to/g`), plus `PTS`/`REB`/`TREB`/`AST`/
`STL`/`ST`/`BLK`/`TOV`/`3PM`/`3s` and friends. Rows above the header (title
banners) are skipped automatically.

**Re-importing a newer file keeps your custom order.** Players are matched by
normalized name, existing players stay exactly where you put them, and anyone
new is appended at the bottom with a `NEW` badge. Drafted flags survive too.

## Two projection sources

**⋯ → Projections…** (or tap the source name under the counter) switches between
projection sets. Only one is on screen at a time.

**Switching never touches your board.** The rank order and drafted flags live
outside the projection sets and are shared by all of them — flipping the source
changes only the numbers on the rows. The order is the *union* across sources,
so a player only one site covers keeps his slot; on the other source his stat
line just reads as dashes.

Both are auto-detected on import:

- **Basketball Monster** — the `.xls` export, recognised by its per-category
  value columns (`pV`, `toV`, `Minus1V`).
- **Hashtag Basketball** — paste their table into a Google Sheet and import the
  CSV. Their format has three traps, all handled: the header repeats every
  dozen rows, the top header row sits one column left of its data, and Google
  Sheets reads the `3PM` header as a *time* and stores it as `15:00`.
  Percentages arrive as `0.534(11.1/20.7)`, which is unpacked into the rate plus
  makes and attempts.

### Refreshing from a Google Sheet

Link a sheet to a source (**Projections… → Link a Google Sheet…**, paste the
normal share link) and **↻ Refresh** pulls fresh numbers straight from Google —
no file juggling on a phone. The sheet has to be shared with "anyone with the
link"; its CSV export endpoint answers cross-origin requests, which is what
makes this work from the browser. The link is stored in your browser, not in
this repo.

## Draft slot highlighting

**⋯ → Draft slot…** — set the league size and which pick you have in round 1,
and the board highlights the rows that land on your picks, each tagged with its
round. The header shows your next pick, and flips to *You're up* when the number
of players you've crossed off means you're on the clock.

Snake order by default. **Third-round reversal** (on by default) means round 3
repeats round 2's order instead of snaking back, so the 1.01 picks at

```
1, 20, 30, 31, 50, 51, 70, 71 …   (with 3RR)
1, 20, 21, 40, 41, 60, 61, 80 …   (plain snake)
```

The setup sheet lists your first eight picks so you can check the schedule
against your league's rules before you trust the highlighting.

## Mock draft

**⋯ → Mock draft…** — you make every pick, for every team. No autopick, no
simulation: you know your league, so your judgment is the model.

Set the league size, your slot, rounds, and optionally your leaguemates' names.
Then the bar at the top tells you who's on the clock (turning orange when it's
you) and you tap a player to give them to that team. Drafted players leave the
pool; the board stays in your rank order, so most picks are one tap. `↺` undoes
a mis-tap, and the **ⓘ** on each row still opens the full stat sheet.

**Table** at any point shows all teams across your 11 categories — per-game
totals, each team's rank in every category, and roto points (league size for
first down to 1). FG% and FT% are aggregated as total makes over total
attempts, never as an average of player percentages. Below the table, every
team's roster with the round and pick it was taken at.

The mock lives in its own storage key and **only reads your rank order** — it
never writes to it. Run as many as you like; the board is byte-identical
afterwards, and your live drafted flags are untouched. It survives a reload, so
locking your phone mid-mock doesn't lose it.

## Last season on the player page

Every player page shows the projection next to what he actually did last
season, with the change per category — turnovers coloured inverted, since a
lower projection there is good news. Players who missed the whole season say so
rather than showing zeroes, which is its own signal.

The data is baked in at build time:

```bash
npm run fetch-last-season          # most recently completed season
npm run fetch-last-season 2024-25  # or name one
```

That writes `src/data/lastSeason.json` (~50 KB, 582 players) from the NBA's
`leaguedashplayerstats` endpoint. It is **keyed by NBA player id**, the same id
space as `playerIds.json`, so a player is matched name → id → last season with
no second round of name normalization to disagree with the first.

Baked rather than fetched live for three reasons: `stats.nba.com` wants
browser-ish headers it will not honour cross-origin, the app has to work on
draft night with no signal, and a local file cannot rate-limit you mid-draft.
Re-run it once a season.

## Backups

Safari can evict `localStorage`. **⋯ → Export data** downloads a JSON file with
your order, drafted state and projections; **⋯ → Import data** restores it. Do
this once the night before the draft.

## Player photos

Headshots come from `https://cdn.nba.com/headshots/nba/latest/1040x760/{id}.png`.
The name → id map lives in `src/data/playerIds.json` and is generated by:

```bash
npm run fetch-ids
```

That pulls the current player index from `stats.nba.com` (falling back to a
public GitHub mirror) and writes ~5,000 normalized names. Matching strips
accents and suffixes and handles nickname forms, so `Luka Dončić`,
`Jaren Jackson Jr.`, `C.J. McCollum` and `Cam Johnson` all resolve. Anything
unmatched falls back to a neutral silhouette — never a broken image.

Re-run it at the start of each season, or when rookies are missing photos.

Icons are generated procedurally (no image deps):

```bash
npm run gen-icons
```

## Deploying to GitHub Pages

Create an empty GitHub repo named **`nba-draft-prep`** (the name matters — it
becomes the base path), then:

```bash
git remote add origin git@github.com:<your-username>/nba-draft-prep.git
git push -u origin main
```

In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

The included workflow builds and publishes on every push to `main`. Your URL:

```
https://<your-username>.github.io/nba-draft-prep/
```

If you name the repo something else, the workflow picks the base path up
automatically — nothing to edit.

### Manual deploy instead

```bash
npm run deploy
```

That builds and pushes `dist/` to a `gh-pages` branch (set **Settings → Pages →
Source: Deploy from a branch → `gh-pages` / root`**).

### Deploying to Vercel instead

Vercel serves from the root, so build with an empty base path:

- Build command: `BASE_PATH=/ npm run build`
- Output directory: `dist`

## Adding it to your iPhone

1. Open the URL in **Safari** (not Chrome — only Safari can install PWAs on iOS)
2. Share → **Add to Home Screen**
3. Launch it from the icon. It opens fullscreen with no browser chrome.
4. Import your projections once while online, so the headshots get cached.

## Where the data lives

`localStorage`, under versioned keys:

| Key | Contents |
| --- | --- |
| `nbadp:v1:players` | Parsed projections |
| `nbadp:v1:order` | Your custom rank order |
| `nbadp:v1:drafted` | Who's off the board |
| `nbadp:v1:prefs` | Filter toggles |
| `nbadp:v1:meta` | Source filename + import date |
