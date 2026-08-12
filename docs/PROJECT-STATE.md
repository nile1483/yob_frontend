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

## CONFIRMED - API Source

- Current API reference is `reference/api/openapi.json` and `reference/api/postman_collection.json`.
- Both references contain 33 operations.
- API style is Frappe RPC under `/api/method/...`.
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
