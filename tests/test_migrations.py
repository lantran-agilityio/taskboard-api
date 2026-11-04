from sqlalchemy import Engine, inspect

from alembic import command
from tests.conftest import alembic_config


def test_models_match_migrations(engine: Engine) -> None:
    # Fails after a model change that has no migration yet.
    command.check(alembic_config())


def test_downgrade_and_upgrade_again(engine: Engine) -> None:
    config = alembic_config()

    command.downgrade(config, "base")
    assert set(inspect(engine).get_table_names()) == {"alembic_version"}

    command.upgrade(config, "head")
    assert {"users", "boards", "board_members", "lists", "cards"} <= set(
        inspect(engine).get_table_names()
    )
