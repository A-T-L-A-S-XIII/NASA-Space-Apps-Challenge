from fastapi import APIRouter, HTTPException, status

from app.data.explain import TOPICS, TOPICS_BY_ID
from app.schemas import ExplainTopic

router = APIRouter(prefix="/api/explain", tags=["Explicações"])


@router.get("", response_model=list[ExplainTopic], summary="Lista os textos explicativos")
def list_topics():
    return TOPICS


@router.get("/{topic}", response_model=ExplainTopic, summary="Um texto explicativo",
            responses={404: {"description": "Tópico não encontrado"}})
def get_topic(topic: str):
    """Tópicos: sar, agua-no-radar, nisar, el-nino, la-nina, como-ler-o-mapa."""
    data = TOPICS_BY_ID.get(topic)
    if data is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tópico não encontrado")
    return data
