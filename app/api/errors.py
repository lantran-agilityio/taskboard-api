from typing import TYPE_CHECKING, Literal

from fastapi.exceptions import RequestValidationError

if TYPE_CHECKING:
    from app.models.card import Card


def validation_error(
    location: Literal["body", "path"], field: str, message: str, value: object
) -> RequestValidationError:
    """A 422 for one request field, in the same `detail` shape as FastAPI's own."""
    return RequestValidationError(
        [
            {
                "type": "value_error",
                "loc": (location, field),
                "msg": message,
                "input": value,
            }
        ]
    )


def body_validation_error(
    field: str, message: str, value: object
) -> RequestValidationError:
    return validation_error("body", field, message, value)


def check_not_frozen(card: "Card", field: str, value: object) -> None:
    """A frozen card is read-only, its comments and checklists included, until
    it's restored. The 422 is on the route's path field (`field`, `value`)."""
    if card.is_frozen:
        raise validation_error(
            "path", field, "Card or its list is archived; restore it first", value
        )
