/**
 * app/api/catalog-summary/route.ts
 *
 * Server-side proxy for GET /store/catalog/summary.
 *
 * Why this exists:
 * The backend /store/catalog/summary endpoint was missing CORS headers,
 * so this proxies the request server-side. Now kept as the primary path
 * to ensure consistent behaviour regardless of browser CORS policy.
 */

import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://api.aoatraders.com';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('Authorization');

  if (!authHeader) {
    return NextResponse.json({ detail: 'Missing Authorization header' }, { status: 401 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${API_BASE}/store/catalog/summary`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      cache: 'no-store',
    });
  } catch (err) {
    console.error('[AOA proxy] /store/catalog/summary fetch failed:', err);
    return NextResponse.json({ detail: 'Upstream request failed' }, { status: 502 });
  }

  // Forward non-JSON error responses with their status code so the client
  // can surface a meaningful error rather than a JSON parse exception.
  const contentType = upstream.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    const text = await upstream.text().catch(() => '(empty body)');
    console.error(`[AOA proxy] unexpected content-type "${contentType}" from upstream:`, text);
    return NextResponse.json(
      { detail: `Upstream returned non-JSON response (${upstream.status})` },
      { status: upstream.status === 200 ? 502 : upstream.status }
    );
  }

  const body: unknown = await upstream.json();
  return NextResponse.json(body, { status: upstream.status });
}
