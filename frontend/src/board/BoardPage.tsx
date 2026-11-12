import { useEffect, useRef, useState } from "react";

import * as edit from "../api/boardEdit";
import { reopenBoard, setStarred } from "../api/boards";
import { StarIcon } from "../components/icons";
import { InlineEdit } from "../components/InlineEdit";
import { Avatar, type CardActions } from "./CardFront";
import { CardDialog } from "./CardDialog";
import { dropIndex, isNoMove, type Span } from "./dnd";
import * as local from "./edits";
import { AddListColumn, ListColumn, type Drag, type ListActions } from "./ListColumn";
import { ListMenu } from "./ListMenu";
import type { BoardData, Card } from "./model";
import { errorMessage, useBoard } from "./useBoard";

/**
 * The board's lists and cards, kept live over the WebSocket, and editable.
 * With a cardId, that card is open as a dialog over the board.
 */
export function BoardPage({
  boardId,
  token,
  cardId = null,
  onCards,
}: {
  boardId: number;
  token: string;
  cardId?: number | null;
  /** Told which cards are on screen, so opening one needs no lookup. */
  onCards?: (boardId: number, ids: Set<number>) => void;
}) {
  const { view, live, update, reload } = useBoard(boardId, token);
  const [actionError, setActionError] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [listDropAt, setListDropAt] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ listId: number; anchor: HTMLElement } | null>(
    null,
  );
  const [addingCardTo, setAddingCardTo] = useState<number | null>(null);
  const lanes = useRef<HTMLDivElement>(null);

  const cardIds =
    view.status === "ready"
      ? view.data.lists.flatMap((list) => list.cards.map((card) => card.id)).join(",")
      : "";
  useEffect(() => {
    if (view.status !== "ready") return;
    onCards?.(boardId, new Set(cardIds ? cardIds.split(",").map(Number) : []));
  }, [boardId, cardIds, onCards, view.status]);

  const boardName = view.status === "ready" ? view.data.board.name : null;
  useEffect(() => {
    if (boardName) document.title = `${boardName} · Taskboard`;
    return () => {
      document.title = "Taskboard";
    };
  }, [boardName]);

  if (view.status === "loading") return <Message title="Loading the board…" busy />;
  if (view.status === "missing") {
    return (
      <Message title="Board not found">It doesn't exist, or you're not on it.</Message>
    );
  }
  if (view.status === "gone") {
    return (
      <Message title="This board is no longer available">
        It was deleted, or you were removed from it.
      </Message>
    );
  }
  if (view.status === "error") {
    return <Message title="Couldn't load the board">{view.message}</Message>;
  }

  const { board, lists, labels, members } = view.data;
  // Viewers only read, and a closed board is read-only for everyone (R-BOARD-06).
  const canEdit = board.role !== "viewer" && !board.closed_at;
  const canRename = board.role === "owner" && !board.closed_at;

  /**
   * Shows a change at once, then asks the API. If the API refuses, says why
   * and reloads the board, which puts back whatever the API really has.
   */
  async function change<T>(
    what: string,
    show: ((data: BoardData) => BoardData) | null,
    request: () => Promise<T>,
    confirm?: (result: T) => (data: BoardData) => BoardData,
  ): Promise<boolean> {
    setActionError(null);
    if (show) update(show);
    try {
      const result = await request();
      if (confirm) update(confirm(result));
      return true;
    } catch (error) {
      setActionError(`Couldn't ${what}: ${errorMessage(error)}`);
      reload();
      return false;
    }
  }
  /** Asks the API and returns its answer; on a refusal, says why and reloads. */
  async function attempt<T>(
    what: string,
    request: () => Promise<T>,
  ): Promise<T | null> {
    setActionError(null);
    try {
      return await request();
    } catch (error) {
      setActionError(`Couldn't ${what}: ${errorMessage(error)}`);
      reload();
      return null;
    }
  }

  const cardActions: CardActions = {
    onToggleDone: (card: Card) =>
      void change(
        card.due_complete ? "mark the card not done" : "mark the card done",
        (data) => local.changeCard(data, card.id, { due_complete: !card.due_complete }),
        () => edit.updateCard(token, card.id, { due_complete: !card.due_complete }),
      ),
    // No confirmation for cards (R-CARD-08): they're easy to restore.
    onArchive: (card: Card) =>
      void change(
        "archive the card",
        (data) => local.removeCard(data, card.id),
        () => edit.archiveCard(token, card.id),
      ),
    onDragStart: (card: Card) => {
      const fromList = lists.find((list) => list.cards.some((c) => c.id === card.id));
      if (!fromList) return;
      const fromIndex = fromList.cards.findIndex((c) => c.id === card.id);
      setDrag({ kind: "card", id: card.id, fromList: fromList.id, fromIndex });
    },
    onDragEnd: () => {
      setDrag(null);
      setListDropAt(null);
    },
  };

  const listActions: ListActions = {
    ...cardActions,
    onRename: (listId, name) =>
      void change(
        "rename the list",
        (data) => local.renameList(data, listId, name),
        () => edit.updateList(token, listId, { name }),
      ),
    onOpenMenu: (list, anchor) => setMenu({ listId: list.id, anchor }),
    onAddCard: (listId, title) =>
      change(
        "add the card",
        null,
        () => edit.createCard(token, listId, title),
        (card) => (data) => local.addCard(data, card),
      ),
    onDropCard: (listId, index) => {
      if (drag?.kind !== "card") return;
      const { id, fromList, fromIndex } = drag;
      setDrag(null);
      if (isNoMove(fromList, fromIndex, listId, index)) return;
      void change(
        "move the card",
        (data) => local.moveCard(data, id, listId, index),
        () => edit.updateCard(token, id, { list_id: listId, position: index }),
      );
    },
    onListDragStart: (list) =>
      setDrag({ kind: "list", id: list.id, fromIndex: lists.indexOf(list) }),
  };

  function moveList(listId: number, position: number) {
    void change(
      "move the list",
      (data) => local.moveList(data, listId, position),
      () => edit.updateList(token, listId, { position }),
    );
  }

  /** Where a dragged list would land, among the other lists. */
  function listIndexAt(clientX: number, draggedId: number): number {
    const others: Span[] = [];
    lanes.current?.querySelectorAll<HTMLElement>("[data-list]").forEach((element) => {
      if (Number(element.dataset.list) === draggedId) return;
      const box = element.getBoundingClientRect();
      others.push({ start: box.left, size: box.width });
    });
    return dropIndex(others, clientX);
  }

  const listDrag = drag?.kind === "list" ? drag : null;
  const otherLists = lists.filter((list) => list.id !== listDrag?.id);
  const menuList = menu ? lists.find((list) => list.id === menu.listId) : undefined;

  async function toggleStar() {
    const starred = !board.starred;
    await change(
      starred ? "star the board" : "unstar the board",
      (data) => ({ ...data, board: { ...data.board, starred } }),
      () => setStarred(token, board.id, starred),
    );
  }

  return (
    <div className="boardwrap">
      <div className="boardbar gutter">
        <a className="ghost" href="#home">
          ← Boards
        </a>
        <h1 className="board-heading">
          <InlineEdit
            value={board.name}
            label="Board title"
            className="board-title"
            inputClassName="title-input"
            editable={canRename}
            onSave={(name) =>
              void change(
                "rename the board",
                (data) => ({ ...data, board: { ...data.board, name } }),
                () => edit.renameBoard(token, board.id, name),
              )
            }
          />
        </h1>
        <button
          type="button"
          className={board.starred ? "star on" : "star"}
          aria-pressed={board.starred}
          aria-label={board.starred ? "Unstar this board" : "Star this board"}
          onClick={toggleStar}
        >
          <StarIcon />
        </button>
        <span className="grow" />
        <span className={live === "offline" ? "live offline" : "live"} role="status">
          {live === "live"
            ? "Live"
            : live === "offline"
              ? "Reconnecting…"
              : "Connecting…"}
        </span>
        <div className="avs" aria-label="Members">
          {members.map((member) => (
            <Avatar key={member.user_id} member={member} />
          ))}
        </div>
      </div>
      {board.closed_at && (
        <div className="banner gutter" role="status">
          <span>This board is closed, so it's read-only.</span>
          {board.role === "owner" ? (
            <button
              type="button"
              className="btn sm"
              onClick={() =>
                void change(
                  "reopen the board",
                  null,
                  () => reopenBoard(token, board.id),
                  (reopened) => (data) => ({
                    ...data,
                    board: { ...data.board, closed_at: reopened.closed_at },
                  }),
                )
              }
            >
              Reopen board
            </button>
          ) : (
            <span className="muted">Ask the owner to reopen it.</span>
          )}
        </div>
      )}
      {actionError && (
        <p className="form-error gutter" role="alert">
          {actionError}
        </p>
      )}
      <div
        ref={lanes}
        className={
          listDrag && listDropAt !== null && listDropAt >= otherLists.length
            ? "lanes gutter drop-end"
            : "lanes gutter"
        }
        onDragOver={(event) => {
          if (!listDrag) return;
          event.preventDefault(); // allows the drop
          event.dataTransfer.dropEffect = "move";
          setListDropAt(listIndexAt(event.clientX, listDrag.id));
        }}
        onDrop={(event) => {
          if (!listDrag) return;
          event.preventDefault();
          const index = listIndexAt(event.clientX, listDrag.id);
          setDrag(null);
          setListDropAt(null);
          if (index !== listDrag.fromIndex) moveList(listDrag.id, index);
        }}
      >
        {lists.length === 0 && !canEdit && (
          <p className="muted">This board has no lists yet.</p>
        )}
        {lists.map((list) => (
          <ListColumn
            key={list.id}
            list={list}
            labels={labels}
            members={members}
            actions={canEdit ? listActions : undefined}
            drag={drag}
            dropListBefore={
              listDrag !== null &&
              listDropAt !== null &&
              otherLists[listDropAt]?.id === list.id
            }
            addingCard={addingCardTo === list.id}
            onAddingCard={(open) => setAddingCardTo(open ? list.id : null)}
          />
        ))}
        {canEdit && (
          <AddListColumn
            first={lists.length === 0}
            onAdd={(name) =>
              change(
                "add the list",
                null,
                () => edit.createList(token, board.id, name),
                (list) => (data) => local.addList(data, list),
              )
            }
          />
        )}
      </div>
      {cardId !== null && (
        <CardDialog
          key={cardId}
          cardId={cardId}
          data={view.data}
          token={token}
          canEdit={canEdit}
          change={change}
          attempt={attempt}
          update={update}
          onClose={() => {
            window.location.hash = `#board-${board.id}`;
          }}
        />
      )}
      {menu && menuList && (
        <ListMenu
          list={menuList}
          position={lists.indexOf(menuList)}
          listCount={lists.length}
          anchor={menu.anchor}
          onClose={() => setMenu(null)}
          onAddCard={() => setAddingCardTo(menuList.id)}
          onMove={(position) => moveList(menuList.id, position)}
          onSort={(by) =>
            void change(
              "sort the cards",
              null,
              () => edit.sortList(token, menuList.id, by),
              (cards) => (data) => local.setCards(data, menuList.id, cards),
            )
          }
          onArchive={() =>
            void change(
              "archive the list",
              (data) => local.removeList(data, menuList.id),
              () => edit.archiveList(token, menuList.id),
            )
          }
        />
      )}
    </div>
  );
}

function Message({
  title,
  busy = false,
  children,
}: {
  title: string;
  busy?: boolean;
  children?: string;
}) {
  return (
    <main className="page gutter" aria-busy={busy || undefined}>
      <h1>{title}</h1>
      {children && <p className="muted">{children}</p>}
      <a href="#home">← Boards</a>
    </main>
  );
}
