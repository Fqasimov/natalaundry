import { supabase } from "@/lib/supabase";

/**
 * The Laravel API.
 *
 * Reads go straight to Postgres through Supabase, where RLS is a good fit for
 * "you may see your own rows". Writes where money or state is decided do not:
 * a request body is whatever the caller chose to send, so an order created
 * directly against the table carries a total the client made up. Those writes
 * go through here, and the server prices and validates them.
 */
const baseUrl = process.env.EXPO_PUBLIC_API_URL;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function requireBaseUrl(): string {
  if (!baseUrl) {
    // Deliberately fatal rather than falling back to a direct table write:
    // the fallback would look like it worked and quietly let the client set
    // its own prices.
    throw new Error(
      "Missing EXPO_PUBLIC_API_URL. Order creation is priced by the API; " +
        "point it at the Laravel deployment (see .env.example)."
    );
  }
  return baseUrl.replace(/\/+$/, "");
}

/** The caller's Supabase access token, which the API verifies. */
async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiError("Not signed in.", 401);

  return { Authorization: `Bearer ${token}` };
}

export async function apiRequest<T>(
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<T> {
  const response = await fetch(`${requireBaseUrl()}/api/${path.replace(/^\/+/, "")}`, {
    method: init.method ?? "GET",
    headers: {
      Accept: "application/json",
      ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(await authHeader()),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  const text = await response.text();
  const payload = text ? safeParse(text) : null;

  if (!response.ok) {
    // Laravel reports validation failures as { message, errors }; the message
    // alone is what a customer can act on.
    const message =
      (payload && typeof payload === "object" && "message" in payload
        ? String((payload as { message: unknown }).message)
        : null) ?? `Request failed (${response.status}).`;
    throw new ApiError(message, response.status);
  }

  return payload as T;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export const apiPost = <T>(path: string, body?: unknown) =>
  apiRequest<T>(path, { method: "POST", body: body ?? {} });
