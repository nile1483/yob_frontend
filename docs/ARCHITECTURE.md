# YOB Frontend Architecture

## 1. Goal

`yob-frontend` is one reusable Angular storefront codebase that serves as a master starting point.

For a new client, the normal workflow is:

```text
copy master
-> replace assets/content
-> adjust HTML/Tailwind/CSS
-> rearrange shell/navigation if needed
-> add/remove/edit pages and domains
-> reuse existing design items/widgets
-> connect to the same YOB API contract
-> build and deploy
```

The architecture optimizes for:

- fast AI-assisted development
- developer friendliness
- reuse
- responsive behavior
- safe incremental changes
- direct overridability in copied projects
- clean API/session handling
- realistic mock development
- low architectural ceremony

It deliberately does NOT optimize for:

- runtime tenant switching
- a website-builder-style configuration engine
- making every visual or business choice configurable
- plugin systems before they are needed
- separate Angular libraries for every reusable item

## 2. Core Principle

Make source code easy to reuse and easy to change.
Do not make every possible change configurable.

A developer/designer should be able to understand and modify the relevant HTML, Tailwind, CSS, route, page, part, or widget directly.

## 3. Top-Level Structure

```text
src/
  app/
    foundation/
    shells/
    design/
    widgets/
    domains/
    app.routes.ts
  mock-api/
  styles/
  environments/
```

Keep this structure small. Add new top-level concepts only when repeated real needs prove they are useful.

## 4. Foundation

`foundation/` contains application-wide technical infrastructure, not ordinary business UI.

Recommended initial areas:

```text
foundation/
  network/
  session/
  errors/
  storage/
  localization/
```

Possible future areas should be added only when needed.

### foundation/network

Owns common Frappe/YOB HTTP behavior:

- API method URL construction
- outer `message` unwrapping
- success/error envelope normalization
- CSRF header behavior
- common request options
- typed network error representation

The goal is that individual domains do not repeat Frappe plumbing.

### foundation/session

Owns:

- authenticated/unknown/guest session state
- current session context
- CSRF token in memory
- restore session from `get_session_context`
- login/logout coordination
- secure route guard

The browser owns the Frappe `sid` cookie. The Angular app does not manually persist that cookie value.

### foundation/errors

Owns generic error normalization/presentation support.
It must not erase domain error codes that pages need to react to.

### foundation/storage

Use only for deliberate frontend persistence, such as harmless UI preferences if they later exist.
Do not use localStorage as a replacement for Frappe session cookies.

### foundation/localization

The application is localization-ready, but there is no runtime language switch requirement.
Use one configured locale/language per copied client project.
Keep date, number, and currency formatting locale-aware.

#### The rule (Phase 7)

**All new user-facing text must be localization-ready from its first implementation.**
Retrofitting translation across a grown application is far more work than marking
strings as they are written, and the strings are about to multiply.

`@angular/localize` is installed (via `ng add`, which wired the polyfill in
`angular.json` and the type reference in `src/main.ts`). Angular's compile-time i18n is
sufficient precisely because the language is chosen per copied project, not at runtime.

- Template text: an `i18n` attribute, with an explicit id -
  `<h1 i18n="@@login.heading">Sign in</h1>`. Attributes use `i18n-<attr>`, for example
  `i18n-label="@@login.username.label"`.
- TypeScript strings: `$localize` with the same id convention -
  ``$localize`:@@login.error.offline:We could not reach the server.` ``
- Ids are explicit and dotted (`login.error.rateLimited`) so a message can be reworded
  without orphaning its translation.

Do **not** add a language switcher, a runtime translation service, a locale
configuration system, or multiple translated builds. None of those are required, and
none are needed to keep text translatable.

## 5. Shells

`shells/` contains the page structure around routed content.

Initial structure:

```text
shells/
  public/
  secure/
```

### Public shell

Used for:

- sign-in
- OTP flow
- terms/privacy/static pages
- public token-based payment flow where appropriate
- error/not-found pages when appropriate

### Secure shell

Used for authenticated storefront pages.

A secure shell can directly compose reusable shell pieces such as:

- brand/logo
- header
- navigation
- search
- account action
- cart action
- optional sidebar
- main content
- footer

Do not create a configuration engine for header/nav placement.
If a copied client needs navigation below the logo rather than beside it, edit the shell composition directly.

Keep shell pieces reusable enough that rearranging them is quick.

## 6. Design

`design/` contains generic visual building blocks.

Examples:

```text
design/
  button/
  input/
  select/
  autocomplete/
  dialog/
  drawer/
  card/
  badge/
  alert/
  pagination/
  skeleton/
  empty-state/
```

A design item:

- may use Angular/CDK/Tailwind
- may expose inputs/outputs
- must not know about customers, items, orders, carts, Frappe endpoints, etc.

Tailwind is an implementation tool. Reusable design items prevent repeated complex markup and interaction behavior.

Do not prematurely create a full design system. Build design items when a real screen/widget needs them.

### 6z. UI implementation decision order

**Before building any complex reusable UI interaction from scratch, check Angular Aria
and the Angular CDK first.** Work down this list and stop at the first step that
solves the problem:

1. **Native HTML.** `<button>`, `<label>`, `<select>`, `<dialog>`, `<details>`,
   `<input type="…">`. Free keyboard handling, free screen-reader semantics, free
   browser and platform behaviour, nothing to maintain.
2. **Angular Aria** (`@angular/aria`) for rich accessible interaction patterns -
   **currently treated as developer preview**, see 6y. Headless directives
   implementing WAI-ARIA patterns - keyboard interaction, ARIA attributes, focus
   management, typeahead - with no styling of their own. That last point is why it
   suits this project: we keep the HTML and the Tailwind.
3. **Angular CDK** (`@angular/cdk`) for behaviour infrastructure: overlay and
   positioning, focus trap and `FocusMonitor`, portals, `Dialog`, drag and drop,
   virtual scrolling, `LiveAnnouncer`, layout/breakpoint observers.
4. **Tailwind/CSS** for appearance and responsive behaviour. Always ours.
5. **A YOB `design/` element or `widgets/` item** wrapping the above in a small
   application-facing API, so pages stay readable.
6. **A third-party library**, evaluated case by case, only when the steps above are
   genuinely insufficient.

Do **not** hand-write keyboard navigation, roving tabindex, focus trapping, ARIA
interaction patterns, or popup positioning. Those are the parts everyone gets subtly
wrong, and they are exactly what Aria and the CDK already solve. Reach for them for:

```text
autocomplete   combobox   select / listbox   menu / menubar   toolbar
tabs           accordion  tree               grid
dialog         overlay    focus trapping     keyboard navigation
```

#### Layering

Aria and the CDK are **implementation tools underneath our layers**, not a replacement
for them. Pages and domains should not couple directly to low-level Aria/CDK APIs
where a reusable widget belongs:

```text
Customer Search widget -> Angular Aria combobox/autocomplete -> CDK overlay -> customer API -> Tailwind
Country Select widget  -> Angular Aria listbox/select -> Tailwind
Account menu           -> Angular Aria menu -> Tailwind
Dialog                 -> CDK dialog/overlay/focus trap -> our HTML + Tailwind
```

`design/` stays generic presentation, `widgets/` stays reusable business-aware UI, and
`domains/` stays business areas. Aria and CDK live inside those, not beside them.

#### Angular Material

**Not adopted as the YOB visual system, and it must not become the default component
architecture.** It ships its own styling and theming, which competes directly with
Tailwind and with the "edit the markup" customisation model this project is built on.

It may be evaluated **case by case** for a single complex control where the mature
implementation clearly saves substantial work and still permits our styling. That is a
per-control decision with a written justification, never a blanket dependency.

#### Other libraries

No broad UI suite (PrimeNG, and the like). Do not add a dependency because it contains
many components. Evaluate one only when all of these hold:

- native HTML plus Angular Aria/CDK are genuinely insufficient
- it supports the installed Angular version
- it is actively maintained
- its licence is acceptable
- it does not obstruct direct Tailwind/CSS customisation
- it materially reduces implementation and maintenance effort

### 6y. Aria/CDK dependency status

Neither is installed, deliberately.

| Package | Latest | Peer requirements | Compatible with Angular 22.1.1 |
| --- | --- | --- | --- |
| `@angular/aria` | 22.1.1 | `@angular/cdk@22.1.1`, `@angular/core ^22 \|\| ^23` | Yes |
| `@angular/cdk` | 22.1.1 | `@angular/core ^22 \|\| ^23` | Yes |

Verified against the npm registry and angular.dev during the Phase 6.5 review. Note
that `@angular/aria` takes `@angular/cdk` as a peer dependency, so adopting Aria means
adding both.

#### Angular Aria is treated as developer preview

angular.dev labels it "New" and states no stability guarantee. Until that changes, it
is held to developer-preview rules:

- **Check it** whenever a complex accessible interaction is needed - it is still the
  first thing to reach for ahead of hand-writing one.
- **Re-check its current stability** immediately before the first actual production
  use, not just at design time. A preview API can change shape between releases.
- **Isolate it behind a YOB `design/` or `widgets/` abstraction.** If Aria churns, the
  blast radius must be one primitive, not every page that used it.
- **Domains must not depend on Aria implementation details** - no Aria types, tokens
  or directives leaking into a page or a domain service where a widget belongs.
- **Angular CDK is not under the same caution.** Its primitives (overlay, focus trap,
  portals, dialog, `LiveAnnouncer`) are long-stable and may be used directly where
  they solve the requirement, still preferring a small YOB wrapper for reuse.
- **Neither is installed yet.** Phase 7 does not need them.

Nothing built so far needs either: `button`, `field`, `alert`, `spinner` and
`empty-state` are native HTML plus Tailwind, with no overlay, focus trapping, popup
positioning or custom keyboard behaviour between them. They are recorded here as the
**approved first-choice tools**, to be installed with the first real requirement -
autocomplete, select, menu, dialog, overlay or similar - and not before. Installing
them now would add two unused dependencies and a version-alignment obligation for no
benefit.

### 6a. What exists today (Phase 6)

```text
design/
  button/        styles a native <button> via `yob-button`; disabled + loading
  field/         label + projected native control + hint + error
  alert/         inline message; tone drives the ARIA role
  spinner/       loading indicator, announced or decorative
  empty-state/   layout for "nothing here"; all wording projected
```

Each knows nothing about authentication, catalog, cart, orders, Frappe or HTTP, and
none of them holds business state.

**Deliberately not built**, and the reason each would be a mistake today:

| Not created | Why |
| --- | --- |
| `variant` / `size` / `colour` / `width` inputs on button | one treatment covers every screen that exists; a matrix every client half-uses is harder to restyle than the classes themselves |
| A `<app-button>` wrapper element | `button[yob-button]` styles the real element, so native attributes, form submission and keyboard behaviour need no forwarding - and no `display: contents` workaround |
| A theme or token TypeScript config | Tailwind already is the theme layer; a second one to keep in sync buys nothing |
| `ControlValueAccessor` on `field` | it would hide Angular's form APIs behind an abstraction with no purpose - the projected control stays native |
| A notification/toast service | `alert` renders where it is placed; queues, timeouts and positioning are a different component and are not needed yet |
| Card, badge, dialog, drawer, pagination, skeleton | nothing needs them; build each when a real screen does |
| A barrel `index.ts` | direct imports keep the dependency visible |

The rule for adding one: a real screen needs it now. Not "the login page might".

### 6b. Field accessibility

`field` puts the projected control **inside** the `<label>`, so the two are associated
implicitly - no `id`/`for` pair for a caller to get wrong, and nothing to remember.

It also sets `aria-describedby` and `aria-invalid` on the projected control by finding
it in the DOM. That is the only DOM reaching in `design/`, and it exists because the
alternative is asking every caller to wire message ids by hand, which is the step
people forget. Error text additionally carries `role="alert"` so it is announced when
it appears rather than only when the control is next focused.

### 6c. Global CSS

`src/styles.css` holds one rule beyond the Tailwind import: a `:focus-visible`
outline. It is global because it is an accessibility floor for the whole application -
browsers style focus inconsistently, and any component that forgot its own ring would
silently become unusable by keyboard. Almost everything else belongs in the template
it affects, where a designer can find it.

### 6d. Browser verification

`/__design` is a development-only gallery (`src/dev/design-gallery.ts`), contributed
through `AppEnvironment.devRoutes`. Production supplies `[]` and never imports it, so
it is absent from a production bundle rather than merely unreachable - the same
mechanism that keeps the mock API out. `e2e/design.spec.ts` drives it at all three
viewports.

### 6r. Catalog: the reference domain

`domains/catalog/` is the worked example. Copy its shape when adding a domain.

```text
domains/catalog/
  contracts/catalog.types.ts   API DTOs + the one mapped model
  data/catalog.api.ts          RPC calls over YobApiClient
  parts/category-card.ts       catalog-specific reusable UI
  parts/item-card.ts
  pages/catalog-page.ts        /catalog
  pages/category-page.ts       /catalog/:categorySlug
  catalog.routes.ts            lazy, one entry per page
```

There is no `state/` folder, deliberately - see below. Do not create one to match a
template.

**Contracts.** DTOs keep backend field names, including snake_case and `0`/`1` check
fields. Shapes that differ on the wire are typed separately even when they look
similar: a `get_categories` row and a `get_category` subcategory row are not the same
object, and merging them into an optimistic union is how a template ends up rendering
`undefined`.

**Mapping only where it pays.** `CategoryLink` exists because one card renders both
category shapes - without it the card takes a union and picks fields defensively.
Items get no model at all: `CatalogItemDto` is already what the card needs, and a
model that only renamed fields would be ceremony. Map when it removes a real problem.

**Data.** One small service per domain over `YobApiClient`. No `HttpClient`, no
envelope handling, no mock awareness, no pricing arithmetic. Endpoint-shaped methods,
not a generic repository.

**State: page-local, no store.** Both pages hold their data in an `rxResource`. Nothing
else reads catalog data, it is entirely route-derived, and a store would immediately
owe a cache-invalidation policy for a problem that does not exist. `rxResource` gives
loading, error and value as signals and disposes with the page. The trigger for
promoting to a store is two real consumers of the same data - not "domains usually
have stores".

**Every state is handled.** Loading, populated, empty, not-found and failed are each a
distinct branch. Not-found branches on the stable `category_not_found` code, never on
the 404 status alone, so it stays distinct from a generic failure. No backend wording
ever reaches the screen.

**Pricing is displayed, never derived.** Backend numbers only. The single piece of
logic is comparing `rate` with `base_price` to decide whether to decorate a discount -
a comparison of two backend values, not a calculation. Currency goes through
`CurrencyPipe` with an injected code, never string concatenation.

## 7. Widgets

`widgets/` contains reusable functional UI that can be used across unrelated pages/domains.

Examples:

```text
widgets/
  country-select/
  customer-search/
  item-search/
  address-picker/
  contact-picker/
```

A widget may contain:

- Angular UI implementation
- local signal state
- a small focused API/data file if the widget owns that reusable lookup behavior
- its own tests

Example:

```text
Order page
  -> Customer Search widget
      -> Design Autocomplete
      -> customer search API
```

If the same behavior is needed in quotation/payment/order pages, reuse the widget rather than rebuilding an autocomplete/API call.

Do not create widgets for one-off page fragments. Those belong in domain `parts/` until reuse is real.

## 8. Domains

`domains/` contains business areas.

Initial domains based on current requirements/API include roughly:

```text
domains/
  access/
  catalog/
  cart/
  account/
  checkout/
  orders/
  payment/
  content/
```

Address/contact behavior can initially live under `account/` and/or `checkout/` depending on the user experience. Promote shared selectors to widgets when the same interaction is reused.

A larger domain can use:

```text
domains/catalog/
  pages/
  parts/
  state/
  data/
  contracts/
  fixtures/
  catalog.routes.ts
```

Do not create empty folders simply to satisfy a template.

### pages

Routed views.

Examples:

- catalog listing
- category page
- item detail
- cart
- order list
- order detail

Pages coordinate state, widgets, domain parts, and routing. They should not contain raw HttpClient calls.

### parts

Reusable UI that belongs specifically to one domain.

Examples:

- catalog item card
- pricing block
- cart line
- cart totals
- order row

If a part becomes broadly reusable across domains, consider promoting it to `widgets/` or `design/` depending on whether it is functional/business-aware or purely visual.

### state

Use signals for domain state when state is more than trivial page-local data.

Examples:

- cart state
- catalog filter/result state
- session state

Use `computed()` for derived values.
Do not duplicate server-derived totals/pricing calculations as competing sources of truth.

### data

Contains domain-specific network access and DTO types.

Prefer focused files such as:

```text
catalog.api.ts
catalog.types.ts
cart.api.ts
cart.types.ts
```

Do not create a giant `ApiService` with every endpoint.

Do not create mapping layers automatically. If backend DTOs are already suitable for the UI, using the typed DTO directly is acceptable. Add mapping/view-model code only when there is a real frontend/backend mismatch.

### contracts

Use when the domain has stable application-facing types that are meaningfully different from raw API DTOs or shared across multiple parts of the domain.
Do not duplicate types unnecessarily between `data/` and `contracts/`.

### fixtures

Realistic mock/test data for that domain.
Fixtures must respect verified API shapes.

## 9. Dependency Direction

Typical page flow:

```text
Page
  -> Domain Part / Widget / Design item
  -> State when needed
  -> Domain API file
  -> foundation/network
  -> Angular HttpClient
  -> YOB/Frappe edge API
```

Rules:

- pages/parts/widgets do not call raw HttpClient directly
- common Frappe behavior stays in `foundation/network`
- business pricing/tax/cart rules stay on the backend
- design does not depend on domains
- foundation does not depend on domain UI
- do not create circular dependencies to achieve reuse

## 10. Routing

Use two conceptual route branches.

```text
PUBLIC
  sign-in
  OTP
  legal/static content
  token-based public payment

SECURE
  catalog
  item detail
  cart
  checkout
  account/address/contact
  orders
  authenticated payment methods
```

Protect the secure branch centrally with a session guard.

Lazy-load major domain routes.
Do not use Angular NgModules for route organization.

The current API marks public payment-token endpoints as unauthenticated. Keep that route separate from the authenticated checkout flow.

## 11. Responsive Design

Use mobile-first Tailwind/CSS.

Test at minimum:

- small phone
- larger phone/tablet
- laptop
- wide desktop

Responsive ownership examples:

- Item grid owns grid columns/gaps.
- Navigation owns collapse/drawer behavior.
- Header owns its own wrapping/alignment.
- Secure shell owns overall content/sidebar behavior.

Avoid JavaScript breakpoint logic when CSS can solve the problem.

## 12. Styling and Client Customization

For a copied client project, developers/designers should directly change:

- logo and assets
- HTML composition
- Tailwind classes
- global CSS
- colors/fonts/spacing
- shell structure
- route/navigation contents
- domain/page/part contents

Do not create configuration for obvious source edits such as:

- showSku
- showPrice
- eventsEnabled
- documentsEnabled
- navigationPosition
- logoWidth
- cardRadius

If a pattern is reused repeatedly across many copied projects, only then consider extracting a small reusable setting or variant.

## 13. Localization

No language switcher is required.

Use a project-level locale and translation workflow that keeps user-visible strings out of duplicated business logic.
Angular built-in localization is sufficient for the initial architecture because language changes occur per project/build rather than dynamically at runtime.

Do not hard-code formatting rules such as INR symbols or date strings inside pages. Use locale-aware formatting and server-provided currency where relevant.

## 14. State Management

Start with Angular signals.

Use:

- local signals for page/widget state
- focused signal stores/services for session, cart, and other shared domain state
- RxJS naturally for HttpClient and event streams where it fits

Do not add NgRx initially.
If later complexity demonstrates a genuine need for a larger state/event architecture, make that decision based on actual code, not anticipated scale.

## 15. Forms

For Angular 22+, prefer stable Signal Forms for new forms when they fit the controls and validation needs.
Use typed Reactive Forms when integration or workflow makes them clearer.

Forms must support:

- typed values
- server field errors
- disabled/submitting state
- accessible labels/errors
- keyboard behavior
- no double-submit

Do not invent address/contact request fields that are missing from the current API contract. Verify them first.

## 16. Performance

Start with straightforward good practices:

- lazy route loading
- NgOptimizedImage for suitable images
- do not fetch data multiple times accidentally
- debounce real search widgets
- cancel/supersede obsolete search requests
- avoid huge initial bundles
- use server pagination/filtering when API supports it
- keep templates simple

Do not prematurely build caching frameworks or complex memoization layers.

## 17. Accessibility

Professional completion requires:

- semantic HTML
- labels for form controls
- keyboard access
- visible focus
- correct dialog/drawer focus handling
- sufficient contrast
- meaningful alt text
- ARIA only where native semantics are insufficient
- automated accessibility checks in important E2E flows when practical

## 18. Overridability

Overridability comes from clear source boundaries, not an override framework.

For a copied client:

```text
visual difference -> edit design/page/shell HTML + Tailwind/CSS
layout difference -> edit shell composition
reusable lookup/control -> reuse or edit widget
business page difference -> edit/replace page or domain part
new business area -> add a domain
technical API/session issue -> foundation
```

This is intentionally simpler than a runtime plugin/tenant architecture.

## 19. When to Abstract

Use the rule of two/three real uses rather than predicting every future client.

Good abstraction triggers:

- same functional UI appears in multiple unrelated pages -> widget
- same visual interaction appears repeatedly -> design
- same domain fragment repeats -> domain part
- same Frappe transport behavior repeats -> foundation

Bad abstraction triggers:

- "a future client might possibly need it"
- "this could be configurable"
- "a template framework usually has this"

## 19a. Routing and shells (Phase 5)

### The route tree

```text
/                        redirect -> /catalog

PUBLIC   PublicShell, no guard
  /login                 domains/access
  /terms                 domains/content
  /session-unavailable   domains/content

SECURE   SecureShell, secureRouteGuard
  /catalog               domains/catalog
  /account               domains/account

**                       not-found, rendered inside PublicShell
```

Both branches sit at `path: ''`, which is what lets each own a shell without
prefixing URLs. The router tries them in order and backtracks when no child matches,
so **order carries meaning**:

1. the root redirect is `pathMatch: 'full'`, so it claims only the empty URL
2. public precedes secure, so `/login` can never be swallowed by the guard
3. not-found is last - a `**` child inside an earlier shell would match every URL and
   the secure branch would never be reached

### Conventions future domains must follow

- A domain owns a `<domain>.routes.ts` exporting `UPPER_SNAKE_ROUTES`, and is attached
  with `loadChildren`. Adding a business area is one entry in `app.routes.ts`; removing
  one in a copied client is deleting that entry.
- Pages are attached with `loadComponent` so each is its own chunk.
- **Access control belongs to the branch, never to a page.** No page repeats a login
  check; putting one there creates a second answer to a question the guard already
  settled.
- Routed views live in `domains/<name>/pages/`. Do not create `state/`, `data/` or
  `parts/` until there is something to put in them.

### Guard

`secureRouteGuard` reads `SessionStore` and issues no HTTP request. The app
initializer resolved the session before the first navigation, and re-asking per route
change would put a round trip in front of every click while creating a competing
source of truth.

It branches three ways, because the session status is not a boolean:

| Status | Result |
| --- | --- |
| `authenticated` | allow |
| `guest` | `/login?returnUrl=<original>` |
| anything else | `/session-unavailable` |

The third case is the important one. An unresolved session means a backend outage, a
timeout, or `application_access_denied` from a misconfigured proxy - the user's
credentials are fine, so sending them to sign in would be a lie, would not help, and
would invite a loop when the next restore fails identically.

`/login` and `/session-unavailable` are the only paths the guard names. Both are
structural, both public, so neither redirect can re-enter the guard.

### Return URLs

`sanitizeReturnUrl` (`foundation/session/return-url.ts`) accepts only local
application paths. The parameter is attacker-supplied - anyone can hand out
`…/login?returnUrl=https://phish.example` - so absolute URLs, protocol-relative `//`
and `/\` forms, embedded schemes, backslashes and control characters are all rejected.
A rejected value becomes `null`, which callers treat as "no destination requested" and
replace with their own default, so a hostile link degrades to an ordinary sign-in.

Anything that consumes a return URL must pass it through this function, including the
real sign-in page when it lands.

### Shells

`shells/public/public-shell.ts` and `shells/secure/secure-shell.ts` provide structure
and nothing else. The secure shell composes brand, `SecureNav`, an account area,
routed content and footer; moving navigation is relocating an element in that
template. There is no `navigationPosition`, `headerVariant` or `sidebarEnabled`, and
adding one would be the wrong fix - **the markup is the configuration surface**, and
it is meant to be edited directly in a copied client project.

`SecureNav` is a separate part so it can be moved or replaced without touching the
rest of the shell. Its links are literal; a copied client that does not need one
deletes the anchor rather than toggling a setting.

The shells read `SessionStore` only to display who is signed in.

## 19b. End-to-end testing (Playwright baseline)

```text
e2e/
  routing.spec.ts     route branches, shell selection, guard redirect, SPA navigation
  layout.spec.ts      horizontal overflow and structural usability per viewport
  support/layout.ts   shared layout assertions
  tsconfig.json       E2E runs in Node, deliberately outside tsconfig.app.json
playwright.config.ts
```

Run with `npm run e2e`. Nothing needs to be started first - Playwright's `webServer`
starts the dev server itself and shuts it down afterwards.

### Chromium only, three viewports

```text
chromium-mobile    390 x 844
chromium-tablet    768 x 1024
chromium-desktop   1440 x 900
```

Every spec runs at all three, so a layout that breaks on a phone fails the suite
rather than waiting to be noticed. These are **testing targets only**. The application
has no breakpoint configuration and must not grow one; responsive behaviour belongs to
whichever piece owns the visual behaviour.

### E2E runs against the mock API

`webServer` starts `npm run start:mock` on **port 4300** - `ng serve --configuration
mock`, which swaps in `src/environments/environment.mock.ts`.

Two reasons, both determinism. The session must resolve identically every run: against
the real edge that requires a Frappe bench to be up, and when it is not, session
restore fails and the app lands on `/session-unavailable` instead of the sign-in page.
That is correct behaviour, but it is not what a guest-redirect test is asking about.
The separate port also means a hand-started `ng serve` on 4200, pointed at the real
backend, can never be silently reused by `reuseExistingServer`.

Real-backend verification is a different job, and stays with
`scripts/live-smoke.mjs`.

### Conventions

- **Locators are roles, text and `data-testid`.** Never a Tailwind class: every class
  in the shells is expected to change during the styling phase, and a suite keyed to
  them would have to be rewritten alongside.
- **No screenshot snapshot assertions.** The design is placeholder-level, so snapshots
  would be pure maintenance. Capture screenshots ad hoc for inspection instead.
- Assertion helpers live in `e2e/support/`. `expectNoHorizontalOverflow` compares
  `documentElement.scrollWidth` against the viewport, which catches overflow whatever
  causes it - a fixed width, an unwrapped row, a long unbroken string.

## 20. Mock API (Phase 4)

`src/mock-api/` serves Frappe RPC calls from memory so the frontend can be developed
without the YOB backend.

```text
src/mock-api/
  mock-api.interceptor.ts      matching, dispatch, latency, HTTP event construction
  core/
    mock-handler.ts            MockContext + MockHandler contracts
    mock-reply.ts              envelope builders (success / YOB error / raw Frappe)
    mock-server-session.ts     the mock server's session state
  handlers/
    mock-handlers.ts           registry, keyed by Frappe method name
    auth.handlers.ts           get_session_context, login_with_password, logout
  fixtures/
    session.fixture.ts         development-only user and credentials
  scenarios/
    mock-scenario.ts           server-error switch and latency
```

### The one rule

**Domain code must never branch on mock mode.** No `if (environment.mockApi)` in a
page, a data file or a service; no `MockCatalogService`; no mock-only pages. The mock
replaces the *server*, not the application:

```text
page -> domain data -> YobApiClient -> HttpClient -> yobCsrfInterceptor
                                                  -> mockApiInterceptor OR the network
```

Everything above the interceptor is the production code path, so mock mode exercises
the real unwrapping, the real error normalisation and the real CSRF interceptor. A
mock that returned an already-unwrapped `YobResponse` would defeat the entire
arrangement; handlers therefore always emit the wire shape,
`{message: {data, notice?, meta?}}`.

### Enabling and disabling

One switch, in `src/environments/environment.development.ts`:

```ts
const USE_MOCK_API = false;   // true -> in-memory mock, false -> real edge on :8080
```

Production cannot be switched on at all. `environment.ts` does not import
`src/mock-api`, and `fileReplacements` swaps the whole file, so the mock layer is
*absent* from a production bundle rather than merely disabled. A runtime
`if (mockApi)` would have left handlers and fixtures shipping to real users, one bad
flag away from serving fake data. `AppEnvironment.httpInterceptors` exists purely to
carry that guarantee.

The development bundle does contain the mock layer even when the flag is off, because
the development environment file imports it either way. That is dev-only weight and
does not affect production.

### Adding a handler

Add `<domain>.handlers.ts` under `handlers/`, export a registry object keyed by the
full Frappe method name, and spread it into `MOCK_HANDLERS`. An unregistered method
answers HTTP 501 `mock_handler_not_implemented` rather than falling through to the
network - a session that is half mock and half live is far harder to debug than a
clear stop.

Handlers are plain functions taking a `MockContext`. They receive the request, merged
query parameters, the mock session and the configured application code, so they need
no DI and can be unit-tested directly.

### Fixtures

Fixtures mirror the API DTOs exactly, snake_case included, and are validated against
`reference/api/live/verified-responses.json`. Do not convert them into
frontend-friendly models: a fixture in a different shape than the backend serves means
the mock tests a contract nobody ships. DTO mapping, where a domain genuinely needs
it, belongs in that domain's data layer.

Credentials are obviously fake and use the reserved `.invalid` TLD. Never put a
credential that works against a real system in this repository.

### Scenarios

`MockApiScenario` carries a `server-error` switch and a `latencyMs` value. It is
deliberately not a scenario engine: guest, validation errors and empty collections are
all reachable by making the mock behave normally - do not sign in, send the wrong
password, return an empty fixture - and reaching them that way tests the contract
rather than testing the switch. Latency applies to failures as well as successes.

## 21. Architecture Success Criteria

The architecture is successful when:

- a designer can change layouts/styles without learning a configuration engine
- Claude can identify where new code belongs
- customer/country/item lookup functionality can be reused
- session/CSRF/Frappe envelope logic is implemented once
- mock and real API use the same domain code
- a new domain can be added without reorganizing the app
- copied client projects can directly override pages/shells safely
- tests catch regressions as AI makes changes
- code remains understandable to a human developer without reading a framework manual for our own architecture
