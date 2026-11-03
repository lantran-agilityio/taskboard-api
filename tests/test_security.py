from datetime import timedelta

from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)


def test_hash_and_verify_password() -> None:
    hashed = hash_password("correct-horse")

    assert hashed != "correct-horse"
    assert verify_password("correct-horse", hashed)
    assert not verify_password("wrong-horse", hashed)


def test_access_token_round_trip() -> None:
    assert decode_access_token(create_access_token(42)) == 42


def test_expired_token_is_rejected() -> None:
    token = create_access_token(42, expires_delta=timedelta(seconds=-1))

    assert decode_access_token(token) is None


def test_tampered_token_is_rejected() -> None:
    token = create_access_token(42)

    assert decode_access_token(token[:-2] + "xx") is None
