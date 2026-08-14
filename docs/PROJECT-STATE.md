# YOB Frontend Project State

Use this file to keep assumptions visible without turning normal development into heavy documentation.
Update it only for durable project-level facts or important unresolved contract issues.

## CONFIRMED - Product/Architecture

- Project name is `yob-frontend`.
- It is one reusable Angular master application.
- A new client normally starts by copying the master project and directly modifying that copy.
- There is no runtime multi-tenant switching requirement.
- There is no need for different tenant build profiles in the master.
- The architecture should remain simple, developer-friendly, AI-friendly, reusable, scalable, responsive, and directly overridable.
- Visual/layout customization should usually be done directly in HTML/Tailwind/CSS.
- Do not create unnecessary show/hide/layout/theme configuration.
- Technical/global configuration is acceptable when truly required, for example environment/API/mock/locale values.
- Most storefront areas are authenticated/private.
- Public areas include sign-in and some static/legal pages.
- The API also defines a public token-based payment flow.
- There is no runtime language switch requirement.
- The application should be localization-ready and use one project language/locale per copied client.
- The same YOB/Frappe API contract is expected across copied client projects.
- Mock API development is required and should be replaceable by the real API without page/domain rewrites.
- Reusable generic visual UI belongs in `design/`.
- Reusable functional UI belongs in `widgets/`.
- Business areas belong in `domains/`.
- Routed views are called `pages` in our architecture.
- Domain-specific reusable UI is called `parts`.
- Angular framework classes can still technically be components/services; the architecture vocabulary avoids using `components` as a generic business folder name.

## CONFIRMED - Order contract synchronization (Phase 14.6, 2026-08-14)

Backend Phase 14.5 fixed the historical-data defect Phase 14 uncovered. This phase
synchronised the frontend to it. **Verified on the wire against the running backend**,
which is the authority here - the packaged handoff in `docs/api-handoff/` predates the
change and does not describe these endpoints.

### The two address models, which must not be confused

| | Historical orders | Live cart & checkout |
| --- | --- | --- |
| Source | the Sales Order's **order-time snapshot** | the **current** Address master |
| Shape | plain-text `*_address_display` | structured `AddressDto` objects |
| Endpoint | `order.get_order_details` | `address.get_addresses` |
| Editable? | never - it is a record of what was true | yes, it is the customer's live data |

An order shows what was true when it was placed. Editing an address today changes the
customer's master record and every future order; it does **not** rewrite the past. The
frontend never resolves the Address master to build an order, and a test asserts no
`get_addresses` / `get_contacts` / `/api/resource/Address` call is made from either
order page - confirmed in a real browser too.

### Contract changes adopted

```text
removed   billing_address  / shipping_address   (structured objects, resolved live)
added     billing_address_display / shipping_address_display   (string | null)
added     currency   on every get_orders row
retained  billing_address_name / shipping_address_name   (identifiers only)
```

- `*_address_display` is **plain text with real newlines - not HTML.** The backend
  converts the snapshot before sending it. The frontend interpolates it into an
  `<address>` and lets `white-space: pre-line` show the breaks: there is no
  `[innerHTML]`, no sanitizer and no markup parsing anywhere in the orders domain. Not
  caution about this payload - an order page has no reason to own an HTML rendering
  path, and one added "just in case" is one that can be reached later. A fixture whose
  address text *looks* like markup proves it renders as characters.
- `*_address_name` are **identifiers**. They are not passed to the address component at
  all, so a record name can never appear where a postal address belongs, and cannot be
  used to fetch current data.
- A `null` display shows the unavailable treatment. Shipping is keyed on the snapshot
  rather than the reference, so an order with a shipping link but no recorded address
  renders no shipping section instead of an empty one.
- **The environment-currency fallback is gone.** Each row formats from its own
  `currency`. On a financial record a plausible-looking wrong currency is worse than an
  unformatted number, and a mock row in USD proves the value is read per row.

### Verification

525 unit and 657 Playwright tests pass. Two mutations confirm the guarantees bite:
rendering the snapshot via `[innerHTML]` fails a test, and hardcoding the currency
fails two. Read-only against the real bench at two viewports - 22 checks - covering the
real snapshot text, preserved line breaks, absence of `<br>`, backend currency on list
and detail, the paid order, and no Address master call.

## CONFIRMED - Buyer orders (Phase 14, 2026-08-13)

The authoritative handoff (`docs/api-handoff/`) covers these two endpoints only in the
authorization matrix and the error tables - it carries **no response shapes** for them.
So this contract is source-verified from `yob_storefront/api/order.py` and wire-verified
against the bench's three real Sales Orders, two of which were paid by real Razorpay
Test Mode transactions.

### The contract

| | `get_orders` | `get_order_details` |
| --- | --- | --- |
| Method | GET, authenticated | GET, authenticated |
| Parameters | **none at all** | `order_id` |
| Returns | five fields per row | the full order |
| Ordering | `creation desc`, fixed | - |

`get_orders` has **no pagination, filters, sorting or search**, and its rows carry
`name`, `status`, `grand_total`, `transaction_date`, `delivery_date` - no currency and
no payment data. No such controls are offered in the UI, because the endpoint cannot
honour them.

`order_id` is the Sales Order **`name`** (`SAL-ORD-2026-00001`). There is no separate
display order number, so the identifier and the thing a buyer quotes are the same
string, and nothing is translated between them.

### What a buyer-visible Order is - and why "Draft" is never shown

`get_orders` filters on `customer` **only**. There is no `docstatus` filter, so Draft,
Submitted and Cancelled Sales Orders are all returned.

Every order on the development bench is `status: "Draft"`, **including two paid in full
by real Razorpay transactions**. The payment flow commits orders at `docstatus = 0`, so
ERPNext calls them Draft - an internal submit state, not a buyer-meaningful one.
Rendering it would tell someone who has just been charged that their order was never
placed.

So the ERPNext vocabulary is **mapped, never echoed**. `orders.status.ts` maps the
closed nine-value Select (Draft, On Hold, To Pay, To Deliver and Bill, To Bill, To
Deliver, Completed, Cancelled, Closed) to buyer wording, with `Draft -> "Order
received"`. `docstatus` is never returned by either endpoint, so there is nothing
numeric to leak.

### Payment status

There is **no order-level payment field**. The only signal is `payment_logs[]` - rows
from Razorpay Payment Log whose `payment_status` is a free-text field written straight
from `payment.status`, i.e. raw provider vocabulary.

- A log the provider reported as `captured` means paid. Only that value counts: logs
  exist for failed attempts too, so "a payment id exists" is not "it was paid".
- **No logs at all** means not paid through the provider - the unpaid, abandoned or Pay
  Later case. One real bench order is in exactly this state.

Failed and pending attempts are not surfaced; they are provider retry noise a buyer
cannot act on.

### Security

Ownership is the backend's: `get_order_details` checks
`exists("Sales Order", {name, customer})` **before** loading, so an unknown order and
another customer's answer identically with `404 order_not_found`. The frontend renders
one state for both - it cannot tell them apart, and wording that distinguished them
would hand back what the backend withheld. A refusal is a business error and never
clears `SessionStore` (Phase 9.5 semantics). Frappe's generic `/api/resource/Sales
Order` is never called; a test pins that.

### State and routes

Page-local `rxResource`, no store - both pages are read-only and route-derived, the
Catalog reasoning. Routes `/orders` and `/orders/:orderId` inside the secure branch,
with an Orders entry in the primary navigation. Rows are real `<a>` elements, not
clickable divs.

### API gaps (frontend limitations, not defects to fix here)

1. ~~**The list returns no `currency`**~~ - **CLOSED by backend Phase 14.5.** Every row
   now carries `currency` and the frontend fallback was removed in Phase 14.6.
2. **The list returns no payment information**, so payment state appears only on the
   detail page.
3. `contact_email` and `contact_mobile` were **null on every real order** despite
   `contact_person` being set. The contact block renders only what is present and
   disappears when nothing is.
4. Order lines expose **no slug**, and `item_code` is the item name, so item names
   render as plain text. Building a catalog route from a display string would be a
   guess.
5. ~~The backend resolves addresses from the **current** Address master~~ - **CLOSED by
   backend Phase 14.5**, which was raised from this finding. Orders now project the
   Sales Order's immutable order-time snapshot; see the Phase 14.6 entry above.

### Verification

Read-only against the real bench: the list, a Razorpay-settled order's detail, real
amounts, and the billing/shipping/contact projection, at 390 and 1440 - 28 checks, no
writes, no new provider artifacts. Mock fixtures are fictitious and deliberately do
**not** copy the bench's real payment ids.

## CONFIRMED - Backend contract synchronization (Phase 13.5, 2026-08-13)

**The authoritative contract is now `docs/api-handoff/`**, unpacked from the backend
team's handoff and generated from the running backend after the payment work. The
frontend's own `reference/api/` package is **superseded** and kept only for history;
its README says so. There is one authority, not two.

### The correction that mattered

**`add_to_cart`'s `qty` is a DELTA, not an absolute quantity.**

```text
line has qty 2  ->  add_to_cart(item, qty=5)  ->  line becomes 7   (one row)
```

Earlier phases of this frontend pinned the opposite - SET - in the mock, in the tests
and in three doc comments. That was wrong, and the tests were *protecting* the error:
they would have failed against the real backend. They were rewritten rather than
adjusted.

Consequences now pinned by tests:

- **Not idempotent.** Repeating the call adds again: 2 -> 7 -> 12.
- **Never auto-retried.** There is no retry operator anywhere in the add path. A
  mutation test that inserts `retry(1)` fails six tests.
- **Re-entry guarded.** A double click, a held Enter, or a direct second call while
  one is in flight all produce exactly one request.
- **No client-side delta arithmetic.** The buyer's input on item detail *is* the
  delta; nothing computes `desired - existing`. The field now reads "Quantity to add".
- **The cart stays read-only.** No stepper, no inline editing - and there is no
  absolute set-quantity endpoint to build one on.

### Uncertain add outcomes

An add that fails is classified before anything is said to the buyer:

| Outcome | Meaning | Behaviour |
| --- | --- | --- |
| Server answered with an error envelope | received and **refused**; nothing applied | keep the cart, show the normal safe error |
| Never completed, or the server failed after accepting (`httpStatus` 0 or >= 500) | **unknown** - the delta may have applied | re-read `get_cart`, ingest it, and say we could not confirm |

The recovery is a **read**, never another add. If the read also fails, the buyer is
told to check the cart before adding again. Nothing ever claims "not added" when that
is a guess - a buyer told that would add again and buy twice as much.

### Error `details` narrowed to an allow-list

`YobApiError.details` used to hand the backend's whole `details` object to components.
It is replaced by `YobApiError.context`, built by copying three known keys with their
types checked: `retryable`, `salesOrder`, `correlationId`. Anything else - provider
text, tracebacks - is dropped at the network boundary. A test feeds hostile extras and
asserts they do not survive.

### Payment error semantics corrected

- `payment_provider_error` now branches on `context.retryable`: **true** keeps the
  "your order is saved, try again" wording; **false without** an order offers another
  method; **false with** an order asks the buyer to contact us. Previously all three
  were treated as retryable.
- A **revoked** token answers `checkout_token_invalid`, which is what a buyer sees
  after paying and refreshing. The wording no longer calls their link invalid; it
  reads as closed, and mentions that a completed payment is confirmed.
- `checkout_token_expired`, `payment_already_processed` and `payment_signature_invalid`
  are **terminal**: the payment controls are withdrawn rather than inviting an attempt
  that must fail.

### Audited and already correct - no change

Response-shape asymmetry (`add`/`remove` flat document vs the `get_cart` envelope, with
`get_cart` canonical); setter acknowledgements followed by `get_cart`; billing
auto-filling shipping; `is_shippable` re-read from every response and never cached;
`proceed_to_payment` 200 = 201; `/payment/:token` public and outside the guard;
`payment_method` sent as `name`; `process_payment` limited to two fields; Razorpay
paise passed through unchanged; no client-side HMAC; token never persisted; raw Frappe
403 normalized and never rendered; the master-data create-then-refresh pattern.

### Deliberately not done

- **No `get_payment_methods` call was added.** The public payment page reads
  `payment_methods[]` from `get_checkout_data`, which the handoff explicitly prefers
  for that page. Adding an authenticated, company-scoped call there would break the
  incognito journey the backend verified in a real browser. If an authenticated method
  list is ever added elsewhere, `company` is **required** - omitting it returns `[]`
  with no error, which reads as "none configured".
- **`cms.get_config.allowed_payment_modes` is not used** and must not be: the backend
  reads the wrong field and it is always `[]`. Known backend defect, not fixed from
  here.
- `address.get_contact_for_customer` is **internal Desk tooling** and is not called.

### CURRENT vs DEFERRED cart - do not mix these

**CURRENT (implemented):** one row per `item_code`; `qty` is an additive delta;
non-idempotent; no absolute set-quantity endpoint; whole-line removal; whole-cart
expiry; cart UI read-only.

**DEFERRED (not implemented, do not build):** independent duplicate rows; stable
per-line identity; immutable line quantity; per-line expiry.

## CONFIRMED - API reference version 2.0.0 (2026-08-13)

The API reference in `reference/api/` was **replaced wholesale** on 2026-08-13 with
reference version **2.0.0**, captured from backend **Payment Lifecycle Phase 2B**.

- **The previous reference (1.0.0) is superseded.** Where an older frontend note,
  type or mock disagrees with 2.0.0, the reference wins - being written first is not
  an argument.
- Read `reference/api/live/README.md` before payment work. It is not a summary of the
  JSON; it carries the lifecycle rules and the sanitization policy.
- `verified-responses.json` is the concrete contract. It now grades every entry
  `wire` / `test` / `source`, and the distinction matters: **payment endpoints are
  `test`, not `wire`** - executed in-process against seeded data inside a rolled-back
  savepoint with a deterministic Razorpay fake, so the envelopes are real but no HTTP
  round trip and no live provider were involved.
- Every non-payment contract Phases 1-11 were built on is **byte-identical** in 2.0.0.
  `proceed_to_payment` and `get_payment_methods` simply moved into a new `payment`
  section. Nothing from Phase 11 needed revisiting.
- The only added operation is `address.add_contact`, which Phase 11 already
  source-verified and implemented.

### Payment lifecycle the frontend must model

```text
Checkout -> proceed_to_payment -> immutable Payment Request, backed by the CART
/payment/:token -> user picks a method -> process_payment
    -> Cart commits to ONE Draft Sales Order
    -> the Payment Request is now backed by that SALES ORDER
```

- A **Payment Request is an immutable financial obligation.** Its amount and currency
  never change after issue. A changed cart does not silently update one - it issues a
  replacement obligation and revokes the old credential.
- **Before commitment** the Payment Request references the Cart; **after commitment it
  references the Sales Order.**
- **After commitment the Cart is no longer payment truth.** It is not re-read or
  revalidated, and later cart edits cannot invalidate a committed payment.
- The checkout token survives the Cart -> Sales Order transition, so `/payment/:token`
  keeps working across refresh and retry. It is revoked only once payment settles.
- **The frontend never calculates or sends an authoritative amount or currency**, and
  never sends a cart id, customer, fingerprint or payment method. The server derives
  all of it from the session.
- `/payment/:token` is a **public** route; the payment endpoints are guest-accessible.
  The token is a **bearer credential** - see the Phase 12 entry for the storage rules.
- Razorpay stays an SPA Checkout.js integration and belongs to Phase 13.
- **Live smoke must remain non-destructive.** `proceed_to_payment` issues and revokes
  real Payment Requests, so it is never part of ordinary smoke runs.

- API style is Frappe RPC under `/api/method/...`.
- API style is Frappe RPC under `/api/method/...`.
- The reference now contains 34 operations.
- Frappe session cookie is `sid`.
- Authenticated mutating operations use Frappe CSRF where declared.
- CSRF token is described as coming from login or `get_session_context`.
- Authenticated requests must traverse the edge proxy responsible for `X-YOB-Original-Host`.
- Current Postman local base URL is `http://storefront.local:8080`.
- Pricing/discount/tax/cart totals are server responsibilities and should remain authoritative in Angular.

## CONFIRMED - Live API verification (Phase 1, 2026-08-10)

Captured from the running local stack. Detail in `docs/API-CONTRACT.md` and
`reference/api/live/verified-responses.json`.

- The outer Frappe `message` wrapper is always present on YOB endpoint responses,
  success and failure. The OpenAPI examples that omit it are documentation defects.
- Inner envelope is exactly `{data, notice?, meta?}` or `{errors[]}`. `notice` and
  `meta` are omitted when empty; `field` and `details` are optional per error.
- Frappe adds its own top-level keys next to `message` on login (`home_page`,
  `full_name`). Unknown top-level siblings must be ignored.
- A **second, non-YOB failure shape exists**: raw Frappe exception bodies with a full
  traceback, for unauthenticated secure calls (403 `PermissionError`) and missing CSRF
  (400 `CSRFTokenError`). The network layer must normalize both, and a non-JSON error
  body (edge 421) is also reachable.
- CSRF token location is `message.data.csrf_token`, from login and
  `get_session_context` alike.
- `sid` is HttpOnly, `Path=/`, `SameSite=Lax`, with no `Domain` and no `Secure` -
  host-scoped, so SPA and API must share an origin.
- The auth `application` parameter is **required** (not optional) on
  `login_with_password`, `request_otp` and `get_session_context`. Local value is
  `STOREFRONT`. It belongs in environment config, not in domain code.
- `get_session_context` is not guest-allowed: an unauthenticated restore returns the
  raw Frappe 403 shape and must be mapped to *guest*, not to a transport fault.
- Password login is rate-limited to 10 attempts / 300 s per username, counted before
  authentication, answering 429 `rate_limit_exceeded`.
- HTTP status codes are real and meaningful (200/201/400/401/403/404/422/429/500).
- The stable error-code registry is much larger than the OpenAPI examples suggest and
  is recorded in full in the live reference file.
- Frappe check fields arrive as integers `0`/`1`, not JSON booleans.
- The local backend is a user-space nginx edge (`~/yob-edge/nginx.conf`) in front of a
  Frappe bench (`~/frappe_local/frappe-bench`, site `yob.localhost`) - not Docker.
- Bypassing that edge yields 403 `application_access_denied` even with a valid
  session, because `X-YOB-Original-Host` is absent.

## CONFIRMED - Network foundation (Phase 2, 2026-08-10)

- `foundation/network` owns all Frappe plumbing. Domains call
  `YobApiClient.get/post(method, …)` and receive `{data, notice?, meta?}`; the outer
  `message` wrapper never leaves the transport layer.
- Every failure normalises to one `YobApiError` carrying `kind`, `httpStatus`, `code`,
  `detail`, `field?`, `details?`, the full `errors[]`, and `frappeExcType?`.
- The Frappe traceback is discarded rather than retained - there is no `original`
  field. See `docs/API-CONTRACT.md` section 7.
- Codes the client synthesises are prefixed `client_` so they can never be confused
  with backend codes.
- `sid` is untouched: no cookie access, no storage, no `withCredentials`. Same-origin
  relative URLs let the browser attach it.
- CSRF lives in `CsrfTokenStore`, in memory only, never persisted. The interceptor
  adds `X-Frappe-CSRF-Token` only for non-GET requests under the RPC base path when a
  token exists. The session domain will own set/clear in Phase 3.
- Application-level technical configuration lives in `src/environments/`, injected via
  `YOB_API_CONFIG`. `application: 'STOREFRONT'` is declared there and is not consumed
  anywhere yet - the auth endpoints that need it arrive in Phase 3.
- Verified live through the edge with `scripts/live-smoke.mjs`: 23 checks, all shapes
  the normalizer depends on confirmed on the wire.

## CONFIRMED - Session and auth foundation (Phase 3, 2026-08-10)

- `foundation/auth` owns the `yob_auth` RPC calls; `foundation/session` owns state.
  Neither contains UI. Sign-in pages arrive later in the access domain.
- Session lifecycle is `unknown | restoring | guest | authenticated`, never a boolean.
  An unexpected restore failure leaves `unknown` plus a populated `restoreError`, so
  it stays distinguishable from a confirmed `guest`.
- A permission denial counts as guest during restore **contextually only** - see the
  Phase 9.5 correction below. A 500, an outage, or `application_access_denied` must
  not sign a user out; all three are covered by tests.
- The login payload is identical to `get_session_context`, so login establishes the
  session directly with **no follow-up context call**. Wire-verified.
- `logout` is now **wire-verified** (previously source-only): it returns
  `{authenticated:false}` with notice `Logout successful.`, and the same `sid`
  afterwards answers the raw Frappe 403, so restore correctly reports guest.
- Nothing is persisted: no `sid`, no CSRF token, no user data in localStorage or
  sessionStorage. State after a refresh comes solely from `get_session_context`,
  called from `provideAppInitializer` before the first render.
- Restoration is bounded at 10 s (`SESSION_RESTORE_TIMEOUT_MS`) so a hung backend
  degrades to a visible error rather than a permanently blank page. A timeout lands in
  the same unresolved state as any other unexpected failure (`unknown` +
  `restoreError`, code `client_request_timeout`) and is explicitly not guest; retry is
  just another `restore()` call. Only restoration is bounded, because only it blocks
  bootstrap.
- CSRF lifecycle belongs to the session: the token goes to `CsrfTokenStore` on
  login/restore and is cleared on guest/logout. `SessionContext` is
  `Omit<SessionContextDto, 'csrf_token'>`, so keeping a second copy is a type error.
- Logout on a non-session failure (500, offline, stale CSRF) propagates and leaves
  local state intact, rather than claiming the user is signed out while the server
  session is still alive.
- OTP exists at API level only (`loginWithOtp` fully typed; `requestOtp` returns
  `unknown` data because its success payload is still unverified). No OTP state or
  workflow.

## CONFIRMED - Mock API foundation (Phase 4, 2026-08-10)

- `src/mock-api/` intercepts at the server boundary via `mockApiInterceptor`. Every
  layer above it - `YobApiClient`, `yobCsrfInterceptor`, `SessionStore` - is the
  production one, so mock mode exercises real unwrapping, error normalisation and CSRF.
- **No domain code branches on mock mode.** Verified: nothing under `src/app/`
  references `src/mock-api`, and the only real import of the mock layer anywhere is in
  `environment.development.ts`.
- Handlers emit the wire shape `{message:{data, notice?, meta?}}`, never a
  pre-unwrapped `YobResponse`.
- Mock mode is one switch (`USE_MOCK_API` in the development environment file),
  defaulting to `false` so `ng serve` and `scripts/live-smoke.mjs` keep using the real
  edge.
- **Production cannot enable the mock.** `environment.ts` does not import
  `src/mock-api`, so the layer is absent from a production bundle, not merely disabled.
  Proven by building with the dev flag on and confirming the production bundle still
  contains no mock fixture markers. The development bundle does carry the mock layer
  even when the flag is off - dev-only weight, no production effect.
- Auth handlers reproduce verified behaviour including the raw Frappe 403 for guests
  and a real CSRF check on logout; there is no mock `sid` cookie and nothing is
  persisted to browser storage.
- Scenario support is deliberately two knobs (`server-error`, `latencyMs`). Guest,
  validation errors and empty results are reached by making the mock behave normally,
  which tests the contract instead of the switch.

## CONFIRMED - Routing and shells (Phase 5, 2026-08-10)

- Two route branches at `path: ''`, each with its own shell: public (unguarded) and
  secure (`secureRouteGuard`). Order in `app.routes.ts` is load-bearing - see
  `docs/ARCHITECTURE.md` section 19a.
- The guard deferred from Phase 3 now exists. It reads `SessionStore` signals and makes
  no HTTP call; a mutation test confirms six routing tests genuinely depend on it.
- An unresolved session (`restoreError` set) redirects to `/session-unavailable`, never
  to `/login`. A backend outage must not be presented as a credentials problem.
- Return URLs are validated by `sanitizeReturnUrl`; only local application paths are
  accepted. Every future consumer, including the real sign-in page, must use it.
- Domain routes are lazy (`loadChildren` per domain, `loadComponent` per page) and each
  produces its own chunk - verified in the production build output.
- Access control lives at the route branch. No page may repeat a login check.
- Placeholder pages exist for `/login`, `/terms`, `/catalog`, `/account`,
  `/session-unavailable` and not-found. They are structural proof only; the real UI
  arrives with each domain's phase.
- The app root renders only `<router-outlet />`; the Angular scaffold placeholder is
  gone and `app.spec.ts` was updated to assert the new contract.

## CONFIRMED - Permission-error semantics corrected (Phase 9.5, 2026-08-10)

Real backend evidence disproved a Phase 2 assumption.

**Was wrong:** the network layer mapped every raw Frappe 403 `PermissionError` to
`client_session_required`, i.e. it concluded "not signed in" from HTTP status plus
`exc_type`. The bench returns that same response to a *fully authenticated* user who
lacks Frappe role permission on the `Item` doctype, so browsing a refused catalog page
would have been read as a lost session.

**Now:** the network layer emits the neutral **`client_permission_denied`** and draws
no conclusion about the session. `YobApiError.isSessionFailure` was removed - the
question cannot be answered from the failure alone.

**Session meaning moved to `SessionStore`**, which reads a permission denial as guest
in exactly two places, because there the *operation* supplies what the response
cannot: `restore()` (being refused `get_session_context`, which is not guest-allowed,
answers "who am I?") and `signOut()` (being refused `logout` means the session is
already gone). Chosen over `AuthApi` because the meaning is contextual to the
operation, and `SessionStore` already owns every session-state decision - `AuthApi`
stays a thin typed transport.

Unchanged: explicit YOB envelope codes pass through untouched, including
`application_access_denied` at 403. No error strings are matched, and
`_server_messages` is still discarded.

`client_session_required` no longer exists. Nothing emitted it after the correction,
and a code whose name asserts session state from a signal that cannot establish it is
the bug, not a useful abstraction.

## DEFERRED BACKEND CONTRACT CHANGE - Cart line identity and per-line expiry

The product owner has confirmed a future Cart model. It is **not** being built yet, and
the frontend and mock deliberately continue to follow the current production backend
until the backend contract actually changes.

### Future desired behaviour (not implemented anywhere)

- every Add creates an independent `Cart Item` row, duplicates of one `item_code` allowed
- row identity is the backend child-row identifier (Frappe `name`) - never invented client-side
- quantity is immutable once a line exists
- removal targets a single line by that identifier
- expiry is evaluated per line

### Backend changes that requirement will need

1. `add_to_cart` must append rather than look up by `item_code` and assign `quantity`.
2. **`sync_sales_order_to_cart` must stop keying by item code.** It builds
   `{row.item_code: row for row in cart.items}`, so with duplicates only the last row is
   priced and earlier ones keep stale figures. This is the blocking defect - fixing
   `add_to_cart` alone would ship silently mispriced lines.
3. `build_cart_response` must emit each row's `name`. `as_dict(no_default_fields=True)`
   strips `name`, `creation`, `modified` and `idx` from child rows, so lines currently
   reach the client with no identity at all.
4. `remove_from_cart` must target that identifier; today it filters on `item_code` and
   would delete every duplicate at once.
5. `removed_items` / `price_updated_items` report item codes, which stop identifying a
   line once duplicates exist.
6. `Cart Item` has **no** size, theme, variant, configuration or note field, so two rows
   of one item would differ only by quantity - the stated rationale implies such a field.

### Expiry, if it becomes per line

Today it is whole-cart: `YOB Store Settings.cart_expiry` (Int, **hours**) against the
parent `cart.modified`; expiry clears every line; evaluated lazily inside `get_cart`,
`add_to_cart`, `remove_from_cart`, `clear_cart` and checkout, with no scheduler
(`scheduler_events` is commented out). `Cart Item.item_expiry_date` exists but no code
reads or writes it; it plus each row's `creation` would be the natural basis.

### Current position

**The frontend intentionally follows the current production backend**: one effective row
per `item_code`, Add sets quantity, removal by `item_code`, whole-cart expiry. None of
the deferred behaviour is implemented in Angular or in the mock, and it must not be
until the backend ships it.

## CONFIRMED - Phase status

| Item | Status |
| --- | --- |
| Frontend Phase 11 - Checkout Details | **PASS** |
| Frontend Phase 12 - Proceed to Payment handoff | **PASS** |
| Frontend Phase 13 - Public payment, methods, Razorpay, verification | **PASS** |
| Frontend Phase 13.5 - Backend contract synchronization | **PASS** |
| Frontend Phase 14 - Buyer orders | **PASS** |
| Frontend Phase 14.6 - Order contract synchronization | **PASS** |
| Backend Payment Lifecycle Phase 2B | **PASS** |
| API reference 1.0.0 | **superseded** |
| API reference 2.0.0 (2026-08-13) | in use |

## CONFIRMED - Public payment page (Phase 13, 2026-08-13)

Contracts: `reference/api/live/verified-responses.json`, `payment.*` (reference 2.0.0).
All three payment endpoints are verification level **`test`**, not `wire` - see the
pending note at the end.

- **The checkout DTO is a discriminated union on `source_doctype`**, not one flattened
  model. Cart-backed carries a `cart`, a resolved `contact` and address **objects**;
  Sales-Order-backed carries a flat `items[]`, `customer`/`company`/`order_status`/
  `docstatus`, and addresses as **name strings**. The page renders what it is given and
  never fetches extra data to make the two look alike.
- **The same token can answer differently across loads.** `process_payment` commits the
  cart to an order and the obligation moves with it, so a buyer who dismisses the
  provider modal and reloads legitimately gets the order-backed shape. Nothing in the
  page assumes a cart still exists. This is covered by a unit test and a browser test.
- **`process_payment` receives the method's `name`, never its `method_code`.**
  `"Razorpay"`, not `"razorpay"`. `PaymentApi.processPayment` takes the whole method
  object rather than a string so the two cannot be confused at a call site, and a
  regression test asserts the submitted value is not the code. `method_code` is used
  only to choose the browser integration after the reply arrives.
- **The request carries only `token` and `payment_method`.** No amount, currency, cart,
  order, customer, payment request or provider order id.
- **Payment methods are entirely server-driven.** Rendered verbatim from
  `payment_methods[]` in `display_order`; nothing filters by type or hardcodes Razorpay
  or Pay Later as assumptions. Razorpay-only and Pay-Later-only configurations are
  tested.
- **Pay Later is an order, not a payment.** It reports the server's `payment_status`
  (`Unpaid`) and the Sales Order, never "payment successful", and never calls
  `verify_payment`.
- **Razorpay `amount` is in provider units** (paise: `13500` == INR 135.00), a different
  scale from the `amount` `get_checkout_data` reports. It is passed to the widget
  untouched; a mutation test proves converting it fails.
- **Checkout.js is loaded on demand**, once, by `RazorpayCheckoutLoader` - not an npm
  dependency, not a tag in `index.html`. An existing tag is adopted rather than
  duplicated, and a failed load clears the cache so a retry can succeed. Only the
  publishable `razorpay_key` reaches the browser; there is no secret.
- **Success is the server's word.** The provider callback triggers `verify_payment`
  (exactly the three provider fields, **no token** - the endpoint resolves by provider
  order id and HMAC), and nothing is shown as paid until it returns.
- **A dismissed modal is not a rollback.** The order was committed before the modal
  opened, so the page keeps the buyer where they are with a retry, and says the order is
  saved.
- **`payment_provider_error` with `details.retryable` is not a failed order.** The Sales
  Order exists; the wording says so and shows it, and retry goes through the same
  method and token. Never "order creation failed", never back to rebuilding a cart.
- **`payment_request_stale` gets its own terminal state** with a link back to
  `/checkout`, because this public page cannot issue a replacement obligation.
- **An invalid or expired token is a public error state**, not an auth failure and never
  a login redirect. The token is never echoed into any message.
- **A refused method triggers an authoritative refresh**: the selection is cleared and
  the eligible list re-read, so the rejected method cannot be resubmitted.
- **State is page-local.** No payment store - one consumer, route-derived, discarded on
  leave. A single `busy` guard blocks overlapping `process_payment`, provider opens and
  `verify_payment` alike; each duplicate would be a real financial action.
- **Token handling**: read from the route, passed to the two calls that need it, never
  persisted, logged, put in telemetry or copied into unrelated state.
- **The Razorpay test seam is a build-level substitution**, not a runtime flag.
  `environment.providers` swaps `RazorpayCheckout` for a deterministic fake in mock
  builds; the fake lives under `src/mock-api/`, which production never imports. Verified
  absent from the production bundle, which still ships the real Checkout.js loader.

### Still pending: real Razorpay Test-Mode verification

Unchanged from the reference's own note, and **not** closed by this phase. Everything
provider-facing was proven against a deterministic fake. Not yet confirmed against the
live sandbox: 40-character receipt acceptance on the wire, the duplicate-receipt error
class, `order.all({"receipt": …})` filtering, and live signature verification. The
response *contract* the SPA consumes is unaffected; the recovery paths are not
wire-proven.

Ordinary live smoke remains **non-destructive** and gained nothing this phase: it never
calls `proceed_to_payment`, `process_payment` or `verify_payment`, because those create
or reuse real Payment Requests and Sales Orders. A live payment smoke would have to be
explicit opt-in against controlled data.

## CONFIRMED - Proceed to payment (Phase 12, 2026-08-13)

Contract: `reference/api/live/verified-responses.json`, `payment.proceed_to_payment`
(reference 2.0.0, verification level **`test`** - real envelopes, no HTTP round trip).

- **The request carries nothing.** `POST proceed_to_payment` with an empty body. No
  cart id, customer, amount, currency, fingerprint or payment method - the server
  derives all of it from the session. A test asserts the body is empty rather than
  merely lacking those keys, so a future addition has to be deliberate.
- **`201` and `200` are the same outcome to the frontend.** Created, reused and
  credential-rotated all mean "go here next". Nothing on screen distinguishes them, and
  `CheckoutApi` exposes no flag that would let a caller try.
- **Navigation uses the server's `payment_url`**, not a path rebuilt from `token`, so
  the server keeps ownership of where checkout continues. It is checked first by
  `sanitizePaymentUrl` - narrowly, for one thing: an internal `/payment/<segment>` path.
  Otherwise a bad upstream response becomes an open redirect out of the storefront.
  The internal-path rules are reused from `sanitizeReturnUrl`.
- **Nothing is committed here.** `proceed_to_payment` issues the obligation; the cart
  becomes a Sales Order later inside `process_payment`. There is no local "ordered"
  transition, optimistic or otherwise, and a test pins that the cart is untouched.
- **Double submission is blocked twice**: the CTA is disabled while pending, and the
  handler refuses re-entry. The second matters because the button's state is a UI
  affordance while a duplicate request is a second financial obligation.
- **A server refusal keeps the buyer on `/checkout`** with wording written here, never
  the backend's. Cart-state failures (`cart_empty`, `contact_required`, …) trigger a
  re-read of the cart rather than a local guess at what changed. The message renders
  outside the page's state branches - a `cart_empty` failure re-reads an empty cart and
  switches the page to its empty state, which would otherwise swallow the explanation.
- **`/payment/:token` is public**, under `PublicShell`, outside `secureRouteGuard`. A
  buyer may arrive with no session, on another device, from a link. Tests assert it
  resolves while logged out and is never redirected to sign-in.
- **The token is a bearer credential and lives only in the URL.** Not in localStorage,
  sessionStorage, IndexedDB, cookies, a store or a log; not copied into component
  state. The Phase 12 payment page does not even read it - it has no `token` input -
  because a placeholder has no use for it. Unit and browser tests assert the absence.
- **Phase 12 stops at the handoff.** The payment page is a routing shell showing
  "Preparing payment details…". It does not call `get_checkout_data`, show methods, or
  fake a payment screen that would be deleted next phase.
- **`proceed_to_payment` is excluded from live smoke** and from every automated run
  against a live bench, because it issues and revokes real obligations.
- **Live smoke was made non-destructive.** It previously proved the CSRF header by
  calling `clear_cart` with a valid token, which emptied the real customer's cart on
  every run. It now uses `set_cart_contact` with no arguments: Frappe validates CSRF
  before the handler runs, so a `422 contact_required` proves the header was accepted
  and changes nothing. Verified by seeding a real cart selection and confirming it
  survived a full smoke run.

### Phase 13 scope (delivered - see the Phase 13 entry above)

`payment.get_checkout_data` returns **two shapes** and must be branched on
`data.source_doctype`:

| `"Cart"` | `"Sales Order"` |
| --- | --- |
| `cart`, `contact` | flat `items[]` |
| `billing_address` / `shipping_address` as **objects** | the same fields as **name strings** |
| reconciliation fields | `customer`, `company`, `order_status`, `docstatus` |

No Phase 12 type assumes a Cart-shaped payload - the only DTO added is
`ProceedToPaymentData`, which shares nothing with it. Model the source as a
discriminated union when that work starts; do not flatten the two into one object.

Also Phase 13: payment-method selection, `process_payment`, Pay Later, Razorpay
Checkout.js, `verify_payment`, confirmation, and provider-retry UI
(`payment_provider_error` carries `details.retryable` and `details.sales_order`, and the
order is **not** rolled back).

## CONFIRMED - Checkout details (Phase 11, 2026-08-12)

- **Checkout loads three things at once**: `cart.get_cart`, `address.get_addresses`,
  `address.get_contacts`. None waits for another and each section renders as its own
  data arrives, so the order summary appears while the contact list is still loading.
- **`CartStore` owns every current selection** - contact, billing, shipping and
  `is_shippable`. The page keeps no chosen value of its own, so there is one answer to
  "which address is selected" and it is the server's. The Address and Contact *lists*
  are page-local `rxResource`s: master data, one consumer, no second reader. There is
  no `CheckoutStore`.
- **The setters do NOT return the cart.** Wire-verified 2026-08-12, and the opposite of
  what was assumed going in:

  ```text
  set_cart_contact          -> {"contact_person": "..."}
  set_cart_billing_address  -> {"billing_address": "...", "shipping_address": "..."}
  set_cart_shipping_address -> {"shipping_address": "..."}
  ```

  Only `get_cart` calls `build_cart_response`, so only it carries totals, lines,
  `is_shippable`, the resolved blocks and reconciliation. Every setter is therefore
  followed by the canonical read - the same rule as `add_to_cart`/`remove_from_cart`,
  for the same reason. A selection can genuinely reprice the cart, so adopting the
  acknowledgement would leave stale totals beside a new selection.
- **Billing auto-fills shipping**, wire-verified: `cart.py` assigns billing to shipping
  when shipping is empty, and echoes both. The frontend neither predicts nor imitates
  this - it re-reads and shows what came back. "Same as billing" is derived by
  comparing the two returned identifiers; there is no such flag in the contract.
- **Shipping is shown only when the returned `cart.is_shippable` is non-zero**, re-read
  from every cart response rather than stored. The backend recomputes it from
  `is_stock_item` on each reprice.
- **Billing and shipping share one Address list.** The backend keeps no separate
  shipping list; `is_shipping_address` is a hint on the record, not a filter.
- **Create then re-read then select.** `add_address`/`add_contact` return `201` with the
  created record, but only its `name` is used: `add_contact`'s reply omits `full_name`,
  which Frappe composes on save. The list read is the authoritative view. The section
  that opened the form decides which setter runs.
- **Refused records say nothing about ownership.** `contact_invalid` /
  `*_address_invalid` become "no longer available - please select another", and the
  relevant list is re-read. The backend already answers a deleted record and another
  customer's record identically; the UI must not undo that.
- **The radio shows the cart, not the click.** A click reverts the group to the cart's
  value and *then* requests the change, so a refused or dropped selection cannot leave
  the list showing something the cart does not have. Nothing is applied optimistically.
- **Phase 11 stops before payment.** No `proceed_to_payment`, and deliberately no
  button that looks like it starts one - readiness is reported as a status instead.
  Readiness is UX only; Phase 12 re-validates server-side.
- Address `display` from the backend is **HTML** and, on the real bench, embeds the
  customer's GSTIN. It is never rendered; the structured fields are used instead.
- The deferred Cart line-identity redesign below remains deferred and untouched.

### Verification level (Phase 11)

Wire-verified against the live bench: all three loads with real records, all three
setters including their success payloads, `contact_required`, `contact_invalid`,
`billing_address_invalid`, and the billing→shipping auto-fill. Also captured for the
first time: a populated `get_cart` with resolved contact/address blocks, a cart line
row, and `is_shippable`.

`shipping_not_applicable` is wire-verified too: 422 with **no `field`**, since no input
is at fault. It became reachable once the bench cart emptied and the backend recomputed
`is_shippable` from 1 to 0 - which is itself live confirmation that shippability is
derived per response and must never be cached client-side.

Source-verified only: the `add_address` / `add_contact` success bodies. Creating real
master data on a shared bench purely for evidence was out of scope, so both are
reproduced from `address.py` and covered by deterministic mocks.

Not verifiable in a real browser: a populated checkout. The Item doctype permission
still blocks adding anything, so the real cart cannot be filled from the storefront.
The populated path was captured at the API level (resolved blocks, preselected contact
and addresses, a cart line) before the bench cart was emptied.

**Warning about `scripts/live-smoke.mjs`**: it POSTs `clear_cart` with a valid CSRF
token, which empties the *real* customer's cart. Harmless on a scratch bench, and it
predates this phase, but it destroyed the one populated real cart available for
verification. Worth making non-destructive before this script is ever pointed at a
bench whose data matters.

## CONFIRMED - Cart removal, current contract (Phase 10.5, 2026-08-10)

- `remove_from_cart(item_code)` implemented against the backend **as it exists today**.
  Item-code removal is unambiguous only because Add keeps one effective row per code;
  no line identifier is invented client-side.
- Newly **wire-verified**: blank `item_code` answers 422 `validation_failed`; a code
  that is not in the cart answers **200 with the bare cart document** - it filters
  nothing out and does *not* 404. The mutation reply shape (bare cart, no
  reconciliation) is therefore now wire-verified too, not just source-verified.
- Removal follows the Phase 10 rule: mutate, then `get_cart`, and ingest **that**.
  Nothing is removed optimistically, so a failure leaves the line exactly where it was.
- The success acknowledgement and the removal error sit outside the cart's state
  branches, so they survive the cart becoming empty - the same fix the reconciliation
  notice needed.
- **No cart quantity editing.** The backend's Add upsert is not exposed as a cart
  editor: no input, no stepper, no inline update. Two tests assert the absence.
- Whole-cart expiry is unchanged and remains entirely the backend's: no frontend
  timestamps, countdowns or timers.

## CONFIRMED - Cart vertical slice (Phase 10, 2026-08-10)

### Verified cart contract

Wire-verified this phase: `get_cart` payload (including `currency`); `add_to_cart`
rejections - 422 `validation_failed` (no `item_code`), 422 `quantity_invalid`
(`qty <= 0`), 404 `item_not_found`; `remove_from_cart` 422 `validation_failed`;
**fractional quantities are accepted** (`qty: 2.5` passes validation).

Source-verified: `add_to_cart` **sets** quantity (`existing.quantity = qty`) - it is an
upsert, not an increment, and doubles as the quantity-update endpoint. This resolves
the Phase 1 "quantity-update semantics unclear" item. Mutation replies are the bare
cart document with **no** reconciliation fields. `removed_items` /
`price_updated_items` are arrays of **item-code strings**. Cart line images are
absolute URLs (`get_url()` is applied there, unlike catalog).

The cart identifier is **`item_code`** - catalog `name`, never a slug.

### Decisions

- `CartStore` is shared because item detail and the cart page are two real consumers
  of one truth. See `docs/ARCHITECTURE.md` 6s.
- Every mutation is followed by `get_cart`, and **that** response is ingested - 6t.
- Quantity honours only the verified rule: finite and `> 0`. No integer, step, maximum
  or stock rule is invented. Non-finite input is rejected before any request.
- Repricing is driven by the input's native `change` event, so typing cannot produce a
  request per keystroke. No debounce or timers.
- Reconciliation is reported as localized counts; the item codes stay in the store.
- The cart page uses `cart.currency` (authoritative) rather than the environment
  fallback.
- `remove_from_cart` and cart-page quantity editing are **out of scope** for Phase 10
  although their contracts are known.

### Backend Item permission - STILL BLOCKED

Re-checked at the start of Phase 10 and again after restoring the bench: unchanged. No
real item is reachable, so a real add-to-cart cannot be performed. `get_cart` **is**
reachable and was verified in a real browser (empty state, secure shell, no overflow).

### New: the raw Frappe failure body narrows without developer_mode

The restarted bench runs with `developer_mode` off, and the raw 403 body is then just
`{exc_type, _server_messages}` - no `exception`, no `exc` traceback. Classification is
unaffected because it keys on `exc_type` + status, which vindicates the Phase 2 choice
not to parse the exception text. `scripts/live-smoke.mjs` no longer asserts the
traceback's presence.

## CONFIRMED - Item detail (Phase 9, 2026-08-10)

- Route `/catalog/item/:itemSlug`, inside the catalog domain. **Order is load-bearing**:
  it sits above `:categorySlug`, which would otherwise swallow `item`. Cost: `item` is
  reserved as a category slug. Both orderings are covered by tests.
- Item cards navigate via a **stretched link** - one anchor, whole-tile target. A
  future add-to-cart button must sit above it with `relative z-10`.
- `CatalogApi.getItem(slug)` was added to the existing service; no `ItemApi`, no new
  HTTP or state abstraction. Page-local `rxResource`, same as Phase 8.
- Pricing displayed, never derived, including the tax breakdown (net / tax / total are
  all backend figures). The breakdown is shown only when tax actually applies.
- No quantity control: the request sends no `qty`, so the backend prices for 1.
  Quantity arrives with add-to-cart, where changing it has a purpose.

### `get_item` contract status

| Path | Status |
| --- | --- |
| unknown slug -> 404 `item_not_found`, field=slug | **wire-verified** (new) |
| blank slug -> 422 `validation_failed`, field=slug | **wire-verified** (new) |
| success payload | **source-verified only** |

The success payload has still never been observed. Two field-name traps carried from
source: the slug is **`custom_slug`** (not `slug`) and the unit is **`uom`** (not
`stock_uom`) - both differ from the item rows inside `get_category`.

### Backend Item permission - STILL BLOCKED

Re-checked at the start of Phase 9 and unchanged: the storefront user has no Frappe
role permission on the `Item` doctype, so any category containing items answers
`403 application_access_denied` (`_error_message: "No permission for Item"`). No real
item can be fetched, and nothing was changed in the backend to work around it.

Note `get_item` has **no try/except** in `catalog.py`, so a real item would likely
fail as a *raw Frappe 403* rather than the YOB envelope - which the network layer
normalises to `client_permission_denied`. The page treats everything except
`item_not_found` as a generic error, so that path is safe; a unit test pins it.

Verified in a real browser at `http://storefront.local:4200`: the real 404 renders the
not-found state, the Item-permission refusal renders the safe generic error, nothing
leaks, and there are no JS errors.

## CONFIRMED - Catalog vertical slice (Phase 8, 2026-08-10)

- `domains/catalog/` is the reference domain - structure and rationale in
  `docs/ARCHITECTURE.md` 6r. Route `/catalog` and `/catalog/:categorySlug`, both lazy.
- **State: page-local `rxResource`, no store.** Documented decision; the trigger for a
  store is two real consumers of the same data.
- Pricing is displayed, never derived. Currency comes from `CATALOG_CURRENCY`
  (environment `locale.defaultCurrency`, currently `INR`) through `CurrencyPipe`,
  because **the catalog endpoints return no currency field**.
  `get_config.default_currency` should supersede it in the store-context phase.
- `withComponentInputBinding()` is now enabled, so route params bind to signal inputs.

### Newly wire-verified against the real bench

The bench is **no longer empty** - it now holds an `Apparel` category with a
`Mens T Shirt` subcategory. This upgrades `get_category` from source-verified to
**wire-verified**, and the observed shape matches the DTOs exactly (`category`,
`subcategories`, `items`, `meta.subcategory_count`, `meta.item_count`).
`thumbnail`/`banner` were null on real rows.

### Real-backend findings that matter

- **The backend enforces an Origin allow-list** (`Application.allowed_origins`).
  A browser on `http://localhost:4200` is rejected with `application_access_denied`
  ("not allowed from the current origin"); any `storefront.local` origin is accepted.
  So real-backend browser work **must** use `http://storefront.local:4200`, which
  needs the hosts entry noted in `docs/API-CONTRACT.md` 10b. Node/curl callers are
  unaffected because they send no `Origin`, which is why the live smoke never caught it.
- **A leaf category with items currently answers `403 application_access_denied`**:
  the storefront user has no Frappe role permission on the `Item` doctype
  (`_error_message: "No permission for Item"`). This is a bench permission gap, not a
  frontend fault. The UI renders its safe generic error state and leaks nothing.
  **`CatalogItemDto` therefore remains source-verified only** - no real item has ever
  been observed on the wire.
- That response also carried `_server_messages` and `_error_message` beside `message`;
  the network layer ignored both and normalised correctly.

### Media paths - decision

`thumbnail`, `banner` and `image` are Frappe `Attach Image` fields and the backend's
`get_url()` calls are commented out, so raw stored values are returned - normally
root-relative (`/files/…`), which resolve same-origin and are already proxied. **No
normalization helper was added**: a root-relative path is directly usable as `src`.
All Phase 8 fixtures use `null` images because no non-null value has ever been
observed, and inventing one would point at a file that does not exist. Components
handle both branches and are unit-tested for each. Open: whether a full absolute URL
can ever be stored.

## CONFIRMED - Login page (Phase 7, 2026-08-10)

- `domains/access/pages/login-page.ts` is the first real user journey: guest -> sign in
  -> `SessionStore` authenticated -> sanitized return URL or `/catalog` -> SecureShell.
- The page calls **only** `SessionStore.signInWithPassword`. No `HttpClient`, no
  `AuthApi`, no `YobApiClient`, no knowledge of Frappe, CSRF or the `application` code.
  It behaves identically against the mock and the real backend.
- Built on **Signal Forms** (`@angular/forms/signals`), verified `@publicApi 22.0` -
  stable, not preview. `submit()` supplies validation, touch-on-submit and the
  `submitting` state, so duplicate-submit prevention is the framework's, not a flag of
  ours. Note: Signal Forms manages the `name` attribute; setting it manually is an
  NG8022 compile error.
- Validation is `required` on username and password only. No email rule - the backend
  takes a username/identifier, not a guaranteed email.
- Error mapping lives in `domains/access/login-error-message.ts`, keyed on `code`
  alone. Backend `detail` is never echoed. `invalid_credentials` is deliberately vague
  so the form cannot be used to test whether an account exists. No rate-limit countdown
  - the backend supplies no retry duration.
- `@angular/localize` installed via `ng add`. All user-facing text carries explicit
  i18n ids. **Rule: new user-facing text is localization-ready from first
  implementation.** No language switcher, no runtime translation service.
- Return URLs use the existing `sanitizeReturnUrl` everywhere - guard, sign-in page and
  the already-authenticated redirect. No second mechanism.
- The Phase 5 secure-shell browser gap is **closed**: sign-in now reaches SecureShell
  in a real browser, verified at all three viewports for overflow, nav wrapping,
  routed content and client-side navigation.

### Known limitation - mock server session and page reload

`MockServerSession` is in-memory, so a full page load restarts it and the mock forgets
the user. Browser tests that need an authenticated session across a document load are
therefore not possible; the already-authenticated case is covered via Back navigation
(client-side popstate) and by unit tests. Making the mock survive a reload would mean
writing auth state into browser storage, and the assertions that nothing does that are
worth more. Restore-after-reload is covered by `mock-api.session.spec.ts` and, against
the real backend, by `scripts/live-smoke.mjs`.

## CONFIRMED - UI foundation strategy (Phase 6.5, 2026-08-10)

- **UI implementation decision order is now policy**: native HTML -> Angular Aria ->
  Angular CDK -> Tailwind -> small YOB `design`/`widgets` abstraction -> third-party
  library only when justified. Recorded in `docs/ARCHITECTURE.md` 6z.
- Never hand-write keyboard navigation, focus trapping, ARIA interaction patterns or
  popup positioning. Check Angular Aria/CDK first - especially for autocomplete,
  combobox, select/listbox, menu, tabs, accordion, tree, grid, dialog, overlay.
- Aria/CDK are implementation tools **underneath** `design/`, `widgets/` and
  `domains/`. Pages must not couple directly to low-level Aria/CDK APIs where a
  reusable widget belongs.
- `@angular/aria` and `@angular/cdk` are **not installed, deliberately**. Both are
  22.1.1 and compatible with our Angular 22.1.1; Aria takes CDK as a peer dependency.
  Nothing built so far needs them. Approved as first-choice tools, to be installed
  with the first real requirement.
- **Angular Material is not the YOB visual system** and must not become the default
  component architecture. Case-by-case evaluation for a single complex control only,
  with written justification.
- No broad UI suite (PrimeNG or similar). Criteria for evaluating any third-party
  library are recorded in `docs/ARCHITECTURE.md` 6z.
- Button refactored from `<app-button>` wrapper to `button[yob-button]`, an
  attribute-selector component on the native element. `display: contents` is gone;
  native `type`, `form`, `name`, `value` and implicit form submission all work
  directly. `type` is no longer an input, so the **native default applies** - a bare
  `<button yob-button>` inside a form submits it.
- `field` reviewed and intentionally retained, including its `querySelector`. Its
  single-control contract is now documented in the source.

## CONFIRMED - Design foundation (Phase 6, 2026-08-10)

- `src/app/design/` holds exactly five primitives: `button`, `field`, `alert`,
  `spinner`, `empty-state`. None knows about auth, catalog, cart, orders, Frappe or
  HTTP, and none holds business state.
- **One button treatment.** No `variant`, `size`, `colour` or `width` inputs. Restyling
  means editing the Tailwind classes; a second treatment gets added when a real screen
  needs one, not before. The same rule applies to every primitive.
- `field` wraps the projected native control in its `<label>` for implicit association,
  and sets `aria-describedby` / `aria-invalid` on it. The control stays native, so
  `formControlName`, Signal Forms and validators work unchanged - there is no
  `ControlValueAccessor` and no form framework underneath.
- `alert`'s `tone` drives the ARIA role (`alert` for errors, `status` otherwise), which
  is why it is an input rather than a styling knob.
- `src/styles.css` gained one global rule: a `:focus-visible` outline, as an
  accessibility floor for the whole application.
- `/__design` is a development-only gallery routed via `AppEnvironment.devRoutes`.
  Production supplies `[]` and never imports it - verified absent from the production
  bundle. Browser-verified at all three viewports.
- Deliberately not built: theme/token config, notification service, card/badge/dialog/
  drawer/pagination/skeleton, design barrel file. See `docs/ARCHITECTURE.md` 6a.

## CONFIRMED - Playwright E2E baseline (2026-08-10)

- `npm run e2e` runs Chromium at three viewports (390x844, 768x1024, 1440x900) and
  starts its own dev server; nothing needs to be running first.
- E2E uses a dedicated **mock** serve target on port 4300
  (`ng serve --configuration mock`, `src/environments/environment.mock.ts`) so the
  session resolves deterministically without a Frappe bench. Ordinary `ng serve` on
  4200 still points at the real edge and `scripts/live-smoke.mjs` is unchanged.
- Browser-verified at all three viewports: public shell renders `/login`, `/terms`,
  `/session-unavailable` and not-found; a guest hitting `/catalog` is redirected to
  `/login?returnUrl=%2Fcatalog`; deep URLs keep their query string; external return
  URLs are discarded; navigation is client-side; no horizontal overflow anywhere.
- Locators are roles/text/`data-testid`. No Tailwind classes, and no screenshot
  snapshots while the design is placeholder-level.
- **Gap:** the secure shell and `SecureNav` are not browser-verified, because no UI can
  authenticate yet. They are covered by unit tests via `RouterTestingHarness`. Add
  browser coverage when the sign-in form lands in Phase 7.

### Deliberately deferred from Phase 3 - now RESOLVED

- **The secure route guard.** Deferred in Phase 3 because it needed route branches and
  a sign-in route to redirect to. Delivered in Phase 5 as
  `foundation/session/session.guard.ts`.

## ASSUMPTIONS TO VERIFY EARLY

- Angular built-in localization is sufficient because there is no runtime language switch.
- Angular signals are sufficient for initial state architecture; NgRx is not needed initially.

Resolved and implemented: the `/api` dev proxy works end to end, verified with a real
session through the running dev server. It targets `http://127.0.0.1:8080` and
asserts `Host: storefront.local` explicitly, because the edge selects its vhost from
the Host header while that name resolves nowhere in WSL. `changeOrigin` must stay
off - it would overwrite the Host after `headers` is applied. See
`proxy.conf.json` and `docs/API-CONTRACT.md` §10a.

Remaining caveat: browsing the SPA *as* `http://storefront.local:4200` still needs a
hosts entry on the machine running the browser. `localhost:4200` works without one.

## OPEN API VERIFICATION ITEMS

The local bench has **no catalog, order, address or contact data**, so the following
are verified from the installed backend implementation but never observed on the wire.
They are safe to type against, but must be re-captured once demo data is seeded and
before the affected DTOs and mock fixtures are frozen:

- successful `get_category` response (group vs leaf)
- successful `get_item` response (resolves the old error-body example; note the slug
  field is `custom_slug` here but `slug` in `get_category` item rows)
- non-empty `get_cart` - specifically the **line-item shape inside `cart.items`**
- complete `get_order_details` success shape (items and payment-log sections)
- `proceed_to_payment` success response (not triggered: it creates a real Payment
  Request)
- `request_otp` / `login_with_otp` success payloads - OTP is not exercisable here

Genuinely still unknown:

- allowed **values** for `address_type`, `gst_category`, `tax_category` (field names
  are now known)
- intended cart quantity-update behavior beyond `add_to_cart(item_code, qty)` and
  remove operations - still not documented anywhere; do not invent semantics

Backend defects noticed during verification, to raise rather than work around:

- `get_item`'s `try/except` is commented out in `catalog.py`, so an unexpected fault
  escapes as a raw Frappe 500 instead of the YOB envelope.
- `get_url()` is commented out for `thumbnail`, `banner` and `image`, so the API
  returns raw stored paths and the frontend must resolve them to URLs.

## DEFERRED UNTIL A REAL NEED APPEARS

- runtime tenant/client system
- plugin architecture
- page override registry
- layout configuration engine
- theme configuration engine
- feature enable/disable configuration
- NgRx
- Angular Material visual design system
- SSR
- PWA/offline storefront
- automatic OpenAPI client generation
- large prebuilt design system

## DECISION RULE

If a future requirement makes a deferred item genuinely useful, reconsider it based on the actual code and requirement rather than treating this list as a permanent ban.
