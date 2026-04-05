# Shopify App Store Review Requirements

> Reference document for Shopify app submission. Requirements captured from Shopify Partner Dashboard review checklist.
> Protected data access Q&A section to be completed — see bottom of this file.

---

## Review Requirements

These are what Shopify will review the submission on based on the app capabilities selected.

---

### Functionality

| Requirement | Notes / Status |
|---|---|
| Authenticate immediately after install | OAuth flow redirects merchant immediately on install |
| Have a user interface (UI) that merchants can interact with | |
| Implement Shopify Managed Pricing or the Shopify Billing API correctly | Using Billing API (Manual Pricing mode in Partner Dashboard) |
| Use Shopify Managed Pricing or the Shopify Billing API | ✅ Billing API implemented — feature/billing-plan-enforcement |
| Always build Payment Gateway apps using the Payments API and after obtaining authorization | N/A — not a payment gateway app |
| Build apps for Shopify POS only, not third-party systems | N/A |
| Build apps without critical errors to ensure review completion | |
| Build single-merchant storefronts. Marketplaces should be sales channels | N/A |
| Build web-based apps | ✅ Web-based FastAPI backend + frontend |
| Create unique apps | |
| Direct merchants to the Shopify Theme Store | N/A |
| Don't connect merchants to external agencies and developers | |
| Don't provide capital lending | |
| Duplicate only authorized product information | Product data is sourced from authorized distributors (ORS Nasco, Essendant, VDS) |
| Include functional test credentials | Need to prepare test store credentials for reviewer |
| Maintain the cheapest shipping option as default | |
| Obtain explicit buyer consent before adding charges | Billing subscription requires explicit plan selection by merchant |
| Offer browser extensions as optional features only | N/A |
| Process refunds only through the original payment processor | ✅ Stripe refunds go through original Stripe payment intent |
| Redirect to the app UI after installation | OAuth callback redirects to app UI |
| Submit as a regular app if not a Sales Channel | ✅ Regular app |
| Use a valid TLS/SSL certificate | ✅ `api.aoatraders.com` has valid TLS cert |
| Use only factual information | |
| Use session tokens for authentication | Store JWT used for all store-scoped endpoints |
| Use Shopify APIs | ✅ Shopify Admin API, Billing API, Webhooks |
| Use Shopify checkout | N/A — orders are captured via `orders/paid` webhook, not custom checkout |
| Admin extensions must be feature-complete | N/A — no admin extensions (embedded UI, not extension) |
| Allow pricing plan changes | ✅ `POST /billing/subscribe` allows upgrade/downgrade at any time |
| Build apps without even minor errors to ensure review completion | |
| Don't display promotions or advertisements in admin extensions | N/A |
| Initiate installation from a Shopify-owned surface | ✅ Install via Shopify Partner Dashboard / App Store link |
| Request `read_all_orders` access scope only if it provides necessary app functionality | `read_orders` scope used for `orders/paid` webhook — required for order capture feature |
| Request `read_checkout_extensions_chat` scope only when required | N/A — not requested |
| Request `write_checkout_extensions_apis` scope only if it provides necessary app functionality | N/A — not requested |
| Request `write_payment_mandate` scope only if it provides necessary app functionality | N/A — not requested |
| Require OAuth authentication immediately after reinstall | |
| Synchronize data accurately | ✅ Product sync via `shopify_variant_map`, inventory sync, price sync |
| Use correct subscription API scopes | |

---

### Product Sourcing

| Requirement | Notes / Status |
|---|---|
| Don't sell high risk products | Products sourced from licensed distributors (ORS Nasco, Essendant, VDS) — industrial/automotive parts |
| Use a PCI compliant payment gateway | ✅ Stripe (PCI DSS compliant) |
| Verify payment before marking orders as fulfilled | ✅ Order status set to `purchased` only after Stripe `payment_intent.succeeded` |
| Enable merchants to request fulfillment | |
| Include details of cost of goods sold | ✅ `merchant_cost` snapshotted on order capture from distributor price |

---

### Embedded

| Requirement | Notes / Status |
|---|---|
| Provide a consistent embedded experience | |
| Only launch Max modal with merchant interaction | |
| Use the latest version of Shopify App Bridge | |

---

### App Store Listing

| Requirement | Notes / Status |
|---|---|
| Include test credentials | Need to prepare — test store login details for reviewer |
| Include a demo screencast | Need to record |
| Indicate if the Online Store sales channel is required | |
| Provide accurate and complete pricing information | Need to document all plan tiers (Free, Starter, Growth, Pro) |
| Use accurate tags | |
| Write effective app card subtitles | |
| App name fields must be similar | |
| Don't include pricing information elsewhere in the listing | |
| Don't include reviews or testimonials in the listing | |
| Don't misuse Shopify brand in graphics | |
| Follow the guidelines for app details | |
| Indicate geographic requirements | US-only (distributors are US-based) |
| Must not have stats or data in listing | |
| Only claim to be published in languages that you fully supported | English only |

---

## Protected Data Access — Q&A

> Captured from Shopify Partner Dashboard — Data protection details form (April 5, 2026).
> Answers reflect current implementation (Phase 1–3 deployed). Notes flag items that need action.

---

### Step 1 — Data use reasons for Protected Customer Data

**Selected (✅):**
- ✅ **Store management** — "print order labels or track inventory" — we process orders to track fulfillment status and manage inventory with our distributors
- ✅ **App functionality** — "bill merchants or authenticate users" — order data is required for the app's core order capture and fulfillment workflow

**Not selected (correctly excluded):**
- ❌ Customer service — we do not respond to end-customer questions on behalf of merchants
- ❌ Analytics — we do not use customer data to measure app performance or report on customer behaviour
- ❌ Personalization — we do not show customers personalized product recommendations
- ❌ Marketing or advertising — we do not send marketing messages to customers

---

### Step 2 — Protected customer fields (optional)

**All 4 fields selected** with reasons: **Store management** + **App functionality**

| Field | Selected | Justification |
|---|---|---|
| **Name** (first/last name) | ✅ | Required to identify the customer when displaying orders to merchants in the admin order queue and store order history |
| **Email** (email field) | ✅ | Required for store management — merchant needs to see customer contact details on orders; also used to associate orders with accounts |
| **Phone** (default + billing phone) | ✅ | Required for store management — merchant may need contact details for order fulfilment or shipping queries |
| **Address** (shipping + billing address) | ✅ | Required for app functionality — shipping address will be transmitted to distributors (Essendant EDI 850 in Phase 4) to fulfil orders |

> **Note**: Since Name, Email and Phone are selected, ensure that `aoa_orders` stores these fields when captured from the `orders/paid` webhook — or be prepared to justify their selection during review if they are not actually stored. Consider adding `customer_name`, `customer_email`, `customer_phone` columns in Phase 4 migration.

---

### Step 3 — Data protection details

#### Purpose

| Question | Answer | Notes |
|---|---|---|
| Do you process the minimum personal data required to provide value to merchants? | **Yes** | ✅ Correct — we only capture order data from the `orders/paid` webhook; we do not request or store additional customer fields beyond what the order event contains |
| Do you tell merchants the personal data that you process and your purposes for processing it? | **Yes** | ⚠️ Requires a Privacy Policy that explicitly describes this — must be linked in the App Store listing and presented at install |
| Do you limit your use of personal data to that purpose? | **Yes** | ✅ Correct — order data is used exclusively for fulfillment tracking; not used for analytics, marketing, or any secondary purpose |

#### Consent

| Question | Answer | Notes |
|---|---|---|
| Do you have privacy and data protection agreements with your merchants? | **Yes** | ⚠️ Requires a Terms of Service + Privacy Policy that merchants accept. Must exist before submission. |
| Do you respect and apply customers' consent decisions? | **Yes** | ✅ Correct — we do not override customer consent; order data is only processed when a customer has completed a Shopify checkout |
| Do you respect and apply customers' decisions to opt-out of having their data sold? | **Yes** | ✅ Correct — we do not sell customer data to any third party |
| If you use personal data for automated decision-making and those decisions may have legal or significant effects, can customers opt-out? | **Not applicable** | ✅ Correct — we do not use customer data for automated profiling or decisions with legal/significant effects |

#### Storage

| Question | Answer | Notes |
|---|---|---|
| Do you have retention periods that make sure personal data isn't kept longer than needed? | **Yes** | ⚠️ Need to define and document a specific retention period (e.g. "order records retained for 7 years for accounting purposes, then purged") |
| Do you encrypt data at rest and in transit? | **Yes** | ✅ DigitalOcean PostgreSQL encrypted at rest; all API traffic over TLS (`api.aoatraders.com`) |
| Do you encrypt your data backups? | **Yes** | ✅ DigitalOcean managed database backups are encrypted |
| Do you separate test and production data? | **Yes** | ✅ Dev stores (e.g. `aoa-dev-combo`, `aoa-dev-paused`) are separate from production stores; separate `store_id` rows in DB |
| Do you have a data loss prevention strategy? | **Yes** | ⚠️ Should document: DigitalOcean automated daily backups + point-in-time recovery; describe restore process |

#### Access

| Question | Answer | Notes |
|---|---|---|
| Do you limit staff access to customers' personal data? | **Yes** | ✅ Server access restricted to SSH key authentication; only AOA team has access |
| Do you have strong password requirements for staff passwords? | **Yes** | ⚠️ SSH key-only access to server (no passwords). Admin API access via JWT. Ensure any team accounts (DigitalOcean, Stripe, Shopify Partner) have 2FA enabled. |
| Do you log access to personal data? | **Yes** | ✅ FastAPI access logs written to `/var/log/aoa-traders/` (all API requests logged with timestamp and endpoint) |
| Do you have a security incident response policy? | **Yes** | ⚠️ Should document a basic policy: detection → containment → merchant notification → post-mortem |

#### Audits and certifications

| Field | Answer | Notes |
|---|---|---|
| Third-party security audits or certifications | (empty) | ✅ Correct — no third-party audits to date. Leave blank. |

---

### Action items before submission

| Item | Priority | Status |
|---|---|---|
| Write Privacy Policy (explicitly describing what data is collected and why) | 🔴 Required | ⏳ |
| Write Terms of Service (merchants must accept at install) | 🔴 Required | ⏳ |
| Document data retention period | 🟡 Required | ⏳ |
| Document data loss prevention / backup restore process | 🟡 Required | ⏳ |
| Document security incident response policy | 🟡 Required | ⏳ |
| Ensure 2FA on all team accounts (DO, Stripe, Shopify Partner) | 🟡 Required | ⏳ |
| Add Address field selection to this form when Phase 4 (EDI 850) is built | 🔵 Phase 4 | ⏳ |

---

## Pre-Submission Checklist

- [ ] Test credentials prepared for reviewer (dev store login + walkthrough notes)
- [ ] Demo screencast recorded
- [ ] App Store listing copy written (subtitle, description, tags)
- [ ] Pricing page accurate (Free / Starter $29.99 / Growth $79.99 / Pro $199.99)
- [ ] Geographic restriction noted (US-only)
- [ ] Protected data justification answers submitted in Partner Dashboard
- [ ] Shopify Partner approval for `orders/paid` Protected Customer Data topic received
- [ ] Re-register `orders/paid` webhook for all existing stores post-approval
- [ ] TLS cert verified at `api.aoatraders.com`
- [ ] All review requirement rows above confirmed ✅

---

## Reference

- Shopify App Review requirements: https://shopify.dev/docs/apps/store/requirements
- Protected customer data: https://shopify.dev/docs/apps/store/data-protection/protected-customer-data
- Shopify Billing API docs: https://shopify.dev/docs/apps/billing
