# TODO.md — AOA Sync Frontend

> **Branch:** `feature/shopify-frontend`
> **Last Updated:** 2026-03-24

---

## Status Legend

- ✅ Completed → See `TODOCOMPLETED.md`
- 🔄 In Progress
- 🔲 Not Started
- 🚫 Blocked — needs resolution before work can begin
- 📝 Needs clarification

---

## Current Sprint: Foundation ← COMPLETE

> All foundation tasks are done. `npm run build` passes. TypeScript clean.
> Full details in `TODOCOMPLETED.md`.

### ✅ Project Setup
- [x] Initialize Next.js 15.5.14 App Router project
- [x] Configure `tsconfig.json` with path aliases
- [x] Configure `next.config.ts` with CSP headers for Shopify embedding
- [x] Add `.env.local.example` with all required variables
- [x] Add `.gitignore`
- [x] Install all dependencies: Polaris 13, App Bridge React v4, React Query v5, Zod

### ✅ Core App Structure
- [x] `app/layout.tsx` — Root HTML shell, App Bridge v4 `<meta>` + CDN `<script>`, Polaris CSS
- [x] `app/providers.tsx` — QueryClientProvider with retry policy, DevTools in dev
- [x] `app/page.tsx` — Root redirect to `/dashboard` (Next.js 15 async searchParams)
- [x] `app/globals.css` — Minimal reset compatible with Polaris

### ✅ Embedded Shell
- [x] `components/EmbeddedShell.tsx` — Polaris init, runtime API key guard, Suspense boundary
- [x] `components/NavMenu.tsx` — App Bridge v4 NavMenu with anchor tag children
- [x] `components/LoadingSpinner.tsx` — Full-page Polaris Spinner fallback
- [x] `components/ErrorBoundary.tsx` — React class-based error boundary with Polaris UI
- [x] `app/(embedded)/layout.tsx` — Embedded route group layout using EmbeddedShell

### ✅ Pages
- [x] `app/(embedded)/dashboard/page.tsx` — Shop info, sync health cards, current plan
- [x] `app/(embedded)/plans/page.tsx` — Plan selection + subscribe, confirmation modal
- [x] `app/(embedded)/subscription/page.tsx` — Current plan display, upgrade/cancel
- [x] `app/(embedded)/orders/page.tsx` — Coming Soon placeholder (Polaris EmptyState)
- [x] `app/billing/return/page.tsx` — Return handler for success/pending/failed states
- [x] `app/billing/layout.tsx` — Minimal Polaris-only wrapper for billing routes

### ✅ API Layer
- [x] `lib/config.ts` — Zod env validation, build-time empty-key allowance, runtime guard
- [x] `lib/api/client.ts` — Typed fetch wrapper, session token injection, ApiError class
- [x] `lib/api/dashboard.ts` — Dashboard endpoint (typed stub, shape assumed)
- [x] `lib/api/billing.ts` — Subscribe + cancel (typed stub)
- [x] `lib/api/subscription.ts` — Subscription status fetch (typed stub)
- [x] `lib/shopify/appBridge.ts` — App Bridge v4 utilities (`shopify.idToken()`)
- [x] `lib/auth/session.ts` — WorkOS-ready session abstraction stub

### ✅ Hooks & Types
- [x] `hooks/useMerchantContext.ts` — React Query hook for merchant + sync data
- [x] `hooks/useShop.ts` — Convenience hook for current shop context
- [x] `types/api.ts` — All API request/response types
- [x] `types/merchant.ts` — ShopInfo, SyncHealth, DashboardData types

### ✅ Verification
- [x] `npx tsc --noEmit` — exit 0, zero TypeScript errors
- [x] `npm run build` — passes, 9 routes pre-rendered, 0 vulnerabilities

---

## Next Sprint: Integration & Testing

### 🚫 Blockers

| # | Blocker | Impact |
|---|---------|--------|
| 1 | `NEXT_PUBLIC_SHOPIFY_API_KEY` not set in `.env.local` | App Bridge won't initialize; embedded session won't work |
| 2 | Backend endpoint shapes not confirmed | All 5 API calls are typed stubs — real data won't render |
| 3 | Backend CORS not verified for `app.aoatraders.com` | API calls may fail in production |
| 4 | ngrok / tunnel not configured | Can't test Shopify embedding locally without HTTPS |

### 🔲 Get API Key & Configure Environment

- [ ] Copy **Client ID** from [partners.shopify.com](https://partners.shopify.com) → your app → Configuration
- [ ] Create `.env.local` — `NEXT_PUBLIC_SHOPIFY_API_KEY=<client_id>`
- [ ] Add `NEXT_PUBLIC_API_BASE_URL=https://api.aoatraders.com` to `.env.local`
- [ ] Run `npm run dev` — verify app starts without console errors

### 🔲 Embedded Testing (requires API key + ngrok)

- [ ] Install and run ngrok: `ngrok http 3000`
- [ ] Set App URL in Partner Dashboard → your app → Configuration → App URL
- [ ] Install app on a Shopify development store
- [ ] Verify app loads inside Shopify Admin iframe (no `X-Frame-Options` errors)
- [ ] Verify `window.shopify` exists in browser console
- [ ] Verify `shopify.idToken()` returns a token (Network tab → Authorization header)
- [ ] Verify Shopify Admin sidebar shows 4 nav links (Dashboard, Plans, Subscription, Orders)
- [ ] Verify navigation between pages works without full reloads

### 🔲 Backend Contract Confirmation

- [ ] Confirm `GET /dashboard` — shape matches `DashboardData` in `types/merchant.ts`
- [ ] Confirm `GET /billing/plans` — response is `BillingPlan[]` matching `types/api.ts`
- [ ] Confirm `GET /subscription` — shape matches `SubscriptionInfo` in `types/api.ts`
- [ ] Confirm `POST /billing/subscribe` — body `{ plan: string }`, response `{ confirmationUrl: string }`
- [ ] Confirm `POST /billing/cancel` — no body, response `{ success: boolean }`
- [ ] Update type stubs and remove `@assumed` comments once confirmed
- [ ] Verify backend validates `Authorization: Bearer <token>` on all routes

### 🔲 Billing Flow End-to-End

- [ ] Trigger subscribe from `/plans` — confirm redirect to Shopify billing confirmation page
- [ ] Confirm Shopify billing approval → backend callback → redirect to `/billing/return?status=success`
- [ ] Verify `/billing/return` success state renders correctly
- [ ] Test pending state manually: `/billing/return?status=pending`
- [ ] Test failed state manually: `/billing/return?status=failed`
- [ ] Verify cancel from `/subscription` calls backend and refreshes data

### 🔲 Documentation Cleanup (post-confirmation)

- [ ] Update `ARCHITECTURE.md` Open Backend Contracts table — mark confirmed endpoints ✅
- [ ] Update `RUNBOOK.md` — add ngrok setup steps with tested commands
- [ ] Remove all `@assumed` comments from `lib/api/*.ts` once backend is confirmed

---

## Upcoming (Next-Next Sprint): WorkOS

> Do NOT start WorkOS work until embedded testing and backend confirmation are complete.

- [ ] Create `feature/workos-auth` branch
- [ ] Add WorkOS SDK to `package.json`
- [ ] Implement `lib/auth/session.ts` — replace stub with WorkOS SDK calls
- [ ] Add `components/guards/RequireMerchant.tsx`
- [ ] Add `components/guards/RequireAdmin.tsx`
- [ ] Add `WorkOSProvider` to `app/providers.tsx` if required
- [ ] Extend `hooks/useMerchantContext.ts` to include `user` from WorkOS
- [ ] Add merchant guard to `app/(embedded)/layout.tsx`
- [ ] Coordinate with backend: `shopify_stores.owner_user_id` FK to WorkOS user ID

---

## Open Questions

- [ ] Does `/dashboard` return `syncHealth` as a nested object or flat? (Assumed nested)
- [ ] Does `/billing/plans` exist as a backend endpoint, or should plans be hardcoded in frontend?
- [ ] What is the exact backend billing callback URL after Shopify billing approval?
- [ ] Will `/billing/return` ever need App Bridge context, or is standalone-Polaris permanently OK?
- [ ] Will the app support multiple Shopify stores per WorkOS user, or is it 1:1?

---

## Sprint: Dashboard — Product Search + Setup Guide

> **Goal:** Enhance the dashboard with a keyword product search engine (searches the full AOA available catalog) and a per-merchant onboarding setup guide checklist.
> No localStorage anywhere. All state is backend-persisted.

---

### Feature 1: Product Search

#### Overview
A prominent search box on the dashboard that lets merchants keyword-search the full AOA available product pool and browse results as cards — with watchlist toggle built in. This reuses the existing `/store/catalog?status=available&search=` endpoint which already searches the full AOA pool (not just pushed products).

---

#### 🔲 Frontend — `app/(embedded)/dashboard/page.tsx`

- [ ] **Search box** — large centered `TextField` with a "Search" `Button` (`connectedRight`). Wrapped in a native `<div onKeyDown>` for Enter key (Polaris TextField has no `onKeyDown` prop — learned from orders page fix). Placeholder: *"Search AOA's catalog — try 'wireless headphones', 'gym bag', 'kids toys'…"*
- [ ] **Results grid** — responsive CSS grid (3 columns desktop, 2 tablet, 1 mobile) of product cards. Each card:
  - Thumbnail image (fallback to a generic product icon)
  - Product name (truncated at 2 lines)
  - Brand name (subdued)
  - Price (AOA cost — so merchant can assess margin)
  - "View details" link → `/products/[sku]`
  - Watchlist toggle button — "Save" / "Saved ✓" — calls `useWatchlist().toggleWatchlist()` (already backend-persisted)
- [ ] **Search states:**
  - **Pre-search (idle)** — no grid, just a short blurb: *"Search the full AOA catalog to discover products to add to your store."*
  - **Loading** — skeleton card grid (6 skeleton cards, same grid layout)
  - **No results** — Polaris `EmptyState` with tip: *"Try a broader search term or browse by category in the Products tab."*
  - **Error** — Polaris `Banner` tone="critical" with retry button
- [ ] **Query config:**
  - `queryKey: ['catalogSearch', searchTerm]`
  - `queryFn`: `getCatalog({ status: 'available', search: term, page: 1, page_size: 12 })`
  - `enabled: searchTerm.trim().length > 0`
  - `staleTime: 2 * 60_000`
- [ ] **No pagination on dashboard** — show top 12 results only. If > 12 exist, show a "See all X results in Products →" link that navigates to `/products?tab=available&search=<term>`.

#### 🔲 Frontend — `lib/api/products.ts`

- [ ] No new function needed — `getCatalog({ status: 'available', search: term })` already works. Just call it from the dashboard.

#### 🔲 Frontend — `types/api.ts`

- [ ] No new types needed — `CatalogProduct` and `CatalogResponse` already cover the search results shape.

#### Backend — No new endpoints needed
> `GET /store/catalog?status=available&search=<term>&page=1&page_size=12` already exists and searches the full AOA pool. Confirm with backend that `status=available` truly searches all AOA products (not just store-scoped ones) — this is the only thing to verify.

---

### Feature 2: Setup Guide

#### Overview
A collapsible onboarding checklist card on the dashboard. 4 steps, each auto-detected from real data. Completion state (dismissed flag) stored per-merchant on the backend. The card disappears permanently once dismissed.

---

#### The 4 Steps

| # | Step title | Completion source | CTA if incomplete |
|---|-----------|-------------------|-------------------|
| 1 | **Choose a plan** | `subscription.status === 'active' \|\| === 'trial'` | Button → `/settings` |
| 2 | **Save products to your watchlist** | `wishlistCount > 0` from `GET /store/wishlist` (already loaded by `useWatchlist`) | Button → `/products?tab=available` |
| 3 | **Push products to your store** | `syncHealth.productsPushed > 0` (already in `useMerchantContext`) | Button → `/products` |
| 4 | **Set up your payment method** | `has_payment_method === true` from `GET /store/stripe/payment-method` (already used in settings) | Button → `/settings?tab=payment` |

> Steps 1 and 3 come from `useMerchantContext()` — zero new API calls.
> Step 2 comes from `useWatchlist()` — already fetched on the products page, shares the same React Query cache (`['wishlist']`).
> Step 4 reuses the `['stripePaymentMethod']` query — add it to the dashboard with `staleTime: 60_000`.

---

#### 🔲 Frontend — `app/(embedded)/dashboard/page.tsx`

- [ ] **SetupGuide component** — rendered above the search box and the Store/Sync cards
- [ ] **Progress bar** — Polaris `ProgressBar` showing completed steps / 4 (e.g. `value={75}` when 3/4 done)
- [ ] **Completion counter** — `Badge` in the card header: "3 of 4 complete"
- [ ] **Step rows** — each step is an `InlineStack` with:
  - Green filled circle icon (✓) if complete, grey hollow circle if not
  - Step title (bold) + one-line description
  - Action `Button` variant="plain" — only rendered when the step is **not** complete
- [ ] **Dismiss button** — small "✕ Dismiss" `Button` variant="plain" in the card top-right corner. On click: calls `POST /store/onboarding/dismiss` → on success hides the card permanently for this merchant.
- [ ] **Auto-hide** — if all 4 steps are complete AND `dismissed === true`, render nothing. If all 4 are complete but not dismissed, show a "You're all set! 🎉" success state with the dismiss button.
- [ ] **Query for dismissed state** — `useQuery({ queryKey: ['onboardingStatus'], queryFn: getOnboardingStatus })`. Returns `{ dismissed: boolean, completed_steps: string[] }`. If `dismissed === true`, render nothing immediately (no flash).

#### 🔲 Frontend — `lib/api/onboarding.ts` *(new file)*

- [ ] `getOnboardingStatus()` → `GET /store/onboarding/status` → `{ dismissed: boolean }`
- [ ] `dismissOnboarding()` → `POST /store/onboarding/dismiss` → `{ ok: true }`

#### 🔲 Frontend — `types/api.ts`

- [ ] Add `OnboardingStatus { dismissed: boolean }` interface

---

#### 🔴 Backend — New endpoints required

**`GET /store/onboarding/status`**
- Auth: Shopify JWT (same as all other `/store/` endpoints)
- Response: `{ "dismissed": false }`
- Implementation: Read `shopify_stores.onboarding_dismissed` boolean column (default `false`)

**`POST /store/onboarding/dismiss`**
- Auth: Shopify JWT
- Body: none
- Response: `{ "ok": true }`
- Implementation: Set `shopify_stores.onboarding_dismissed = true` for this store
- Idempotent — calling it twice is fine

**Database migration:**
```sql
ALTER TABLE shopify_stores
  ADD COLUMN onboarding_dismissed BOOLEAN NOT NULL DEFAULT FALSE;
```

---

### Implementation Order

1. **Backend:** DB migration + two onboarding endpoints (30 min, unblocks frontend)
2. **Frontend Step 1:** `lib/api/onboarding.ts` + type + `SetupGuide` component on dashboard
3. **Frontend Step 2:** Product search box + results grid on dashboard
4. **Commit + push both together**

---

