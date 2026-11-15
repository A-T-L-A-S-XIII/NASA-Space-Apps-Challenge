# Submission checklist

Deadline: 15 Nov 2026, 23:59 BRT (Local Event: Goiânia). Target: first submission saved by 21:59.

| Item | Status |
|---|---|
| Public repository opens in a private window | ☐ |
| `pytest` passes (`cd backend && python -m pytest`) | ☐ |
| `python pipeline/validate_demo.py` passes and finds no fixture | ☐ |
| Public demo works without login | ☐ |
| Demo works offline on another computer | ☐ |
| README complete, with the "AI assistance" section | ☐ |
| OpenStreetMap attribution visible on the map; ODbL notice for road data in the README | ☐ |
| Trace scan below prints nothing | ☐ |
| Video ≤ 1 min (slides: no limit) | ☐ |
| All links open | ☐ |

Scan (must print nothing). The bracketed letters keep this file from matching itself:

```bash
P="cl[a]ude|anthr[o]pic|cod[e]x|open[a]i|chatg[p]t|copil[o]t|co-authored-[b]y|generated [w]ith"
git grep -n -i -E "$P"
git log --format=%B | grep -i -E "$P"
```
