from sqlalchemy import Engine, inspect, text

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


def test_downgrade_keeps_archived_items_at_the_end(engine: Engine) -> None:
    config = alembic_config()
    with engine.begin() as connection:
        connection.execute(
            text(
                """
                INSERT INTO users (id, email, hashed_password, created_at)
                    VALUES (1, 'a@example.com', 'x', now());
                INSERT INTO boards (id, owner_id, name, created_at)
                    VALUES (1, 1, 'B', now());
                INSERT INTO lists (id, board_id, name, position, archived_at, created_at)
                    VALUES (1, 1, 'Active', 0, NULL, now()),
                           (2, 1, 'Old', NULL, now(), now());
                INSERT INTO cards (id, list_id, title, position, archived_at, created_at)
                    VALUES (1, 1, 'Active', 0, NULL, now()),
                           (2, 1, 'Older', NULL, now() - interval '1 day', now()),
                           (3, 1, 'Old', NULL, now(), now());
                """
            )
        )
    try:
        command.downgrade(config, "0002")

        with engine.connect() as connection:
            lists = connection.execute(
                text("SELECT name, position FROM lists ORDER BY position")
            ).all()
            cards = connection.execute(
                text("SELECT title, position FROM cards ORDER BY position")
            ).all()
        # Archived items come back as active ones at the end, oldest first.
        assert lists == [("Active", 0), ("Old", 1)]
        assert cards == [("Active", 0), ("Older", 1), ("Old", 2)]
    finally:
        command.upgrade(config, "head")
        with engine.begin() as connection:
            connection.execute(text("TRUNCATE users, boards RESTART IDENTITY CASCADE"))
