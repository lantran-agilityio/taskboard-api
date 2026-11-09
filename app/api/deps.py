from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, HTTPException, Query, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.user import User

# tokenUrl tells Swagger's Authorize button where to log in.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")


def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    user_id = decode_access_token(token)
    user = db.get(User, user_id) if user_id is not None else None
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


@dataclass
class PageParams:
    limit: int
    before: int | None


def page_params(
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    before: Annotated[
        int | None, Query(ge=1, description="next_before from the previous page")
    ] = None,
) -> PageParams:
    return PageParams(limit, before)


# The `limit` and `before` query parameters of a paginated endpoint.
Pagination = Annotated[PageParams, Depends(page_params)]
