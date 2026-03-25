# RUNBOOK.md — AOA Sync Frontend

> **Branch:** `feature/shopify-frontend`
> **App URL:** `https://app.aoatraders.com`
> **Backend URL:** `https://api.aoatraders.com`

---

## Table of Contents

1. [Install & Run](#install--run)
2. [Environment Variables](#environment-variables)
3. [Running Locally with Shopify Embedding](#running-locally-with-shopify-embedding)
4. [Debugging Common Issues](#debugging-common-issues)
5. [Billing Flow Testing](#billing-flow-testing)
6. [Frontend ↔ Backend Connection](#frontend--backend-connection)
7. [Future WorkOS Auth Integration](#future-workos-auth-integration)

---

## Install & Run

### Prerequisites

- Node.js 20+ (`node --version`)
- npm 10+ (`npm --version`)
- A Shopify Partner account with an app configured (for local embedding)
- An ngrok or Shopify CLI tunnel for local development

### Install dependencies

```bash
npm install
```

### Run development server

```bash
npm run dev
```

App runs at `http://localhost:3000`.

> **Note:** You cannot test the embedded experience at `localhost:3000` directly. You must use a tunnel. See [Running Locally with Shopify Embedding](#running-locally-with-shopify-embedding).

### Build for production

```bash
npm run build
npm run start
```

### Type check

```bash
npm run type-check
```

### Lint

```bash
npm run lint
```

---

## Environment Variables

Copy `.env.local.example` to `.env.local` and fill in the values:

```bash
cp .env.local.example .env.local
```

### Required Variables

| Variable                        | Description                                                           | Example                          |
|---------------------------------|-----------------------------------------------------------------------|----------------------------------|
| `NEXT_PUBLIC_SHOPIFY_API_KEY`   | Your Shopify app's API key (client key). Safe to expose publicly.     | `abc123def456...`                |
| `NEXT_PUBLIC_API_BASE_URL`      | Base URL of the AOA backend API.                                      | `https://api.aoatraders.com`     |

> **`NEXT_PUBLIC_` prefix** makes variables available in client-side code. Only non-sensitive config should use this prefix. The Shopify API key is intentionally public — this is normal for embedded apps.

### Development Overrides

For local development against a local backend:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

---

## Running Locally with Shopify Embedding

Shopify embedded apps must be served over HTTPS from a publicly accessible URL. Use one of these approaches:

### Option A: Shopify CLI Tunnel (Recommended)

If the backend uses Shopify CLI:

```bash
# From the backend project
shopify app dev
```

This opens a tunnel and configures the app URL in your Partner dashboard automatically.

### Option B: ngrok Manual Tunnel

1. Install ngrok: `npm install -g ngrok`
2. Start the Next.js dev server: `npm run dev`
3. In another terminal: `ngrok http 3000`
4. Copy the `https://xxxx.ngrok.io` URL
5. Update your Shopify Partner app settings:
   - **App URL**: `https://xxxx.ngrok.io`
   - **Allowed redirection URLs**: `https://xxxx.ngrok.io/billing/return`
6. Update `.env.local`:
   ```env
   NEXT_PUBLIC_SHOPIFY_API_KEY=your_api_key
   ```

### How Embedding Works

1. Merchant opens Shopify Admin → Apps → Your App
2. Shopify loads: `https://your-app-url/?shop=merchant.myshopify.com&host=BASE64_HOST`
3. Frontend root page redirects to `/dashboard?shop=...&host=...`
4. `EmbeddedShell` reads `host` from URL, initializes App Bridge
5. App Bridge communicates with parent Shopify Admin frame via `postMessage`
6. App is now embedded and behaves as a native Shopify Admin page

### The `host` Parameter

The `host` param is a **base64-encoded string** containing the shop's admin URL. It is:
- Required to initialize App Bridge
- Not a secret (it's visible in the URL)
- Persisted to `sessionStorage` by `EmbeddedShell` so it survives client-side navigation

---

## Debugging Common Issues

### App shows blank screen in Shopify Admin

**Check:**
1. Is the app URL correctly set in Shopify Partners dashboard?
2. Is the `NEXT_PUBLIC_SHOPIFY_API_KEY` correct and matching the app?
3. Open browser DevTools → Console for errors
4. Check if `?host=` is present in the URL

### App Bridge fails to initialize

**Symptoms:** `window.shopify` is undefined; no session token; app renders but can't call backend.

**Fix:**
- Check browser DevTools → Network tab: confirm `app-bridge.js` loaded from Shopify CDN (status 200)
- Check browser DevTools → Elements: confirm `<meta name="shopify-api-key">` is present in `<head>` with your Client ID
- Confirm `NEXT_PUBLIC_SHOPIFY_API_KEY` in `.env.local` is not empty and matches Partner Dashboard
- App must be loaded from Shopify Admin (the CDN script only initializes inside the Shopify iframe)
- Try accessing the app from Shopify Admin → Apps → AOA Sync (not from localhost directly)

### "Refused to frame" / CSP errors

**Symptoms:** Browser shows CSP error, app doesn't load in iframe.

**Fix:**
- Verify `next.config.ts` has the correct `frame-ancestors` CSP header
- Ensure no `X-Frame-Options` header is being added elsewhere

### Session token errors (401 from backend)

**Symptoms:** API calls return 401, data doesn't load.

**Check:**
1. Open browser console — confirm `window.shopify` exists (type `window.shopify` in console)
2. App Bridge CDN script must have loaded: check Network tab for `app-bridge.js` (status 200)
3. Check `lib/shopify/appBridge.ts` — `shopify.idToken()` must be called after App Bridge loads
4. Backend must validate the JWT against Shopify's API correctly
5. Confirm the `NEXT_PUBLIC_SHOPIFY_API_KEY` in `.env.local` matches the Partner Dashboard Client ID exactly

### React Query data not refreshing

**Check:**
- `staleTime` is configured in `app/providers.tsx`
- Query keys are unique per resource
- Use React Query DevTools (visible in development) to inspect query state

### TypeScript errors on build

```bash
npm run type-check
```

Look at `types/api.ts` and `types/merchant.ts` for type definitions. If backend contracts changed, update the types there first.

---

## Billing Flow Testing

### Flow Overview

```
1. Merchant clicks "Subscribe" on Plans page
2. Frontend: POST /billing/subscribe { plan: "starter" }
3. Backend: Creates Shopify billing record, returns { confirmationUrl }
4. Frontend: Redirects to confirmationUrl (Shopify billing page)
5. Merchant: Approves or declines billing
6. Shopify: Calls backend billing callback
7. Backend: Validates, then redirects to:
   https://app.aoatraders.com/billing/return?shop=...&status=success|pending|failed
8. /billing/return page: Reads status, shows appropriate UI
```

### Testing in Development

1. Set up ngrok tunnel (see above)
2. Navigate to `/plans` in the embedded app
3. Click a plan — should trigger a `POST /billing/subscribe`
4. If backend returns a `confirmationUrl`, you'll be redirected to Shopify's billing page
5. Use Shopify's test mode to approve billing
6. You'll be redirected back to `/billing/return?status=success`

### Billing Return Page States

| Query Param              | UI State Shown              |
|--------------------------|-----------------------------|
| `?status=success`        | Success banner + link to Dashboard |
| `?status=pending`        | Pending state + instructions |
| `?status=failed`         | Error banner + retry option  |
| Missing `?status`        | Unknown state fallback       |

---

## Frontend ↔ Backend Connection

### How Requests Are Authenticated

Every API call from the frontend:

1. Calls `shopify.idToken()` via `lib/shopify/appBridge.ts` — App Bridge returns a signed Shopify JWT
2. Sends request to backend with `Authorization: Bearer <token>`
3. Backend validates the JWT using Shopify's token verification (HMAC or `verifySessionToken`)
4. Backend extracts `shop` from the validated JWT and returns merchant-specific data

> **App Bridge v4:** `shopify.idToken()` replaces the v3 `getSessionToken(app)` pattern.
> The `shopify` global is always available after the CDN script loads — no app instance is passed.

### CORS Requirements

The backend must allow:
- **Origin:** `https://app.aoatraders.com`
- **Methods:** `GET, POST, PUT, DELETE, OPTIONS`
- **Headers:** `Authorization, Content-Type`
- **Credentials:** Not needed (Bearer token, not cookies)

### Local Dev CORS

When running locally, configure the backend to also allow:
- `http://localhost:3000` and `http://localhost:3001`
- `https://*.ngrok-free.app` (free ngrok)
- `https://*.ngrok.app` (paid ngrok with custom domains)

---

## Future WorkOS Auth Integration

When `feature/workos-auth` is ready, these steps will be needed on the frontend:

### What Will Change

1. **`lib/auth/session.ts`** — Replace the stub `getCurrentUser()` with WorkOS SDK (`@workos-inc/authkit-nextjs` or similar)
2. **`app/providers.tsx`** — Add WorkOS AuthKit Provider wrapping the app
3. **`components/guards/RequireMerchant.tsx`** — New guard component checking WorkOS user has a linked store
4. **`app/(embedded)/layout.tsx`** — Wrap embedded pages with `<RequireMerchant>`
5. **`.env.local`** — Add WorkOS env vars:
   ```env
   WORKOS_API_KEY=sk_...              # Server-side only (no NEXT_PUBLIC_)
   WORKOS_CLIENT_ID=client_...
   NEXT_PUBLIC_WORKOS_REDIRECT_URI=https://app.aoatraders.com/auth/callback
   ```

### What Will NOT Change

- App Bridge initialization (Shopify embedding still works the same way)
- Polaris components and UI
- React Query data fetching patterns
- API client structure (only the auth header source changes)
- Route structure

### Why It's Isolated

The auth concern is isolated in `lib/auth/session.ts`. Everything else in the app receives a `SessionUser` object (or null) from that module — no component directly calls WorkOS SDK.
