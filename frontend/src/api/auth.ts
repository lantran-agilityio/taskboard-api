import { apiFetch } from "./client";

export interface User {
  id: number;
  email: string;
  created_at: string;
}

interface Token {
  access_token: string;
  token_type: string;
}

/** Logs in and returns the access token. */
export async function login(email: string, password: string): Promise<string> {
  // /auth/token is an OAuth2 password form: the email goes in "username".
  const token = await apiFetch<Token>("/auth/token", {
    method: "POST",
    form: { username: email, password },
  });
  return token.access_token;
}

export function register(email: string, password: string): Promise<User> {
  return apiFetch<User>("/auth/register", {
    method: "POST",
    json: { email, password },
  });
}

export function me(token: string): Promise<User> {
  return apiFetch<User>("/users/me", { token });
}
