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
