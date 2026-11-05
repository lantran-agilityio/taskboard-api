from collections.abc import Generator
from datetime import datetime
from typing import Any, ClassVar

from sqlalchemy import DateTime, Engine, MetaData, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings


def make_engine(url: str) -> Engine:
    # pool_pre_ping: pooled connections die when Postgres restarts; check each
    # one as it leaves the pool, so a request gets a live one instead of a 500.
    return create_engine(url, pool_pre_ping=True)


engine = make_engine(settings.database_url)

SessionLocal = sessionmaker(bind=engine, autoflush=False)


class Base(DeclarativeBase):
    # Predictable constraint names, so later migrations can find them to drop
    # or change them.
    metadata = MetaData(
        naming_convention={
            "ix": "ix_%(column_0_label)s",
            "uq": "uq_%(table_name)s_%(column_0_name)s_%(column_1_name)s",
            "ck": "ck_%(table_name)s_%(constraint_name)s",
            "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
            "pk": "pk_%(table_name)s",
        }
    )
    # created_at values are timezone-aware UTC; store them as timestamptz so
    # Postgres doesn't convert them to the server's local time.
    type_annotation_map: ClassVar[dict[Any, Any]] = {datetime: DateTime(timezone=True)}


def get_db() -> Generator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
