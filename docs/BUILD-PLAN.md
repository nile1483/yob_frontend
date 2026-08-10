# YOB Frontend Build Plan

## How to use this plan

Do not ask Claude to implement every phase at once.
Complete one phase, verify it, create a Git checkpoint, then continue.

For every phase Claude should:

1. read the relevant existing files
2. state CONFIRMED / ASSUMPTIONS / OPEN items if needed
3. implement the smallest complete slice
4. add/update tests
5. run the required quality gate
6. fix failures
7. report changes and risks
8. stop at the requested phase

## Global quality gate

Unless a phase explicitly cannot use one of these yet, run:

```bash
npx ng test --no-watch --no-progress
npx ng build
```

After E2E is established, also run the relevant E2E flow for changed user journeys.

For UI changes, manually/automatically inspect at representative phone, tablet, laptop, and wide desktop sizes.

---

# Phase 0 - Baseline and project instructions

## Goal

Create a clean latest-Angular `yob-frontend`, integrate Tailwind, install Angular/Claude AI guidance, and preserve an untouched green baseline.

## Tasks

- create project with latest stable Angular CLI
- routing enabled
- strict TypeScript
- CSS global style mode
- no SSR initially
- add Tailwind using current Angular-supported setup
- run Angular AI config generator for Claude Code
- add root `CLAUDE.md`
- add this `/docs` and `/reference/api` material
- verify Git repository

## Do not do yet

- no commerce pages
- no large design library
- no NgRx
- no Angular Material theme
- no API client generation

## Acceptance

- project starts
- tests pass
- production build passes
- Claude can read project instructions/API reference

---

# Phase 1 - Verify the live YOB API contract

## Goal

Resolve source-document gaps before building network/session code around assumptions.

## Tasks

Using the existing local edge/Frappe environment, capture sanitized real responses for:

- login_with_password
- get_session_context
- get_config
- get_categories
- get_category
- get_item
- get_cart
- get_orders
- proceed_to_payment if the flow is currently testable
- one representative validation/not-found error

Verify:

- actual Frappe outer wrapper
- actual success/error body location
- HTTP status codes on errors
- session cookie behavior
- CSRF token location
- whether logout/mutations accept the expected token
- how the `application` parameter is expected to be used
- successful `get_item` shape
- actual checkout transition response

Update `docs/API-CONTRACT.md` and `docs/PROJECT-STATE.md` with verified facts.

## Acceptance

No core network/session type should depend on an invented field.

---

# Phase 2 - Network foundation and local proxy

## Goal

Create one clean, tested Frappe/YOB HTTP foundation that every domain can reuse.

## Structure

Approximately:

```text
src/app/foundation/network/
  yob-api-client.ts
  yob-api.types.ts
  yob-api-error.ts
  csrf.interceptor.ts
```

Names may be adjusted for clarity, but keep the responsibility compact.

## Tasks

- configure Angular development proxy so frontend code can use relative `/api`
- keep edge proxy responsible for `X-YOB-Original-Host`
- implement Frappe method URL helper
- unwrap verified outer `message`
- expose typed success data/meta/notice without losing information
- normalize errors while preserving code/detail/field/details
- add CSRF interceptor for mutating same-origin YOB requests when token exists
- provide environment-level technical values only where needed

## Tests

Using Angular HttpTestingController, cover:

- GET URL generation
- query parameters
- POST URL/body
- wrapper unwrapping
- meta/notice preservation
- error normalization
- CSRF header on eligible requests
- no invented CSRF header when token is absent
- external/non-YOB request is not modified unexpectedly

## Acceptance

A small test API call can be pointed at the live edge API without domain/page-specific Frappe handling.

---

# Phase 3 - Session/auth foundation

## Goal

Implement correct Frappe session lifecycle before building secure pages.

## Structure

Approximately:

```text
src/app/foundation/session/
  session.store.ts
  session-api.ts
  session.guard.ts
```

The sign-in UI will live later in the access domain.

## State

Represent at least:

```text
unknown/restoring
guest
authenticated
```

Store verified session context and CSRF token in memory.

## Tasks

- restore session using `get_session_context`
- login with password
- request OTP
- login with OTP
- logout
- clear in-memory session data correctly
- secure route guard
- preserve intended URL through sign-in where practical
- handle expired/invalid session consistently

## Security

- do not store `sid`
- do not add trusted edge host headers in browser code
- do not log passwords, OTPs, payment tokens, cookies, or CSRF tokens

## Tests

- session restore success
- session restore guest/failure
- password login success/failure
- logout
- CSRF token state update/clear
- guard allows authenticated
- guard redirects guest
- intended URL behavior

## Acceptance

Authentication works against live API and tests without page-level login checks.

---

# Phase 4 - Mock API foundation

## Goal

Allow full frontend development without the real API while keeping the same domain API code.

## Structure

Approximately:

```text
src/mock-api/
  mock-api.interceptor.ts
  handlers/
  scenarios/
```

Domain fixtures may stay close to their domain where that is clearer.

## Tasks

- technical environment flag for mock mode
- intercept the same `/api/method/...` paths
- return verified Frappe/YOB envelope
- support configurable response delay for development
- create session/auth mock behavior
- add baseline scenarios: normal, empty, unauthorized, not-found, server-error

Do not build a second set of page/data services for mock mode.

## Tests

- mock route matching
- same API method works mock vs normal provider wiring
- mock errors use expected status/envelope

## Acceptance

Switching mock mode does not change page/domain code.

---

# Phase 5 - Shells, route branches, responsive foundation

## Goal

Create flexible source-editable layouts inspired by the useful Fuse shell separation, without a layout configuration engine.

## Structure

```text
src/app/shells/
  public/
  secure/
```

## Tasks

- public shell with minimal header/content structure
- secure shell with reusable header/navigation/account/cart/footer pieces as needed
- router outlet placement
- mobile-first responsive behavior
- secure route branch protected by guard
- public route branch unguarded
- 404/not-found

Do not create many demo layout variants.
Do not create `navigationPosition`/`headerVariant` configuration.
The copied client project can edit shell HTML directly.

## Tests

- routing branch tests
- secure redirect
- basic shell rendering
- responsive smoke review

## Acceptance

It is easy to move navigation above/below/aside by editing the secure shell composition without changing domain pages.

---

# Phase 6 - Minimum design foundation

## Goal

Create only the generic UI building blocks needed for sign-in and catalog.

## Initial candidates

- button
- input
- alert
- spinner/loading indicator
- skeleton
- card
- dialog/drawer only if already needed

Tailwind owns styling.

## Rules

- no business/API knowledge in `design/`
- accessible keyboard/focus behavior
- no giant all-purpose design component
- do not build a full component catalog before real needs exist

## Tests

Behavioral tests for interactive design items.

## Acceptance

Sign-in/catalog can reuse generic UI without duplicated complex control behavior.

---

# Phase 7 - Access domain (public sign-in/OTP)

## Goal

Build the first real user-facing vertical slice.

## Structure

```text
src/app/domains/access/
  pages/
  parts/       # only if actually needed
  access.routes.ts
```

Network/session mechanics remain in `foundation/session`.

## Tasks

- password sign-in page
- OTP request/login flow if required immediately
- validation
- loading/disabled states
- API error display using normalized YOB errors
- redirect back to intended secure route

## Tests

- form behavior
- server error behavior
- successful navigation
- keyboard/accessibility basics
- session integration

## E2E milestone

Introduce Playwright around this phase or immediately after it.

First flow:

```text
open secure route
-> redirected to login
-> login
-> return to intended secure route
-> logout
-> secure route unavailable
```

---

# Phase 8 - Store context and localization basics

## Goal

Load/apply store-wide data actually provided by the API without turning it into a design config engine.

## Tasks

- typed `get_config` API file
- expose store name/logo/default currency/company where screens actually need them
- set project locale behavior
- use locale-aware date/number/currency formatting
- establish translation/localization workflow with no runtime language switch

Remember: `get_config` is authenticated in the current source contract.
Public sign-in cannot depend on it unless the backend contract changes.

## Tests

- config response typing/handling
- fallback behavior for optional logo/terms/privacy values where relevant

---

# Phase 9 - Catalog vertical slice

## Goal

Build the reference domain that future AI work should copy.

## Structure

```text
src/app/domains/catalog/
  pages/
  parts/
  state/
  data/
  fixtures/
  catalog.routes.ts
```

Add `contracts/` only if it solves a real type boundary.

## Tasks

- category navigation/listing
- category detail with subcategories/items
- item detail from verified successful response
- quantity-aware server pricing refresh where UX needs it
- reusable item card part
- responsive item grid
- loading/empty/error/not-found states
- NgOptimizedImage where suitable

## Business rule

Server API is authoritative for:

- base price
- discounts
- pricing rules
- tax
- totals

Do not replicate these calculations in Angular.

## Tests

- API query params, especially slug/qty/parent_slug
- page states
- item card behavior
- quantity pricing refresh
- not-found code handling
- mock/live contract compatibility

## E2E

```text
login
-> catalog
-> category
-> item detail
```

## Acceptance

Catalog becomes the gold-standard example for future domain structure.

---

# Phase 10 - Cart domain

## Goal

Implement cart using backend-returned state as the source of truth.

## Tasks

- cart signal store
- get cart
- add item
- remove item
- clear cart
- apply/remove coupon
- quantity changes according to the actual backend contract (if quantity-update API is not currently documented, do not invent one; clarify/extend backend contract)
- totals/display
- empty/loading/error states
- surface server reconciliation when price_updated_items or removed_items are returned

Important: the current collection documents add/remove but does not separately document a set/update quantity endpoint beyond add_to_cart qty behavior. Verify intended behavior before implementing arbitrary quantity-update semantics.

## Tests

- each documented cart API
- CSRF
- authoritative response replacement
- reconciliation notifications
- coupon errors

## E2E

```text
catalog/item
-> add to cart
-> cart
-> remove/clear/coupon as supported
```

---

# Phase 11 - Reusable widgets driven by real reuse

## Goal

Introduce `widgets/` only for functionality now needed in multiple places.

Likely candidates as checkout/account grows:

- address picker
- contact picker
- country select
- customer search later when a customer search endpoint exists
- item search later when a suitable API exists

## Rule

Do not create placeholder widgets because the architecture mentions them.
Promote functionality when at least two real consumers benefit.

## Tests

Each API-backed widget owns tests for search/loading/error/selection and should reuse generic design controls.

---

# Phase 12 - Account/address/contact

## Goal

Implement documented account-related list/read behavior and only verified write forms.

## Tasks

- addresses list
- contacts list
- contact-for-customer if needed by UX
- reusable address/contact selectors if checkout also needs them
- delete operations
- add/update forms only after real request body contracts are obtained

Do not infer missing add/update request fields from Frappe conventions.

## Tests

- list/load/error
- delete/CSRF
- form request bodies only after verified

---

# Phase 13 - Checkout and authenticated payment selection

## Goal

Connect cart, addresses/contacts, payment methods, and `proceed_to_payment` using verified server behavior.

## Tasks

- select shipping/billing/contact using documented cart endpoints
- authenticated payment-method lookup
- checkout validation based on server response/business rules
- proceed_to_payment
- transition to token-based public payment flow using verified response

Angular should not invent order/tax/payment eligibility rules that belong to Frappe/YOB.

## Tests

- address/contact setters
- payment-method queries
- checkout failure handling
- proceed-to-payment result handling

---

# Phase 14 - Public payment domain

## Goal

Implement the token-based payment flow that the OpenAPI explicitly marks public.

## Tasks

- get checkout data by token
- payment method processing
- payment verification
- invalid/expired token behavior
- success/failure terminal states

Security:

- do not log payment tokens/signatures
- do not verify Razorpay signatures client-side
- backend verify_payment remains authoritative

## E2E

Use mock payment scenarios for repeatable browser tests.
Do not automate real payment charges in ordinary test suites.

---

# Phase 15 - Orders

## Goal

Build order list and detail.

## Tasks

- order list
- order detail after successful response shape is verified
- loading/empty/error/not-found states
- locale-aware dates/currency

## Tests

- API calls
- order_not_found handling
- responsive list/detail

---

# Phase 16 - Public content/legal pages

## Goal

Provide login-adjacent public/static content without unnecessary CMS complexity.

Because the current API collection does not include public page-content endpoints, start with local/static Angular content/routes unless additional API contracts are provided.

If later the backend exposes content endpoints, integrate them as a normal domain data source.

---

# Phase 17 - Professional hardening

## Goal

Turn the working vertical application into a production-ready master.

Review:

- accessibility / AXE / WCAG AA
- responsive layouts
- keyboard navigation
- focus management
- loading/error/empty states
- image performance
- route lazy loading
- duplicate requests
- search debouncing/cancellation
- secure logging
- no secrets/tokens in console
- unauthorized/expired session flow
- server error correlation ID presentation/logging strategy if present
- build size warnings
- browser support required by business

Add lint/format tooling if not already established and keep the commands in CLAUDE.md.

---

# Phase 18 - Master reuse cleanup

## Goal

Make the repository easy to copy for the next client.

## Review

- remove demo-only dead code
- ensure no client names are baked into reusable architecture
- make logos/assets easy to replace
- document where shell HTML is changed
- document where global Tailwind/CSS is changed
- document how to add/remove a domain route/navigation item
- ensure reusable widgets have clear examples/tests
- verify mock mode works without backend
- verify real mode works with backend

Do NOT create a runtime client/tenant configuration system during cleanup.

---

# Phase 19 - Full regression

Run:

```bash
npx ng test --no-watch --no-progress
npx ng build
```

Run complete E2E suite.

Manually inspect primary responsive journeys:

```text
login
catalog/category/item
cart
checkout
payment token flow
account/address/contact
orders
```

Only after this should `yob-frontend` be treated as the reusable master baseline.
