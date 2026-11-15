# API do Water Waltz (backend FastAPI). Build a partir da raiz do repositório:
#   docker build -t water-waltz-api .
#   docker run --rm -p 8000:8000 --env-file backend/.env water-waltz-api
# Testes na mesma imagem:
#   docker run --rm water-waltz-api pytest
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000

WORKDIR /srv

# Dependências primeiro, para o Docker reaproveitar a camada quando só o código muda.
# pipeline/requirements.txt (pillow) é usado pelos testes para gerar data/fixtures.
COPY backend/requirements.txt backend/requirements.txt
COPY pipeline/requirements.txt pipeline/requirements.txt
RUN pip install -r backend/requirements.txt -r pipeline/requirements.txt

# A API lê data/aoi.geojson e pipeline/ a partir da raiz do repositório (app/services/store.py)
# e as 19 passagens NISAR de Fotos/nisar_taquari_50 (NISAR_FOTOS_DIR, app/services/passes.py)
COPY data data
COPY pipeline pipeline
COPY Fotos Fotos
COPY backend backend

# Usuário sem privilégios; ele precisa escrever o SQLite em backend/
RUN useradd --create-home app && chown -R app /srv/backend /srv/data
USER app
WORKDIR /srv/backend

EXPOSE 8000
# Render e Railway definem $PORT; localmente fica 8000.
# sh -c expande o $PORT e o exec deixa o uvicorn como PID 1, recebendo o SIGTERM do deploy.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips '*'"]
