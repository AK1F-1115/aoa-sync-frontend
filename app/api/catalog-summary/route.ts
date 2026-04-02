/**
 * app/api/catalog-summary/route.ts
 *
 * Server-side proxy for GET /store/catalog/summary.
 *
 * Why this exists:
 * The backend /store/catalog/summary endpoint is missing the
 * Access-Control-Allow-Origin header, so browsers block the direct
 * fetch from app.aoatraders.com. This Next.js route proxies the request
 * server-side (no CORS restriction) and forwards the response.
 *
 * The client sends its Shopify session token as Authorization: Bearer <token>;
 * this proxy forwards it unchanged to the backend so the store is identified.
 */

import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://api.aoatraders.com';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('Authorization');

  if (!authHeader) {
    return NextResponse.json({ detail: 'Missing Authorization header' }, { status: 401 });
  }

  try {
    const upstream = await fetch(`${API_BASE}/store/catalog/summary`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      // Don't cache — summary should reflect real-time counts
      cache: 'no-store',
    });

    const body: unknown = await upstream.json();

    return NextResponse.json(body, { status: upstream.status });
  } catch (err) {
    console.error('[AOA proxy] /store/catalog/summary upstream error:', err);
    return NextResponse.json(
      { detail: 'Upstream request failed' },
      { status: 502 }
    );
  }
}
