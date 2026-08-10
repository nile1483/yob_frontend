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
