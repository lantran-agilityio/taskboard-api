from datetime import UTC, datetime
from typing import Annotated

from pydantic import AfterValidator, StringConstraints

Name = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)
]

# Free text on boards and cards; may be empty.
Description = Annotated[str, StringConstraints(max_length=2000)]

# Postgres returns timestamptz in the connection's time zone; answer in UTC.
UtcDatetime = Annotated[datetime, AfterValidator(lambda value: value.astimezone(UTC))]
