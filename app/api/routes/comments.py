from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.access import EditableCard, EditableComment, ViewableCard
from app.api.deps import CurrentUser, Pagination
from app.api.errors import validation_error
from app.core.database import get_db
from app.models.card import Card
from app.models.comment import Comment
from app.realtime.events import EventType, publish
from app.schemas.comment import CommentCreate, CommentRead, CommentUpdate
from app.schemas.page import Page
from app.services.pagination import PageResult, paginate

# Comments are written and read through their card...
card_comments_router = APIRouter(prefix="/cards/{card_id}/comments", tags=["comments"])
# ...and edited and deleted by their own id.
router = APIRouter(prefix="/comments", tags=["comments"])


def publish_comment(
    db: Session, event_type: EventType, comment: Comment, actor_id: int
) -> None:
    publish(
        db,
        comment.card.board_list.board_id,
        event_type,
        {"comment": CommentRead.model_validate(comment).model_dump(mode="json")},
        actor_id=actor_id,
    )


def check_not_frozen(card: Card) -> None:
    """A frozen card is read-only, its comments included, until it's restored."""
    if card.is_frozen:
        raise validation_error(
            "path", "card_id", "Card or its list is archived; restore it first", card.id
        )


@card_comments_router.post(
    "", response_model=CommentRead, status_code=status.HTTP_201_CREATED
)
def create_comment(
    payload: CommentCreate,
    card: EditableCard,
    user: CurrentUser,
    db: Session = Depends(get_db),
) -> Comment:
    check_not_frozen(card)
    comment = Comment(body=payload.body, author_id=user.id)
    card.comments.append(comment)
    db.flush()  # gives the new comment its id for the event
    publish_comment(db, EventType.COMMENT_CREATED, comment, user.id)
    db.commit()
    db.refresh(comment)
    return comment


@card_comments_router.get("", response_model=Page[CommentRead])
def list_comments(
    card: ViewableCard, page: Pagination, db: Session = Depends(get_db)
) -> PageResult[Comment]:
    """The card's comments, newest first."""
    query = select(Comment).where(Comment.card_id == card.id)
    return paginate(db, query, Comment.id, page.limit, page.before)


@router.patch("/{comment_id}", response_model=CommentRead)
def update_comment(
    payload: CommentUpdate,
    comment: EditableComment,
    user: CurrentUser,
    db: Session = Depends(get_db),
) -> Comment:
    if comment.author_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Requires the comment's author",
        )
    check_not_frozen(comment.card)
    comment.body = payload.body
    comment.edited_at = datetime.now(UTC)
    db.flush()
    publish_comment(db, EventType.COMMENT_UPDATED, comment, user.id)
    db.commit()
    db.refresh(comment)
    return comment


@router.delete("/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_comment(
    comment: EditableComment, user: CurrentUser, db: Session = Depends(get_db)
) -> None:
    card = comment.card
    board = card.board_list.board
    # The owner can moderate; editors can only delete their own. Allowed on
    # frozen cards, so tidying up doesn't need a restore first.
    if user.id not in (comment.author_id, board.owner_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Requires the comment's author or the owner role",
        )
    card.comments.remove(comment)  # delete-orphan deletes it on commit
    db.flush()
    publish(
        db,
        board.id,
        EventType.COMMENT_DELETED,
        {"comment_id": comment.id, "card_id": card.id},
        actor_id=user.id,
    )
    db.commit()
