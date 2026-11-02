from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.routes.boards import router as boards_router
from app.api.routes.health import router as health_router
from app.core.config import settings
from app.core.database import Base, engine


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # Creates tables on startup; replace with Alembic migrations later.
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title=settings.app_name,
    description="Trello-style task board API: boards, lists and cards.",
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(health_router)
app.include_router(boards_router)
