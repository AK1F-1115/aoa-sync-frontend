# Frontend Instructions — AOA Sync Frontend

> **File:** `.github/frontend.instructions.md`
> **Purpose:** System enforcement file for AI assistants (GitHub Copilot, Claude) working in this repository.

---

## MANDATORY: Read These Files Before Writing Any Code

Every AI assistant working in this repository **MUST** read the following files before producing any code, suggestions, or architectural decisions:

| File                | Why It Must Be Read                                            |
|---------------------|----------------------------------------------------------------|
| `CLAUDE.md`         | Defines operating rules, quality standards, security rules, what NOT to do |
| `ARCHITECTURE.md`   | Defines the system architecture, folder structure, data flow, WorkOS integration plan |
| `RUNBOOK.md`        | Defines how to run the app, env vars, debugging, billing flow  |
| `TODO.md`           | Defines current tasks, upcoming tasks, and known blockers      |
| `TODOCOMPLETED.md`  | Defines what has already been built — do not re-implement or conflict with this |

---

## REQUIRED WORKFLOW FOR EVERY SESSION

```
STEP 1 → Read CLAUDE.md
STEP 2 → Read ARCHITECTURE.md
STEP 3 → Read TODO.md
STEP 4 → Read TODOCOMPLETED.md
STEP 5 → Identify what you need to do
STEP 6 → Check for conflicts with existing architecture
STEP 7 → Plan your change
STEP 8 → Implement incrementally
STEP 9 → Update TODO.md (mark done, add new tasks)
STEP 10 → Update TODOCOMPLETED.md (log what was done)
```

**Skipping any step is considered a failure mode.**

---

## Prohibited Behaviors

The following are **never acceptable** in this repository:

- Writing code before reading the context files
- Using Pages Router (`/pages`) — this is an App Router project
- Using `window.location.href` for embedded navigation
- Hardcoding backend URLs (`https://api.aoatraders.com`) — use `config.api.baseUrl`
- Writing raw `fetch()` calls in page or component files — use `lib/api/`
- Storing session tokens in `localStorage`
- Implementing WorkOS auth before the `feature/workos-auth` branch
- Creating monolithic components (> 200 lines is a warning sign)
- Leaving undocumented assumptions about backend behavior in code
- Skipping error handling

---

## Project Context

- **App:** AOA Sync — embedded Shopify app for product sync
- **Frontend:** `https://app.aoatraders.com`
- **Backend:** `https://api.aoatraders.com`
- **Stack:** Next.js 14 App Router · TypeScript · Shopify Polaris · App Bridge React · React Query
- **Branch:** `feature/shopify-frontend`
- **Future branch:** `feature/workos-auth` (do not implement WorkOS in this branch)

---

## Architecture Summary

- Route group `(embedded)/` wraps all pages inside App Bridge + Polaris context
- `components/EmbeddedShell.tsx` is the single source of App Bridge initialization
- `lib/api/client.ts` is the single source of authenticated API calls
- `lib/auth/session.ts` is the isolated auth stub (WorkOS will plug in here)
- `lib/config.ts` validates all env vars at startup
- `types/api.ts` and `types/merchant.ts` define all data contracts

---

## Documentation Maintenance

After every meaningful change:

1. Update `TODO.md` — mark tasks done, add newly discovered tasks
2. Update `TODOCOMPLETED.md` — log what was completed with notes
3. Update `ARCHITECTURE.md` if design changed
4. Update `RUNBOOK.md` if dev setup changed

> Documentation is not optional. It is part of the definition of done.
