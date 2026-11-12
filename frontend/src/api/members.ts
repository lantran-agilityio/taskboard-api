import type { Member } from "../board/model";
import { apiFetch } from "./client";

/** The roles the owner can give: the owner is set when the board is made. */
export type MemberRole = "editor" | "viewer";

/** Invites a registered user by email (422 "No user with this email", 409 if already on). */
export function addMember(
  token: string,
  boardId: number,
  email: string,
  role: MemberRole,
): Promise<Member> {
  return apiFetch<Member>(`/boards/${boardId}/members`, {
    method: "POST",
    json: { email, role },
    token,
  });
}

export function changeRole(
  token: string,
  boardId: number,
  userId: number,
  role: MemberRole,
): Promise<Member> {
  return apiFetch<Member>(`/boards/${boardId}/members/${userId}`, {
    method: "PATCH",
    json: { role },
    token,
  });
}

/** The owner removes someone, or someone removes themselves (leaving). */
export function removeMember(
  token: string,
  boardId: number,
  userId: number,
): Promise<void> {
  return apiFetch<void>(`/boards/${boardId}/members/${userId}`, {
    method: "DELETE",
    token,
  });
}
