from typing import Literal

from fastapi.exceptions import RequestValidationError


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
