# Submission checklist

Deadline: 15 Nov 2026, 23:59 BRT (Local Event: Goiânia). Target: first submission saved by 21:59.

Checked on 15 Nov 2026 at about 22:15 BRT, on `main` and on a fresh clone of the public repository.

| Item | Status | Evidence |
|---|---|---|
| Public repository opens in a private window | ☑ | `https://github.com/A-T-L-A-S-XIII/NASA-Space-Apps-Challenge` answers 200 without login; a fresh `git clone` works (46 MB). |
| `pytest` passes (`cd backend && python -m pytest`) | ☑ | 163 passed on `main`. |
| `python pipeline/validate_demo.py` passes and finds no fixture | ☑ | `validate_demo: OK` on a fresh clone. |
| Public demo works without login | ☑ | `https://nasa-space-apps-challenge-two.vercel.app` → "Continue as guest". Every screen checked in a headless browser at 1440 and 390 px against the live API: no script errors, no horizontal scroll. |
| Demo works offline on another computer | ☐ to verify | Fallback data in `frontend/public/data/fallback/` and `OFFLINE_MODE` exist and are tested (`npm test`), but no run on another computer was recorded. |
| README complete, with the "AI assistance" section | ☑ | Live link, real screenshot, data used, current gaps, AI assistance text. |
| OpenStreetMap attribution visible on the map; ODbL notice for road data in the README | ☑ | The app uses no OSM tiles; OSM appears only in the place search, and each result shows "OpenStreetMap (Nominatim)". ODbL notice in the README and `NOTICE`. |
| Interface and documentation in English | ☑ | All screens and all Markdown files; proper names stay in Portuguese. |
| Trace scan below prints nothing | ☑ | Both commands print nothing on `main`. |
| Video ≤ 1 min (slides: no limit) | ☐ to verify | Owner: #8. |
| All links open | ☑ | Every `https://` link in the README, `docs/DATA.md` and `NOTICE` answers 200 (the `localhost` ones are local instructions). |

Scan (must print nothing). The bracketed letters keep this file from matching itself:

```bash
P="cl[a]ude|anthr[o]pic|cod[e]x|open[a]i|chatg[p]t|copil[o]t|co-authored-[b]y|generated [w]ith"
git grep -n -i -E "$P"
git log --format=%B | grep -i -E "$P"
```
