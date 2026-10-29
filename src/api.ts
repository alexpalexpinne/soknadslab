import type { Errors } from "./domain";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public errors?: Errors,
    public code?: "deadline_passed",
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    signal: AbortSignal.timeout(8000),
    headers:
      options.body && typeof options.body === "string"
        ? { "Content-Type": "application/json", ...options.headers }
        : options.headers,
  });
  if (response.status === 204) return undefined as T;
  const body = await response.json();
  if (!response.ok)
    throw new ApiError(
      response.status,
      body.message ?? "The request failed.",
      body.errors,
      body.code,
    );
  return body as T;
}
