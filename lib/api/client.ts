/**
 * lib/api/client.ts
 *
 * Core API client — the ONLY place raw fetch calls are made.
 *
 * All API modules (dashboard.ts, billing.ts, etc.) use apiFetch from here.
 * Never write fetch() calls directly in pages or components.
 *
 * Authentication (App Bridge v4):
 * Every request calls shopify.idToken() (via getSessionToken from appBridge.ts)
 * to get a fresh Shopify JWT, injected as Authorization: Bearer header.
 * The backend validates this token against Shopify's API.
 *
 * No AppBridge app instance is passed around in v4 — the global
 * `shopify` variable is used directly.
 */

import { config } from '@/lib/config';
import { getSessionToken } from '@/lib/shopify/appBridge';

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

/**
 * Typed API error that carries the HTTP status code.
 * Used in React Query retry policy and error handling.
 */
export class ApiError extends Error {
  public readonly status: number;
  public readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Core fetch
// ---------------------------------------------------------------------------

/**
 * Authenticated fetch wrapper.
 *
 * Gets a fresh session token from App Bridge, adds it as Authorization header,
 * then performs the fetch. Parses the response and throws ApiError on failure.
 *
 * @param path - API path e.g. "/dashboard" (without base URL)
 * @param options - Standard RequestInit options
 * @returns Parsed JSON response typed as T
 * @throws ApiError on non-2xx responses
 */
export async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const token = await getSessionToken();

  const response = await fetch(`${config.api.baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    },
  });

  if (!response.ok) {
    let message = `Request failed: ${response.status} ${response.statusText}`;
    let code: string | undefined;

    try {
      const body = (await response.json()) as { message?: string; code?: string };
      if (body.message) message = body.message;
      if (body.code) code = body.code;
    } catch {
      // Body was not JSON — use status text
    }

    throw new ApiError(response.status, message, code);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
