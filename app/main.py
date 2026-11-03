from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.routes.auth import router as auth_router
from app.api.routes.auth import users_router
from app.api.routes.boards import router as boards_router
from app.api.routes.cards import list_cards_router
from app.api.routes.cards import router as cards_router
from app.api.routes.health import router as health_router
from app.api.routes.lists import board_lists_router
from app.api.routes.lists import router as lists_router
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
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(boards_router)
app.include_router(board_lists_router)
app.include_router(lists_router)
app.include_router(list_cards_router)
app.include_router(cards_router)
