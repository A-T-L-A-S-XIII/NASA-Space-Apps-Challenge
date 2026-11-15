# Demo

## Run locally with development fixtures

```bash
python pipeline/make_dev_fixtures.py
python backend/export_static.py --data-dir data/fixtures --allow-fixtures
cd frontend && npm install && npm run dev      # http://localhost:3000
```

The page shows a "DEV FIXTURE" banner: this data is synthetic.

## Run with the API server (development)

```bash
pip install -r backend/requirements.txt
TFW_DATA_DIR=data/fixtures uvicorn app.main:app --app-dir backend --reload   # http://localhost:8000/docs
cd frontend && NEXT_PUBLIC_API_BASE=http://localhost:8000/api npm run dev
```

## Build the public demo (real data only)

```bash
python pipeline/validate_demo.py                      # must print OK
python backend/export_static.py                       # refuses fixtures
python pipeline/validate_demo.py --static frontend/public/api
cd frontend && npm run build                          # static site in frontend/out/
```

Then commit `frontend/public/api/` (remove it from `.gitignore`) and deploy `frontend/out/`.

## Script (to be filled in after D-08)

*[video or slides — awaiting the team]*
