# CLAUDE.md — AI Operating Guide for AOA Sync Frontend

> **This file defines how AI assistants (Claude, GitHub Copilot) operate in this repo.**
> Read this file BEFORE writing ANY code. No exceptions.

---

## MANDATORY PRE-CODING CHECKLIST

Before writing ANY code, you MUST:

1. **Read `ARCHITECTURE.md`** — understand the system design and folder responsibilities
2. **Read `RUNBOOK.md`** — understand the dev environment and how to run the app
3. **Read `TODO.md`** — understand current tasks, next tasks, and known blockers
4. **Read `TODOCOMPLETED.md`** — understand what has already been built
5. Verify your planned change does not conflict with existing architecture
6. Plan your change before implementing it — do not improvise

> **FAILURE TO FOLLOW THIS CHECKLIST IS CONSIDERED A CRITICAL MISTAKE.**

---

## Code Quality Standards

- TypeScript everywhere. No `any` unless justified with a comment explaining why.
- All functions must have explicit return types.
- All API calls must go through the typed client in `lib/api/`.
- All components must be small and focused (< 150 lines preferred).
- All error states must be handled explicitly — never silently swallow errors.
- Prefer named exports over default exports where possible.
- Use `zod` for runtime validation of env vars and any external data crossing a trust boundary.
- No `console.log` in production code. Remove debug logs before commit.

---

## Security Rules

- **NEVER** expose secrets or API keys in client-side code or environment variables prefixed with `NEXT_PUBLIC_` unless they are genuinely public (e.g., Shopify API key is public by design).
- **NEVER** trust `?shop=`, `?host=`, or other query params directly for security decisions. These are Shopify-signed and the backend is the source of truth for auth.
- **ALL** API calls to the backend must include the Shopify session token in the `Authorization: Bearer` header.
- **DO NOT** store session tokens in `localStorage`. Use in-memory state or App Bridge utilities.
- **HTTPS everywhere.** Never allow non-HTTPS API calls in production.
- CSP headers must remain intact — see `next.config.ts` for `frame-ancestors` policy.
- Handle expired/invalid sessions gracefully: surface an error and let App Bridge's `forceRedirect` handle re-authentication.
- Design with OWASP frontend best practices in mind.

---

## Embedded Shopify App Constraints

- The app MUST work inside Shopify's iframe (Shopify Admin embedded context).
- `Content-Security-Policy: frame-ancestors` must allow `*.myshopify.com` and `admin.shopify.com`.
- `X-Frame-Options` must NOT block Shopify's iframe.
- App Bridge must be initialized with the `host` param from the URL before any navigation actions.
- The `host` param must be persisted to `sessionStorage` immediately on first load, for subsequent navigations where `?host=` may be absent.
- Navigation inside the embedded app MUST use Next.js `<Link>` or App Bridge actions — NOT `window.location.href`.
- `forceRedirect: true` in App Bridge config ensures re-authentication if the session expires.
- Do not render external links that would escape the Shopify Admin frame unexpectedly.

---

## Next.js App Router Rules

- **USE App Router ONLY.** Never add or restore Pages Router (`/pages` directory).
- Layouts (`layout.tsx`) **cannot** read `searchParams`. Use client components for URL-dependent logic.
- Client components that call `useSearchParams()` **MUST** be wrapped in `<Suspense>`.
- Route groups: `(embedded)/` for the App Bridge + Polaris context. Billing return at `billing/return/` sits outside the embedded group intentionally.
- Server components for static shells and layouts. Client components for interactive/data-fetching UI.
- Import Polaris CSS once in `app/layout.tsx` (server component).
- Use `'use client'` only where needed — do not mark server components as client.

---

## State Management Rules

- **React Query** for ALL server state. Do not use `useEffect` for data fetching without a strong reason.
- **React Context** for app-level shared state (shop info, session flags).
- No Redux, Zustand, or additional state libraries unless explicitly agreed on. Keep it simple.
- Component-local UI state with `useState`.

---

## API Integration Patterns

- All backend requests go through `lib/api/client.ts` — never write raw `fetch` in a page or component.
- All endpoints must have typed request/response interfaces in `types/api.ts`.
- The backend base URL comes from `config.api.baseUrl` (`NEXT_PUBLIC_API_BASE_URL`). Never hardcode URLs.
- If a backend contract is unclear or not yet built:
  - Create a typed stub function in the relevant `lib/api/*.ts` file
  - Mark it with a `// TODO(backend): ...` comment
  - Document the assumption in `ARCHITECTURE.md` under "Open Backend Contracts"
  - Add it to `TODO.md` as a blocker
  - **Never invent backend behavior silently.**

---

## Error Handling Expectations

| Error Type        | Expected Behavior                                                                      |
|-------------------|----------------------------------------------------------------------------------------|
| API error (4xx)   | Catch, display Polaris `Banner` with a user-friendly message. Log details.             |
| Auth error (401/403) | Surface to user. App Bridge `forceRedirect: true` handles re-auth automatically.    |
| Network error     | Show retry prompt using Polaris `Banner` with an action.                               |
| Unexpected crash  | `ErrorBoundary` wraps the app. Shows graceful fallback, not a blank screen.            |
| Missing config    | `lib/config.ts` validates env vars at startup. App crashes fast with a clear message.  |

---

## Future WorkOS Auth Integration

This branch **intentionally does not implement WorkOS** — but the architecture MUST support it.

Key rules:
- Auth-related code is **isolated** in `lib/auth/session.ts`. Keep it there.
- Route guard logic should live in `components/guards/` (scaffold the folder now, implement later).
- `MerchantContext` is designed to be extensible — it can receive a `user` object from WorkOS later.
- Do NOT assume Shopify is the only auth provider.
- Do NOT build user identity logic inside page components.
- See `ARCHITECTURE.md §WorkOS Integration Points` for the detailed plan.

---

## Documentation Update Rules

After **every meaningful code change**, you MUST:

1. Update `TODO.md` — mark completed tasks, add new tasks discovered during work
2. Update `TODOCOMPLETED.md` — log what was completed with a brief implementation note
3. Update `ARCHITECTURE.md` if any architectural decision changed
4. Update `RUNBOOK.md` if any dev setup step changed (new env var, new command, etc.)

> Documentation is not optional. Outdated docs are a form of technical debt.

---

## What NOT To Do

- Do NOT use Pages Router (`/pages` directory)
- Do NOT use `window.location.href` for embedded navigation — use App Bridge or Next.js `<Link>`
- Do NOT hardcode `https://api.aoatraders.com` in component code — use `config.api.baseUrl`
- Do NOT put business logic in page files — pages are thin shells, logic goes in hooks and lib
- Do NOT implement WorkOS auth prematurely — prepare the architecture, not the implementation
- Do NOT use `localStorage` for sensitive session data
- Do NOT create monolithic components (> 200 lines is a warning sign)
- Do NOT write untyped fetch calls in component files
- Do NOT proceed without reading the required docs first
- Do NOT skip error handling
- Do NOT add new npm packages without documenting why in the relevant file
- Do NOT leave `// TODO` comments without also adding the task to `TODO.md`
