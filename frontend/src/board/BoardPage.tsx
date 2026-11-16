import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import * as edit from "../api/boardEdit";
import { reopenBoard, setStarred } from "../api/boards";
import { StarIcon } from "../components/icons";
import { InlineEdit } from "../components/InlineEdit";
import { Avatar, CARD_MOVE_HINT, type CardActions } from "./CardFront";
import { useSession } from "../auth/session";
import { BoardMenu } from "./BoardMenu";
import { CardDialog } from "./CardDialog";
import { ShareDialog } from "./ShareDialog";
import {
  isMoved,
  pickCard,
  pickList,
  preview,
  step,
  words,
  type BoardHeld,
} from "./boardKeys";
import { indexAmong, isNoMove } from "./dnd";
import * as local from "./edits";
import {
  AddListColumn,
  cardIndexAt,
  ListColumn,
  type Drag,
  type ListActions,
} from "./ListColumn";
import type { Point } from "./touch";
import { useTouchDrag } from "./useTouchDrag";
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
  commentId = null,
  onCards,
}: {
  boardId: number;
  token: string;
  cardId?: number | null;
  /** A comment to highlight in the open card. */
  commentId?: number | null;
  /** Told which cards are on screen, so opening one needs no lookup. */
  onCards?: (boardId: number, ids: Set<number>) => void;
}) {
  const { view, live, update, reload, subscribe } = useBoard(boardId, token);
  const [actionError, setActionError] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [listDropAt, setListDropAt] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ listId: number; anchor: HTMLElement } | null>(
    null,
  );
  const [addingCardTo, setAddingCardTo] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const { session } = useSession();
  const myId = session.status === "signedIn" ? session.user.id : 0;
  const lanes = useRef<HTMLDivElement>(null);
  // A card or list picked up with the keyboard (R-CARD-13, R-LIST-09), what
  // was last announced, and what should have focus (it moves between lists).
  const [held, setHeld] = useState<BoardHeld | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [focus, setFocus] = useState<{ kind: "card" | "list"; id: number } | null>(
    null,
  );

  /** The element a card or list is moved from: the card's link, the list's grip. */
  function handleOf(item: { kind: "card" | "list"; id: number }): HTMLElement | null {
    const selector =
      item.kind === "card"
        ? `[data-card="${item.id}"] .card-link`
        : `[data-list="${item.id}"] .grip`;
    return lanes.current?.querySelector<HTMLElement>(selector) ?? null;
  }

  useEffect(() => {
    if (focus) handleOf(focus)?.focus();
  }, [focus, held]);

  // Touch dragging (R-CARD-12, R-LIST-09): the same `drag` as the mouse, plus
  // the list and place under the finger, which the mouse gets from dragover.
  const [touchDrop, setTouchDrop] = useState<{ list: number; index: number } | null>(
    null,
  );
  const touch = useTouchDrag<{ kind: "card" | "list"; id: number }>({
    onStart: (item) => (item.kind === "card" ? dragCard(item.id) : dragList(item.id)),
    onMove: (item, at) =>
      item.kind === "card"
        ? setTouchDrop(cardTargetAt(at, item.id))
        : setListDropAt(listIndexAt(at.x, item.id)),
    onDrop: (item, at) => {
      if (item.kind === "list") {
        dropList(at.x);
        return;
      }
      const target = cardTargetAt(at, item.id);
      setTouchDrop(null);
      // Let go outside any list: the card goes back.
      if (target) listActions.onDropCard(target.list, target.index);
      else endDrag();
    },
    onCancel: () => {
      setTouchDrop(null);
      endDrag();
    },
  });

  // The latest held item and board, for the blur check a tick later.
  const latest = useRef({ held, view });
  useEffect(() => {
    latest.current = { held, view };
  });

  /**
   * Leaving the held card or list (a click elsewhere, Tab) cancels the move.
   * Checked a tick later, because moving it into another list blurs it for a
   * moment before the effect above focuses it again.
   */
  function onLanesBlur() {
    setTimeout(() => {
      const { held, view } = latest.current;
      if (!held || view.status !== "ready") return;
      if (handleOf(held) === document.activeElement) return;
      setHeld(null);
      setFocus(null);
      setAnnouncement(words(view.data.lists, held, "cancel"));
    });
  }

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

  // While something is held, the board shows where it would land.
  const { board, lists, labels, members } = held ? preview(view.data, held) : view.data;
  // Moves are worked out on the board as it really is.
  const realLists = view.data.lists;
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
    onDragStart: (card: Card) => dragCard(card.id),
    onDragEnd: endDrag,
    onTouch: (card, event) => touch({ kind: "card", id: card.id }, event),
    onKey: (card, event) => onMoveKey(event, () => pickCard(realLists, card.id)),
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
    onListDragStart: (list) => dragList(list.id),
    onListTouch: (list, event) => touch({ kind: "list", id: list.id }, event),
    onListKey: (list, event) => onMoveKey(event, () => pickList(realLists, list.id)),
  };

  /**
   * The keyboard pick-up mode (D13): Space picks the focused card or list up,
   * the arrow keys move it (on screen only), Space or Enter drops it, with one
   * request, and Escape or leaving it puts it back. Enter on a card that isn't held still
   * opens it.
   */
  function onMoveKey(event: KeyboardEvent<HTMLElement>, pick: () => BoardHeld | null) {
    const here = pick();
    if (!here) return;
    const mine = held && held.kind === here.kind && held.id === here.id;
    const key = event.key;
    if (!held) {
      // A list's grip is a button, so Enter works too; a card's link opens on Enter.
      if (key === " " || (key === "Enter" && here.kind === "list")) {
        event.preventDefault();
        setHeld(here);
        setFocus({ kind: here.kind, id: here.id });
        setAnnouncement(words(realLists, here, "pick"));
      }
      return;
    }
    if (!mine) return;
    if (key === " " || key === "Enter") {
      event.preventDefault();
      setHeld(null);
      setAnnouncement(words(realLists, held, "drop"));
      if (isMoved(held)) dropHeld(held);
    } else if (key === "Escape") {
      event.preventDefault();
      setHeld(null);
      setAnnouncement(words(realLists, held, "cancel"));
    } else if (key.startsWith("Arrow")) {
      event.preventDefault();
      const next = step(realLists, held, key);
      setHeld(next);
      setAnnouncement(words(realLists, next, "move"));
    }
  }

  function dropHeld(at: BoardHeld) {
    if (at.kind === "list") {
      moveList(at.id, at.index);
      return;
    }
    void change(
      "move the card",
      (data) => local.moveCard(data, at.id, at.list, at.index),
      () => edit.updateCard(token, at.id, { list_id: at.list, position: at.index }),
    );
  }

  function moveList(listId: number, position: number) {
    void change(
      "move the list",
      (data) => local.moveList(data, listId, position),
      () => edit.updateList(token, listId, { position }),
    );
  }

  function dragCard(cardId: number) {
    const fromList = lists.find((list) => list.cards.some((c) => c.id === cardId));
    if (!fromList) return;
    const fromIndex = fromList.cards.findIndex((c) => c.id === cardId);
    setDrag({ kind: "card", id: cardId, fromList: fromList.id, fromIndex });
  }

  function dragList(listId: number) {
    setDrag({
      kind: "list",
      id: listId,
      fromIndex: lists.findIndex((list) => list.id === listId),
    });
  }

  function endDrag() {
    setDrag(null);
    setListDropAt(null);
  }

  /** Drops the dragged list where `clientX` puts it, if that's a move. */
  function dropList(clientX: number) {
    if (drag?.kind !== "list") return;
    const index = listIndexAt(clientX, drag.id);
    endDrag();
    if (index !== drag.fromIndex) moveList(drag.id, index);
  }

  /** Where a dragged list would land, among the other lists. */
  function listIndexAt(clientX: number, draggedId: number): number {
    return indexAmong(
      lanes.current?.querySelectorAll<HTMLElement>("[data-list]") ?? [],
      (element) => Number(element.dataset.list) === draggedId,
      "x",
      clientX,
    );
  }

  /** The list under a finger dragging a card, and where among its cards it would land. */
  function cardTargetAt(at: Point, cardId: number) {
    const under = document.elementFromPoint?.(at.x, at.y);
    const column = under?.closest<HTMLElement>("[data-list]");
    if (!column || !lanes.current?.contains(column)) return null;
    return {
      list: Number(column.dataset.list),
      index: cardIndexAt(column, cardId, at.y),
    };
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
        <button type="button" className="btn" onClick={() => setShareOpen(true)}>
          Share
        </button>
        <button
          type="button"
          className="btn"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          Menu
        </button>
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
        onBlur={held ? onLanesBlur : undefined}
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
          dropList(event.clientX);
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
            held={held}
            touchDropAt={touchDrop?.list === list.id ? touchDrop.index : null}
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
      {canEdit && (
        <p id={CARD_MOVE_HINT} hidden>
          Press Space to move this card with the arrow keys.
        </p>
      )}
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      {menuOpen && (
        <BoardMenu
          data={view.data}
          token={token}
          myId={myId}
          canEdit={canEdit}
          change={change}
          attempt={attempt}
          update={update}
          subscribe={subscribe}
          onClose={() => setMenuOpen(false)}
        />
      )}
      {shareOpen && (
        <ShareDialog
          data={view.data}
          token={token}
          myId={myId}
          change={change}
          attempt={attempt}
          update={update}
          onClose={() => setShareOpen(false)}
          onLeft={() => {
            window.location.hash = "#home";
          }}
        />
      )}
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
          subscribe={subscribe}
          commentId={commentId}
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
