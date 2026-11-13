import type { Board } from "../api/boards";
import { StarIcon } from "../components/icons";
import { plural } from "../format";

export function BoardTile({
  board,
  onToggleStar,
}: {
  board: Board;
  onToggleStar: (board: Board) => void;
}) {
  return (
    <div className="tile">
      <a className="tile-link" href={`#board-${board.id}`}>
        <span className="tile-name">{board.name}</span>
        <span className="tile-meta">
          {plural(board.list_count, "list")} · {plural(board.card_count, "card")}
        </span>
      </a>
      <button
        type="button"
        className={board.starred ? "star on" : "star"}
        aria-pressed={board.starred}
        aria-label={`${board.starred ? "Unstar" : "Star"} ${board.name}`}
        onClick={() => onToggleStar(board)}
      >
        <StarIcon />
      </button>
    </div>
  );
}
