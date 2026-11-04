from logging.config import fileConfig

from sqlalchemy import Connection, create_engine, pool

import app.models  # noqa: F401  (registers every table on Base.metadata)
from alembic import context
from app.core.config import settings
from app.core.database import Base

config = context.config

# The tests turn this off so running migrations doesn't replace pytest's
# logging setup.
if config.config_file_name is not None and config.attributes.get(
    "configure_logger", True
):
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def database_url() -> str:
    # Tests point Alembic at the test database through the config; otherwise
    # use the app's DATABASE_URL.
    return config.get_main_option("sqlalchemy.url") or settings.database_url


def run_migrations_offline() -> None:
    """Write the SQL to stdout instead of running it (alembic upgrade --sql)."""
    context.configure(
        url=database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_with_connection(connection: Connection) -> None:
    context.configure(
        connection=connection, target_metadata=target_metadata, compare_type=True
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_engine(database_url(), poolclass=pool.NullPool)
    with engine.connect() as connection:
        run_with_connection(connection)


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
