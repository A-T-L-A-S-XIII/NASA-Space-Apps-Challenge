# Demo checklist

## Addresses

| Service | URL |
|---|---|
| Site (Next.js on Vercel) | `https://nasa-space-apps-challenge-two.vercel.app` |
| API (FastAPI on Render) | `https://water-waltz-api.onrender.com` (`/health` and `/docs` are useful to check) |

The browser only opens the site. The Next.js server calls the API (variable `API_URL` on Vercel).

## Before presenting

- [ ] **Wake the API 5 minutes before.** On Render's free plan, FastAPI "sleeps" after 15 minutes without use
      and takes about 1 minute to come back. Open `https://<api>.onrender.com/health` and wait for
      `{"status":"ok"}`. Then open the site once and log in, so Next has already talked to the API.
- [ ] If the API is still waking up, the login enters an **offline session** (only with the demo e-mail) and
      the Vale screens use the saved data, with the "Saved data (offline)" tag. It can be presented, but
      without the El Niño badge, the forecast and the neighbourhood search.
- [ ] Open the site in a private window and go through the script below once.
- [ ] Keep the "the internet is down" plan ready on the presenter's computer (see the end of this page).

## Demo account password

There is one account: `demo@waterwaltz.dev`. Its password is **not in the repository**:

- the source is the `DEMO_USER_PASSWORD` variable of the service in the Render dashboard (Environment),
  visible to whoever has access to the project there;
- the team keeps a copy in: `__________` *(team password vault; fill in)*.

Anyone can also use **Continue as guest**, with no account.

The account is created again at every FastAPI startup from `DEMO_USER_*` (the free plan's disk does not
keep SQLite between deploys). Changing the password on Render and restarting the service is enough.

## Click script

1. **Login:** `demo@waterwaltz.dev` and the password, or **Continue as guest**. Point out the map that jumps
   off the paper when the cursor moves.
2. **Overview:** point to the **"Pacific now: El Niño"** badge (NOAA ONI) in the bar and the
   **Satellite · NISAR** pill (21 images since Jun 2026, revisit every 12 days).
3. **Explore data:** go down South America → Brazil → Rio Grande do Sul → a municipality of the Vale and
   click **"Open the Vale do Taquari panel"**.
4. **Vale do Taquari:** July sentence, forecast, the simulated rain scenario (press **Heavy test rain** to see
   the alert), search by town or neighbourhood and **Save as my home**. Open **Detailed data**.
5. **Change map:** above- and below-normal water over the radar image; show the **highlighter** outlining
   where water appeared and where it dried.
6. **Before × after comparison:** **11 Jul × 23 Jul**.
7. **Timeline of the 19 passes:** press play.
8. **Area by municipality:** table with above- and below-normal area in hectares.
9. **Sentinel-1 history:** "recurrent or one-off?" since 2015.
10. **In-depth mode** (selector in the top bar): technical panel with CRS, granules and polygons; click
    **Export data** (JSON and CSV built in the browser).

If asked:

- **Sign-up:** "Create account" on the login shows the form, validates it and says it is disabled in the demo.
- **News:** the Overview rail is a **future view**, with sample content.
- **Rain scenario:** it is a simulation with demonstration thresholds, labelled "Simulated" on screen.

Safety sentence: it is a candidate water indicator seen by the radar, not a validated flood map, not a
forecast, and not for route or evacuation decisions.

## If the internet goes down

**Poor internet, but the site opens:** follow the script. If the API does not answer, the login goes offline
and the Vale uses the saved data (`frontend/public/data/fallback/`).

**No internet at all:** run both services on the laptop (prepare beforehand, with internet, because
`npm install` and `pip install` download packages):

```bash
cd backend && OFFLINE_MODE=true .venv/bin/python -m uvicorn app.main:app --port 8000
```

```bash
cd frontend && npm run build && npm start
```

and open http://localhost:3000. With `OFFLINE_MODE=true` the API calls nobody: ASF and NOAA come from the
snapshots in `backend/app/data/snapshots/` (the El Niño badge stays), and the 19 passes come from `Fotos/`.
Only the weather forecast and the neighbourhood search have no data.

The day before, with internet, refresh the snapshots:

```bash
cd backend && .venv/bin/python scripts/snapshot.py
```

**Last resort:** the pitch video.
