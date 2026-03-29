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
  /** Raw detail payload from the backend (may be a string or object). */
  public readonly detail?: unknown;

  constructor(status: number, message: string, code?: string, detail?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.detail = detail;
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
    let rawDetail: unknown;

    try {
      const body = (await response.json()) as {
        // FastAPI uses 'detail' for error messages
        detail?: string | { msg: string }[] | Record<string, unknown>;
        // Legacy / custom fields
        message?: string;
        code?: string;
      };
      // FastAPI default: { detail: "message" } or { detail: [{msg: "..."}] }
      if (typeof body.detail === 'string') {
        message = body.detail;
      } else if (Array.isArray(body.detail) && body.detail[0]?.msg) {
        message = body.detail[0].msg;
      } else if (body.detail && typeof body.detail === 'object') {
        // Object detail — e.g. { error: 'plan_limit_exceeded', ... }
        rawDetail = body.detail;
        const d = body.detail as { message?: string; error?: string };
        if (typeof d.message === 'string') message = d.message;
        else if (typeof d.error === 'string') message = d.error;
      } else if (body.message) {
        message = body.message;
      }
      if (body.code) code = body.code;
    } catch {
      // Body was not JSON — use status text
    }

    throw new ApiError(response.status, message, code, rawDetail);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

/**
 * Unauthenticated fetch wrapper.
 *
 * For public endpoints that do NOT require a Shopify session token
 * (e.g. GET /billing/plans). Behaves identically to apiFetch() except
 * no Authorization header is attached.
 *
 * @param path - API path e.g. "/billing/plans" (without base URL)
 * @param options - Standard RequestInit options
 * @returns Parsed JSON response typed as T
 * @throws ApiError on non-2xx responses
 */
export async function apiFetchPublic<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${config.api.baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    let message = `Request failed: ${response.status} ${response.statusText}`;
    let code: string | undefined;
    let rawDetail: unknown;

    try {
      const body = (await response.json()) as {
        detail?: string | { msg: string }[] | Record<string, unknown>;
        message?: string;
        code?: string;
      };
      if (typeof body.detail === 'string') {
        message = body.detail;
      } else if (Array.isArray(body.detail) && body.detail[0]?.msg) {
        message = body.detail[0].msg;
      } else if (body.detail && typeof body.detail === 'object') {
        rawDetail = body.detail;
        const d = body.detail as { message?: string; error?: string };
        if (typeof d.message === 'string') message = d.message;
        else if (typeof d.error === 'string') message = d.error;
      } else if (body.message) {
        message = body.message;
      }
      if (body.code) code = body.code;
    } catch {
      // Body was not JSON — use status text
    }

    throw new ApiError(response.status, message, code, rawDetail);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
