# TODOCOMPLETED.md — AOA Sync Frontend

> **Branch:** `feature/shopify-frontend`
> Append to this file in chronological order. Never delete entries.

---

## 2026-03-24 — Session 1: Foundation & Documentation

### ✅ Repo Audit
- Workspace was empty — clean slate confirmed
- No conflicting patterns to resolve
- Architecture planned from scratch

### ✅ Documentation System Created
All 6 required documentation files created:

- **`CLAUDE.md`** — AI operating rules, code quality standards, security rules, embedded Shopify constraints, App Router patterns, WorkOS prep rules, documentation update rules, and explicit "what not to do" list.

- **`ARCHITECTURE.md`** — Full system architecture including: folder structure, file responsibilities, provider hierarchy, route structure, embedded app lifecycle, auth/bootstrap flow, backend API integration, state management, WorkOS integration points, open backend contracts, and security model.

- **`RUNBOOK.md`** — Developer operations guide including: install + run steps, all environment variables, running locally with Shopify embedding (ngrok + CLI options), debugging guide for 5 common failure modes, billing flow testing walkthrough, frontend↔backend connection details, and WorkOS future integration steps.

- **`TODO.md`** — Full structured task tracker with: current sprint tasks broken into logical groups, upcoming next sprint tasks, explicit blockers table, and open questions.

- **`TODOCOMPLETED.md`** — This file. Chronological completion log.

- **`.github/frontend.instructions.md`** — GitHub Copilot/AI system enforcement file that mandates reading all docs before coding.

**Notes:**
- Documentation is production-grade and accurate to the implementation plan
- WorkOS integration is explicitly planned without being prematurely implemented
- Backend contract assumptions are documented as assumed (⚠️) in ARCHITECTURE.md

---

## 2026-03-24 — Session 1: Project Scaffolding

### ✅ Project Config Files
- `package.json` — Next.js 14, React 18, Polaris, App Bridge React, React Query, Zod
- `tsconfig.json` — Strict mode, path aliases (`@/*`), App Router compatible
- `next.config.ts` — CSP `frame-ancestors` for Shopify embedding, security headers
- `.env.local.example` — All required env vars documented
- `.gitignore` — Standard Next.js ignore patterns

### ✅ Core App Structure
- `app/layout.tsx` — Root HTML shell, Polaris CSS import, Providers wrapper
- `app/providers.tsx` — QueryClientProvider with retry policy, DevTools in dev
- `app/page.tsx` — Root redirect to `/dashboard` preserving query params
- `app/globals.css` — Minimal reset compatible with Polaris

### ✅ Embedded Shell
- `components/EmbeddedShell.tsx` — App Bridge + Polaris init, `host` persistence, Suspense boundary
- `components/NavMenu.tsx` — App Bridge NavigationMenu for Shopify Admin sidebar
- `components/LoadingSpinner.tsx` — Full-page Polaris Spinner fallback
- `components/ErrorBoundary.tsx` — React class-based error boundary with Polaris UI
- `app/(embedded)/layout.tsx` — Embedded route group layout using EmbeddedShell

### ✅ All Pages
- `app/(embedded)/dashboard/page.tsx` — Shop info, sync health cards, current plan, error/loading states
- `app/(embedded)/plans/page.tsx` — Plan cards, subscribe action, confirmation modal
- `app/(embedded)/subscription/page.tsx` — Current plan display, upgrade/cancel actions
- `app/(embedded)/orders/page.tsx` — Coming Soon placeholder with Polaris EmptyState
- `app/billing/return/page.tsx` — Billing return handler for success/pending/failed states

### ✅ API Layer
- `lib/config.ts` — Zod env validation, fails fast on missing config
- `lib/api/client.ts` — Typed fetch wrapper, session token injection, ApiError class
- `lib/api/dashboard.ts` — Dashboard data fetch (typed stub with assumed shape)
- `lib/api/billing.ts` — Subscribe + cancel (typed stub)
- `lib/api/subscription.ts` — Subscription status fetch (typed stub)
- `lib/shopify/appBridge.ts` — Session token utility, host persistence helpers
- `lib/auth/session.ts` — WorkOS-ready session abstraction stub

### ✅ Hooks & Types
- `hooks/useMerchantContext.ts` — React Query hook for merchant + sync data
- `hooks/useShop.ts` — Convenience hook for current shop context
- `types/api.ts` — All API request/response types (BillingPlan, SubscriptionInfo, etc.)
- `types/merchant.ts` — ShopInfo, SyncHealth, DashboardData types

---

## 2026-03-24 — Session 1 Continued: App Bridge v4 Discovery & Build Fixes

### ✅ App Bridge v4 Breaking Changes Resolved

**Problem discovered:** `@shopify/app-bridge-react@^4.2.10` is architecturally different from v3.

**v3 pattern (incorrect — removed):**
- React `<AppBridgeProvider>` wrapper component was required
- `getSessionToken(app)` needed an `app` instance argument passed everywhere
- `host` from URL had to be manually read and stored in `sessionStorage`
- `NavMenu` used `navigationLinks` prop with plain objects
- `forceRedirect: true` passed to Provider

**v4 pattern (implemented):**
- No React `Provider` component — App Bridge is initialized via `<meta>` + CDN `<script>` in `<head>`
- `window.shopify` global is auto-initialized by the CDN script reading the `<meta>` tag
- Session token via `shopify.idToken()` — no `app` instance needed anywhere
- `NavMenu` uses anchor tag children: `<a href="/dashboard" rel="home">Dashboard</a>`
- Re-auth handled automatically by the CDN script — no `forceRedirect` config needed

**Files rewritten for v4:**
- `app/layout.tsx` — added `<meta name="shopify-api-key">` and CDN `<script>` to `<head>`
- `lib/shopify/appBridge.ts` — replaced `getSessionToken(app)` with `shopify.idToken()`
- `lib/api/client.ts` — removed `app` parameter from `apiFetch()`; calls `getSessionToken()` directly
- `components/EmbeddedShell.tsx` — removed `<AppBridgeProvider>` entirely; Polaris-only wrappers remain
- `components/NavMenu.tsx` — rewritten with anchor tag children pattern
- `hooks/useMerchantContext.ts` — removed `app` dependency
- All page files — removed any `app` prop passing

### ✅ Next.js 15 Async searchParams Fix

**Problem:** Next.js 15 changed `searchParams` in server components from a plain object to a `Promise`.

**Fix applied:** `app/page.tsx` — changed to `async` server component, added `await searchParams`.

```tsx
// Before (would throw in Next.js 15):
export default function RootPage({ searchParams }: { searchParams: SearchParams }) {

// After (correct):
export default async function RootPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
```

### ✅ config.ts — Build-Time Empty API Key Fix

**Problem:** Original `lib/config.ts` used `.min(1)` on `NEXT_PUBLIC_SHOPIFY_API_KEY`, causing `npm run build` to throw even when the key is legitimately absent during CI/build.

**Root cause:** `app/layout.tsx` imports `lib/config.ts` as a server component. Next.js executes server components during the "Collecting page data" build phase with no `.env.local`. The Zod `.min(1)` validator threw, killing the build.

**Fix:** Changed to `.default('')` — the key is allowed to be an empty string at build time. A `useEffect` runtime guard in `EmbeddedShell` logs `console.error` if the key is empty in the browser where it actually matters.

**Principle:** Build-time validation should only fail on values that are structurally wrong (bad URL format, wrong enum). Missing-but-optional-at-build-time values should be caught at runtime.

### ✅ app/billing/layout.tsx — New File

**Problem:** `/billing/return` is outside the `(embedded)` route group and therefore outside `EmbeddedShell`'s Polaris `AppProvider`. All Polaris components throw `MissingAppProviderError` without it. This caused `npm run build` to fail during prerendering of `/billing/return`.

**Fix:** Created `app/billing/layout.tsx` — a minimal `'use client'` layout that wraps all `/billing/*` routes in a bare `<PolarisProvider>`. No `Frame`, no `NavMenu`, no App Bridge.

**Why this is correct architecture:** The billing return page intentionally has no App Bridge because `?host=` may be absent after a Shopify billing redirect. It only needs Polaris for styling.

### ✅ Build Verification — Final Result

```
✓ Compiled successfully
✓ Linting and checking validity of types
✓ Generating static pages (9/9)
✓ Collecting build traces
✓ Finalizing page optimization

Route (app)            Size    First Load JS
/ (Dynamic)            123 B   102 kB
/_not-found            994 B   103 kB
/billing/return        4.48 kB 144 kB
/dashboard             2.55 kB 167 kB
/orders                1.37 kB 141 kB
/plans                 1.68 kB 176 kB
/subscription          1.75 kB 176 kB
```

- **0 security vulnerabilities**
- **0 TypeScript errors** (`npx tsc --noEmit` exit 0)
- **0 build errors**
- **Next.js version:** 15.5.14 (security-patched backport, zero CVEs)

### ✅ ARCHITECTURE.md — Updated for App Bridge v4

Updated sections:
- Header metadata: Next.js 14 → 15.5.14, App Bridge v4 noted explicitly
- Folder structure: added `app/billing/layout.tsx`
- File Responsibilities: `EmbeddedShell` rewritten for v4; new `app/billing/layout.tsx` entry; `lib/config.ts` build-time note added
- Provider Hierarchy: completely rewritten — shows `<meta>` + CDN script pattern, explains why no AppBridgeProvider
- Embedded App Lifecycle: steps 5–10 updated for v4 (no sessionStorage, `shopify.idToken()`)
- Auth & Bootstrap Flow: "Current" section updated; `shopify.idToken()` vs `getSessionToken(app)` documented
- Security Model: `forceRedirect: true` replaced with v4 CDN-script re-auth note

### ✅ TODO.md — Fully Refreshed

- Foundation sprint tasks: all marked complete
- Next sprint: blockers table, embedded testing steps, backend confirmation checklist, billing flow steps
- WorkOS sprint: scaffolded as future work (do not start until embedded testing passes)
- Open questions: consolidated and deduplicated

