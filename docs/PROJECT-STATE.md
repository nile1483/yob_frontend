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
- Only the normalised `client_session_required` counts as guest during restore. A 500,
  an outage, or `application_access_denied` must not sign a user out - all three are
  covered by tests.
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

### Deliberately deferred from Phase 3

- **The secure route guard.** Build plan Phase 3 lists it, but it cannot be wired
  without route branches (Phase 5) and a sign-in route to redirect to (Phase 7).
  `SessionStore.isAuthenticated` / `isResolved` are the hooks it will use.

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
