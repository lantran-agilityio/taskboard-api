// One place that talks HTTP to the API: it adds the token, sends JSON or form
// bodies, and turns error responses into ApiError, so screens only deal with
// messages and field errors.

const BASE_URL: string = import.meta.env.VITE_API_URL ?? "/api";

export class ApiError extends Error {
  readonly status: number;
  /** Messages for single fields, by field name ("email", "password", ...). */
  readonly fieldErrors: Record<string, string>;

  constructor(
    status: number,
    message: string,
    fieldErrors: Record<string, string> = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

/** FastAPI's 422 body: {"detail": [{"loc": ["body", "password"], "msg": "..."}]}. */
interface ValidationIssue {
  loc: (string | number)[];
  msg: string;
}

let onUnauthorized: (() => void) | null = null;

/** Called when an authenticated request gets a 401 (expired or bad token). */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  json?: unknown;
  form?: Record<string, string>;
  token?: string | null;
}

export async function apiFetch<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = "GET", json, form, token } = options;
  const headers: Record<string, string> = { Accept: "application/json" };
  let body: string | undefined;
  if (json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  } else if (form !== undefined) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(form).toString();
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, { method, headers, body });
  } catch {
    throw new ApiError(
      0,
      "Can't reach the server. Check your connection and try again.",
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }
  const data: unknown = await response.json().catch(() => null);
  if (response.ok) {
    return data as T;
  }
  if (response.status === 401 && token) {
    onUnauthorized?.();
  }
  throw toApiError(response.status, data);
}

function toApiError(status: number, data: unknown): ApiError {
  const detail = (data as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string") {
    return new ApiError(status, detail);
  }
  if (Array.isArray(detail)) {
    const fieldErrors: Record<string, string> = {};
    const other: string[] = [];
    for (const issue of detail as ValidationIssue[]) {
      // The last part of loc names the field; "body" alone means the whole body.
      const field = issue.loc.length > 1 ? issue.loc.at(-1) : undefined;
      if (typeof field === "string" && !(field in fieldErrors)) {
        fieldErrors[field] = issue.msg;
      } else {
        other.push(issue.msg);
      }
    }
    return new ApiError(
      status,
      other.join(" ") || "Please check the fields below.",
      fieldErrors,
    );
  }
  return new ApiError(
    status,
    `Something went wrong (error ${status}). Please try again.`,
  );
}
