from datetime import datetime
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, EmailStr, Field

# Lowercased so Alice@example.com and alice@example.com are the same account.
Email = Annotated[EmailStr, AfterValidator(str.lower)]


class UserCreate(BaseModel):
    email: Email
    password: str = Field(min_length=8, max_length=128)


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    created_at: datetime
