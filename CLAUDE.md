# YOB Frontend - Project Instructions

## Purpose

`yob-frontend` is a reusable Angular storefront master application for Your Order Book.
It is copied for a client, then developers/designers directly adjust HTML, Tailwind/CSS, routes, assets, and client-specific behavior as needed.

This is NOT a runtime multi-tenant system and NOT a configurable website builder.
Prefer reusable code and clear source changes over large configuration systems.

## Sources of Truth

Before API-related work, read:
- `reference/api/openapi.json`
- `reference/api/postman_collection.json`
- `docs/API-CONTRACT.md`

Before architecture changes, read:
- `docs/ARCHITECTURE.md`
- `docs/PROJECT-STATE.md`
- `docs/CHANGE-WORKFLOW.md`

Do not invent API fields, response shapes, request bodies, or business rules that are not documented or verified.

## Architecture Vocabulary

Use these application-level names consistently:
- `foundation` - technical application infrastructure
- `shells` - public and authenticated page structures
- `design` - reusable visual building blocks with no business/API knowledge
- `widgets` - reusable functional UI used in multiple places
- `domains` - business areas such as catalog, cart, orders, checkout
- `pages` - routed views inside a domain
- `parts` - domain-specific reusable UI inside a domain
- `state` - signal-based domain/session state
- `data` - API calls, DTOs, response normalization, mapping when genuinely needed
- `fixtures` - mock/test data

Do not create generic business architecture folders named `components`, `modules`, `libraries`, `helpers`, or `misc`.
Angular classes may still technically be components/services/directives; the restriction is about our application architecture naming.

## Intended Structure

```text
src/app/
  foundation/
  shells/
  design/
  widgets/
  domains/
  app.routes.ts
src/mock-api/
src/styles/
src/environments/
```

A larger domain may use:

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

Do not create every folder for tiny domains. Add structure only when it has real content.

## Reuse Rules

Before creating new UI or behavior, check in this order:
1. Can an existing item in `design/` solve it?
2. Can an existing item in `widgets/` solve it?
3. Can an existing `parts/` item in the current domain solve it?
4. Only then create a new reusable piece.

Examples:
- button/input/autocomplete/modal -> `design/`
- customer search/country select/item picker -> `widgets/`
- catalog item card/cart summary/order row -> domain `parts/`

Do not duplicate API-backed widgets on multiple pages.

## Customization Philosophy

Do not make visual or ordinary page choices configurable just because they can be.

Prefer direct source changes for:
- header markup and arrangement
- navigation placement
- Tailwind classes
- CSS
- spacing
- typography
- showing/hiding ordinary page fields
- adding/removing optional pages/domains in a copied client project

Use technical configuration only when it is genuinely application-wide, such as:
- API/proxy/environment values
- mock API on/off
- locale/currency defaults when technically required

When a copied client needs a genuinely different page or part, modify/replace it directly in that copied project.
Do not build a plugin/override engine unless a repeated real-world need appears.

## Angular Rules

Use the Angular version installed in this project and follow current official Angular best practices.
For Angular 22+:
- strict TypeScript
- standalone APIs; do not create NgModules for feature organization
- signals for application/UI state
- `computed()` for derived state
- `input()`, `output()`, and `model()` APIs for Angular inputs/outputs when appropriate
- native control flow: `@if`, `@for`, `@switch`
- lazy-load major domain routes
- Signal Forms for new forms when suitable; otherwise typed Reactive Forms
- `inject()` instead of constructor injection
- `NgOptimizedImage` for normal static/product images where applicable
- accessible markup, keyboard support, visible focus, WCAG AA
- no `any` unless an external API makes it unavoidable; prefer `unknown` and narrow it

Do not add NgRx or another global state library unless actual complexity proves signals are insufficient.
Do not add Angular Material as a design dependency by default. Tailwind owns presentation. Add Angular CDK or focused dependencies only when they provide clear value.

## Responsive Rules

Use mobile-first Tailwind/CSS.
The owner of a visual behavior owns its responsive behavior:
- item grid owns its columns
- navigation owns its mobile behavior
- shell owns overall page structure

Do not create breakpoint configuration objects for ordinary visual layout.
Use JavaScript/CDK breakpoint logic only when behavior, not just styling, must change.

## YOB API Rules

The API is Frappe RPC-style under `/api/method/...`.
The browser should call same-origin `/api/...` through the configured edge/dev proxy whenever possible.

Centralize common Frappe/YOB handling in `foundation/network`:
- prefix `/api/method/`
- unwrap Frappe outer `message`
- preserve YOB inner `data`, `notice`, `meta`, or `errors[]`
- normalize API failures to one typed frontend error shape
- add CSRF token to authenticated mutating requests when a token exists

Authentication:
- browser-managed Frappe `sid` cookie is the session source
- never copy/store `sid` manually in localStorage
- CSRF token comes from login/session context and belongs in session state
- session restore uses `get_session_context`
- do not set `X-YOB-Original-Host` in browser code; requests must pass through the edge proxy that owns that header

Pricing/cart:
- backend is the source of truth for price, discount, tax, totals, and cart reconciliation
- do not reproduce pricing rules in Angular
- quantity-sensitive catalog endpoints must be called again when quantity affects pricing

API typing:
- type documented request/response fields exactly
- matching backend snake_case is acceptable in DTOs
- only add mapper/view-model layers when they solve a real mismatch
- do not generate fake fields to make a UI easier

## Mock API Rules

Mock mode must reproduce the same HTTP method, URL, outer Frappe `message` wrapper, YOB envelope, status codes, and documented errors as the real API.

Application pages/data files must not know whether mock mode is active.
The same domain API method must work against mock and real backends.

Support useful scenarios where applicable:
- normal
- empty
- slow
- validation/error
- unauthenticated/forbidden
- not found
- server error

Unit tests should normally use Angular HTTP testing utilities rather than the development mock server.

## Routing Rules

Maintain two clear route branches:
- public: sign-in, legal/static pages, token-based public payment flow
- secure: catalog, cart, account, orders, checkout, addresses, authenticated payment methods, etc.

Protect the secure branch at the routing boundary. Do not repeat login checks inside every page.
Preserve the intended secure URL through sign-in when practical.

## Testing and Quality Gate

For every meaningful change:
1. inspect existing patterns first
2. state assumptions if source information is incomplete
3. make the smallest correct change
4. add/update tests
5. run affected tests
6. run production build
7. run relevant E2E tests once E2E exists
8. check responsive behavior for changed UI
9. report files changed, tests run, and unresolved risks

Never delete or weaken a legitimate test merely to make the build green.
Never silently continue after a failed quality gate.

## Assumptions Discipline

For architectural/API work, summarize before implementation when useful:
- CONFIRMED - supported by user/project/source
- ASSUMPTIONS - necessary inference not yet verified
- OPEN - blocks or materially affects implementation
- DEFERRED - intentionally not part of this change

Update `docs/PROJECT-STATE.md` when a project-level assumption becomes confirmed or invalid.

## AI Working Style

Do not rebuild the whole application in one pass.
Work vertically and incrementally, following `docs/BUILD-PLAN.md`.
A completed, tested vertical slice is preferred over many half-built pages.

When adding a feature later, inspect similar existing code and reuse established patterns rather than inventing a parallel architecture.
