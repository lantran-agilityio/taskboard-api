from fastapi.exceptions import RequestValidationError


def body_validation_error(
    field: str, message: str, value: object
) -> RequestValidationError:
    """A 422 for one body field, in the same `detail` shape as FastAPI's own."""
    return RequestValidationError(
        [
            {
                "type": "value_error",
                "loc": ("body", field),
                "msg": message,
                "input": value,
            }
        ]
    )
