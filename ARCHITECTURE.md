# ARCHITECTURE.md — AOA Sync Frontend

> **Branch:** `feature/shopify-frontend`
> **Frontend URL:** `https://app.aoatraders.com`
> **Backend API:** `https://api.aoatraders.com`
> **Stack:** Next.js 15.5.14 App Router · TypeScript · Shopify Polaris 13 · App Bridge React v4 · TanStack React Query v5

---

## Table of Contents

1. [Overview](#overview)
2. [Folder Structure](#folder-structure)
3. [File Responsibilities](#file-responsibilities)
4. [Provider Hierarchy](#provider-hierarchy)
5. [Route Structure](#route-structure)
6. [Embedded App Lifecycle](#embedded-app-lifecycle)
7. [Auth & Bootstrap Flow](#auth--bootstrap-flow)
8. [Backend API Integration](#backend-api-integration)
9. [State Management](#state-management)
10. [WorkOS Integration Points](#workos-integration-points)
11. [Open Backend Contracts](#open-backend-contracts)
12. [Security Model](#security-model)

---

## Overview

AOA Sync is an embedded Shopify app that syncs merchant product data to AOA Traders' internal catalog.

The frontend is a **Next.js 15.5.14 App Router** app that:
- Loads inside the Shopify Admin as an embedded iframe
- Uses Shopify App Bridge for session token auth and admin-native navigation
- Uses Shopify Polaris for UI components
- Communicates with the AOA backend (`api.aoatraders.com`)
- Is designed to support a future WorkOS-based unified auth system

---

## Folder Structure

```
aoa-sync-frontend-app/
│
├── app/
│   ├── layout.tsx                     # Root HTML shell, imports Polaris CSS
│   ├── providers.tsx                  # QueryClientProvider (client component)
│   ├── page.tsx                       # Root redirect → /dashboard (preserves params)
│   ├── globals.css                    # Minimal global reset
│   │
│   ├── (embedded)/                    # Route group: App Bridge + Polaris context
│   │   ├── layout.tsx                 # Renders EmbeddedShell client component
│   │   ├── dashboard/
│   │   │   └── page.tsx               # Merchant dashboard
│   │   ├── plans/
│   │   │   └── page.tsx               # Plan selection + subscribe
│   │   ├── subscription/
│   │   │   └── page.tsx               # Current plan + manage/cancel
│   │   └── orders/
│   │       └── page.tsx               # Placeholder (Coming Soon)
│   │
│   └── billing/
│       ├── layout.tsx                 # Minimal Polaris-only layout (no App Bridge)
│       └── return/
│           └── page.tsx               # Billing confirmation return handler
│
├── components/
│   ├── EmbeddedShell.tsx              # Client: initializes App Bridge + Polaris
│   ├── NavMenu.tsx                    # Client: App Bridge NavigationMenu
│   ├── LoadingSpinner.tsx             # Full-page loading state
│   └── ErrorBoundary.tsx             # React error boundary
│
├── lib/
│   ├── config.ts                      # Env var validation via zod (server+client safe)
│   ├── api/
│   │   ├── client.ts                  # Core API fetch with session token auth
│   │   ├── dashboard.ts               # Dashboard/sync health API calls
│   │   ├── billing.ts                 # Billing subscribe API call
│   │   └── subscription.ts            # Subscription status API calls
│   ├── shopify/
│   │   └── appBridge.ts               # App Bridge utilities (session token, host)
│   └── auth/
│       └── session.ts                 # Session abstraction layer (WorkOS-ready stub)
│
├── hooks/
│   ├── useMerchantContext.ts          # Shop + sync health data (React Query)
│   └── useShop.ts                     # Convenience hook for current shop info
│
├── types/
│   ├── api.ts                         # API request/response types
│   └── merchant.ts                    # Merchant, shop, sync health types
│
├── .env.local.example                 # Required env vars template
├── next.config.ts                     # CSP headers for embedding
├── tsconfig.json
└── package.json
```

---

## File Responsibilities

### `app/layout.tsx`
- Root HTML shell (`<html>`, `<body>`)
- Imports Polaris CSS (`@shopify/polaris/build/esm/styles.css`)
- Imports `globals.css`
- Wraps children in `<Providers>` (React Query)
- Server component — no App Bridge logic here

### `app/providers.tsx`
- `'use client'` — contains `QueryClientProvider`
- Configures default React Query options (staleTime, retry policy)
- Dev tools in development mode only

### `app/page.tsx`
- Root page — redirects to `/dashboard`
- Preserves `?shop=` and `?host=` query params for App Bridge initialization

### `app/(embedded)/layout.tsx`
- Route group layout that wraps all embedded pages
- Renders `<EmbeddedShell>` client component
- Provides the Polaris + App Bridge context boundary

### `components/EmbeddedShell.tsx`
- `'use client'` — wraps children in Polaris context
- **App Bridge v4**: no React `Provider` needed — App Bridge is initialized via `<meta>` + CDN `<script>` in `app/layout.tsx`
- Wraps children in Polaris `AppProvider` and `Frame`
- Renders `<NavMenu>` for Shopify Admin sidebar navigation
- Contains a runtime guard that logs a console error if `NEXT_PUBLIC_SHOPIFY_API_KEY` is empty

### `app/billing/layout.tsx`
- Minimal Polaris `AppProvider` wrapper for all `/billing/*` routes
- These routes are **outside** the `(embedded)` group — no App Bridge, no `Frame`, no `NavMenu`
- Required because Polaris components always need an `AppProvider` ancestor

### `lib/config.ts`
- Uses `zod` to validate all env vars at module load time
- `NEXT_PUBLIC_SHOPIFY_API_KEY` defaults to `''` at build time so `npm run build` succeeds without `.env.local`
- At runtime in the browser, `EmbeddedShell` logs a console error if the key is empty — App Bridge will not initialize without it
- All other validations (URL format, enum values) still throw on bad values
- Centralises all config access — no `process.env.*` calls elsewhere

### `lib/api/client.ts`
- Core fetch wrapper
- Gets session token from App Bridge on every request
- Adds `Authorization: Bearer <token>` header
- Normalises API errors into typed `ApiError` class
- All other API modules use this

### `lib/auth/session.ts`
- **WorkOS integration stub** — designed for future use
- Currently provides a no-op `getCurrentUser()` function
- This is where WorkOS SDK calls will be added in `feature/workos-auth`
- Contains `SessionUser` type that can be extended

---

## Provider Hierarchy

**App Bridge v4** does NOT use a React Provider component. It is initialized
entirely via two tags in `<head>` (set in `app/layout.tsx`):

```html
<meta name="shopify-api-key" content="{NEXT_PUBLIC_SHOPIFY_API_KEY}" />
<script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" />
```

The CDN script reads the `<meta>` tag and initializes the `window.shopify`
global automatically. No Provider wrapping is needed.

```
<html>
  <head>
    <meta name="shopify-api-key" content={apiKey} />   ← App Bridge v4 init
    <script src="cdn.shopify.com/app-bridge.js" />     ← App Bridge v4 init
  </head>
  <body>
    <Providers>                           ← QueryClientProvider (client)
      {children}
        └─ (embedded) route group
             <EmbeddedShell>              ← Polaris context only (client)
               <PolarisProvider>         ← @shopify/polaris AppProvider
                 <Frame>                 ← Polaris Frame (for Toast, etc.)
                   <NavMenu />           ← App Bridge v4 NavMenu (anchor children)
                   {page content}
                 </Frame>
               </PolarisProvider>
             </EmbeddedShell>

        └─ billing/ route group
             <BillingLayout>             ← Polaris-only, no App Bridge
               <PolarisProvider>         ← @shopify/polaris AppProvider
                 {billing pages}
               </PolarisProvider>
             </BillingLayout>
    </Providers>
  </body>
</html>
```

> **Why no AppBridgeProvider?** In v3, `@shopify/app-bridge-react` exported a
> `Provider` that you wrapped around your app. In v4 the SDK moved to a CDN
> delivery model — the script self-initializes from the `<meta>` tag and
> exposes `window.shopify`. The React package still exists for hooks like
> `useAppBridge()` and components like `NavMenu`, but no wrapping `Provider`
> is needed or available.

---

## Route Structure

| Route                     | File                                    | Context         | Notes                                 |
|---------------------------|------------------------------------------|-----------------|---------------------------------------|
| `/`                       | `app/page.tsx`                           | Server          | Redirects to `/dashboard`             |
| `/dashboard`              | `app/(embedded)/dashboard/page.tsx`      | Embedded        | Main merchant view                    |
| `/plans`                  | `app/(embedded)/plans/page.tsx`          | Embedded        | Plan selection + subscribe            |
| `/subscription`           | `app/(embedded)/subscription/page.tsx`   | Embedded        | Manage current plan                   |
| `/orders`                 | `app/(embedded)/orders/page.tsx`         | Embedded        | Placeholder (Coming Soon)             |
| `/billing/return`         | `app/billing/return/page.tsx`            | **Standalone**  | Outside embedded group — no App Bridge at load time |

> `/billing/return` is intentionally outside the `(embedded)` group. After a billing confirmation redirect from Shopify, the `?host=` param may be absent. This page uses a standard Polaris layout and provides a manual link back to the admin.

---

## Embedded App Lifecycle

```
1. Merchant installs app via Shopify Partner → OAuth begins
2. Backend handles OAuth, creates/updates store record
3. Backend redirects to: https://app.aoatraders.com/?shop=xxx&host=BASE64
4. app/page.tsx → redirects to /dashboard?shop=xxx&host=BASE64
5. Browser loads app/layout.tsx — <meta name="shopify-api-key"> + CDN script in <head>
6. App Bridge v4 CDN script reads the <meta> tag → initializes window.shopify global
7. window.shopify communicates with Shopify Admin via postMessage (parent frame)
8. If session valid → app renders dashboard
9. If session invalid → App Bridge handles re-auth redirect automatically
10. All API calls call shopify.idToken() to get a fresh signed JWT for Authorization header
```

> **Note on `host` param**: In App Bridge v3, the `host` query param was required and
> had to be manually read + persisted in `sessionStorage` for SPA navigation. In v4,
> the `host` param is still appended by Shopify on install/redirect, but the App Bridge
> CDN script manages its own routing — you do not need to persist or forward it manually.

---

## Auth & Bootstrap Flow

### Current (App Bridge v4 session token auth):

```
Page Load
  → <meta name="shopify-api-key"> + CDN script initialize window.shopify
  → App Bridge exchanges session with Shopify Admin (parent frame)
  → lib/shopify/appBridge.ts calls shopify.idToken() → returns signed JWT
  → JWT sent to backend as Authorization: Bearer header
  → Backend validates JWT with Shopify's API (shopify.auth.verifySessionToken)
  → Backend returns merchant-specific data
```

> `shopify.idToken()` is the v4 replacement for `getSessionToken(app)` from v3.
> It returns a `Promise<string>` — no `app` instance argument needed.

### Future (WorkOS unified auth):

```
Page Load
  → WorkOS SDK checks for session (cookie-based or token-based)
  → If no WorkOS session → redirect to WorkOS AuthKit login
  → WorkOS calls back → backend validates WorkOS JWT
  → Backend checks if WorkOS user owns a Shopify store:
      SELECT * FROM shopify_stores WHERE owner_user_id = ?
  → If store found → issue merchant session
  → If no store → issue website-only user session
  → If user.role = 'admin' → expose admin panel routes
  → Frontend receives session context including { user, store?, role }
```

### WorkOS Integration Point in Frontend

The **only** file that needs significant changes for WorkOS integration is `lib/auth/session.ts`.

The `getCurrentUser()` function in that file will:
- Currently: return `null` (no-op stub)
- Future: call WorkOS SDK, validate session, return `SessionUser`

The `MerchantContext` (via `hooks/useMerchantContext.ts`) will be extended to merge:
- `shop` from Shopify (currently)
- `user` from WorkOS (future)

---

## Backend API Integration

### Base URL
```
NEXT_PUBLIC_API_BASE_URL=https://api.aoatraders.com
```

### Known Endpoints

| Method | Path                     | Notes                                              |
|--------|--------------------------|-----------------------------------------------------|
| `GET`  | `/dashboard`             | Returns shop info + sync health. **Assumed shape.** |
| `GET`  | `/subscription`          | Returns current subscription status.               |
| `GET`  | `/billing/plans`         | Returns available plans list.                      |
| `POST` | `/billing/subscribe`     | Body: `{ plan }`. Returns `{ confirmationUrl }`.   |
| `POST` | `/billing/cancel`        | Cancels current subscription.                      |

All requests include `Authorization: Bearer <shopify_session_token>` header.

### Open Backend Contracts

See [Open Backend Contracts](#open-backend-contracts) section below.

---

## State Management

| Layer              | Tool            | What it manages                            |
|--------------------|-----------------|---------------------------------------------|
| Server state       | React Query     | API data: dashboard, plans, subscription    |
| App-level context  | React Context   | Shop info, session flags (via MerchantContext) |
| Local UI state     | useState        | Modals, loading buttons, form inputs        |
| Session token      | App Bridge      | Shopify JWT — never stored manually         |

---

## WorkOS Integration Points

When the `feature/workos-auth` branch is ready, these are the exact integration points:

1. **`lib/auth/session.ts`** — Replace stub with WorkOS SDK calls
2. **`app/providers.tsx`** — Add WorkOS AuthKit Provider if needed
3. **`components/guards/`** — Add route guard components:
   - `RequireMerchant.tsx` — blocks non-merchant users
   - `RequireAdmin.tsx` — blocks non-admin users
4. **`hooks/useMerchantContext.ts`** — Extend context to include `user` from WorkOS
5. **`app/(embedded)/layout.tsx`** — Add `<RequireMerchant>` guard
6. **`types/merchant.ts`** — Add `WorkOSUser` type to `SessionUser`
7. **Backend** — `shopify_stores.owner_user_id` FK to WorkOS user ID

> This frontend branch does NOT implement WorkOS. It only prepares the architecture. Do not add WorkOS SDK until that branch.

---

## Open Backend Contracts

The following backend endpoints are **assumed** based on the project context. They must be confirmed and the stubs updated accordingly.

| Endpoint            | Assumption                                                        | Status       |
|---------------------|-------------------------------------------------------------------|--------------|
| `GET /dashboard`    | Returns `{ shop, syncHealth, subscription }` shape               | ⚠️ Assumed  |
| `GET /billing/plans`| Returns `Plan[]` with id, name, price, features                  | ⚠️ Assumed  |
| `GET /subscription` | Returns `SubscriptionInfo` with status, planId, billingOn        | ⚠️ Assumed  |
| `POST /billing/subscribe` | Body: `{ plan: string }`. Returns `{ confirmationUrl: string }` | ⚠️ Assumed |
| `POST /billing/cancel` | No body. Returns `{ success: boolean }`                        | ⚠️ Assumed  |

> All stubs are typed. When backend is confirmed, update the types and remove the stub comments.

---

## Security Model

| Concern                         | Approach                                                          |
|---------------------------------|-------------------------------------------------------------------|
| Session auth                    | Shopify session token (JWT) on every API request                  |
| Token storage                   | Never stored — fetched fresh from App Bridge per request          |
| Query param trust               | `shop` / `host` params never used for security decisions          |
| iframe security                 | CSP `frame-ancestors` allows only Shopify Admin origins           |
| X-Frame-Options                 | Not set — CSP `frame-ancestors` takes precedence                  |
| Expired session                 | App Bridge v4 handles re-auth automatically via CDN script        |
| CORS                            | Backend must allow `app.aoatraders.com` origin                    |
| Secrets                         | Only `NEXT_PUBLIC_SHOPIFY_API_KEY` is public (by Shopify design)  |
| Future WorkOS tokens            | Will be validated server-side — frontend receives session context |
