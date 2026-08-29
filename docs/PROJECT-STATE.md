# YOB Frontend Project State

Use this file to keep assumptions visible without turning normal development into heavy documentation.
Update it only for durable project-level facts or important unresolved contract issues.

## CONFIRMED - Cart coupon (Phase 16, 2026-08-14)

**Where it lives.** Coupon UI exists **only on the cart**, in the summary column
directly above Proceed to Checkout, and is **hidden when the cart is empty**. Not on
catalog, item detail, checkout, payment, account or orders. Component:
`domains/cart/parts/coupon-code/`. It is not in `design/` and not a shared widget - it
reads `CartStore` directly and has exactly one caller; it moves if that changes.

**No CouponStore, and none should be added.** The applied coupon *is* cart state. The
backend re-evaluates eligibility on every reprice, so adding an item or a plain
reconciliation can drop or change a coupon; a second copy would be free to disagree
with the totals rendered beside it. `couponCode` / `couponDiscount` are `computed` over
the cart payload.

**The backend owns all money.** Coupon -> Pricing Rule -> item pricing -> discounts ->
taxes -> grand total. The frontend submits a code and renders the cart that comes back.
No percentage, no subtraction, no eligibility rule, no minimum-spend check and no
optimistic total anywhere.

**Two discount fields, never combined:**

| Field | Meaning |
|---|---|
| `total_discount` | item / pricing-rule discount; applies with or without a coupon |
| `coupon_discount` | transaction-level amount the coupon produced |

Verified on the running backend: a genuine coupon moved `coupon_discount` 0 -> 27.00
and `net_total` 135.00 -> 108.00 while `total_discount` stayed 15.00. Rendered as two
rows in the cart summary.

**Canonical synchronisation is mandatory.** `apply_coupon` -> `get_cart` -> ingest;
`remove_coupon` -> `get_cart` -> ingest. A coupon is **never** marked applied from the
mutation reply. Not stylistic: there is a verified backend defect where applying to an
empty cart answers `"Coupon applied successfully"` while the stored `coupon_code` stays
`null`, so believing the mutation would show a coupon that does not exist.
Canonical-read-only makes that defect harmless.

**Exact wire contract** (established by executing the endpoints, not from ERPNext
documentation):

- `yob_storefront.api.cart.apply_coupon` - POST, authenticated, CSRF, body `{ code }`.
  **The parameter is `code`, not `coupon_code`** - the latter is the cart *field*, and
  sending it answers `coupon_code_required`.
- `yob_storefront.api.cart.remove_coupon` - POST, **no fields** (one coupon per cart).
- The server does `(code or "").strip().upper()`, so codes are case-insensitive and
  trimmed. The client sends the buyer's text trimmed but **not** re-cased.
- Applying a second coupon **overwrites** the first. No replacement UX is offered: the
  buyer removes, then applies.
- Checkout inherits the coupon from the cart - `create_sales_order_from_cart` resolves
  `cart.coupon_code` onto the Sales Order. Nothing extra is sent at checkout.

**Backend error codes actually used** (all 422, all `field: "code"`):
`coupon_code_required`, `coupon_invalid`, `coupon_not_active`, `coupon_expired`,
`coupon_usage_limit_reached`, `coupon_not_applicable`, `coupon_minimum_not_met`,
`coupon_maximum_exceeded`, plus `coupon_not_applied` on remove. Each maps to a localized
message; the server's own `detail` is never rendered.

`coupon_minimum_not_met` / `coupon_maximum_exceeded` carry the threshold in
`details.minimum_amount` / `maximum_amount`. **Deliberately not surfaced**:
`YobApiError.context` is a three-key allow-list, and widening a security boundary for a
nicety was not worth it. The message says what to do without the figure. Revisit only if
buyers actually need the number.

**Retry policy - no retries.** No RxJS `retry()` on either mutation. Explicit pending
guard, so a double click or a held Enter produces one request.

- definite business rejection (YOB envelope) -> keep the cart, show the message, **no**
  re-read;
- uncertain outcome (transport failure or 5xx) -> **`get_cart`, never a second
  apply/remove**. If the read succeeds the buyer is told the change could not be
  confirmed and is shown the canonical state; if it also fails they are told the cart
  could not be confirmed at all. Never "that coupon failed" unless it is known.

**Real-backend verification (2026-08-14, `test.localhost`, rolled back).** The full SPA
sequence was executed: apply -> `get_cart` -> remove -> `get_cart`. Applied state,
upper-casing, `coupon_invalid` and removal all behaved as contracted.

**`DEMO10` changes no totals, and that is a fixture problem rather than a bug.** It is
the only "valid" seeded coupon and its Pricing Rule is `coupon_code_based: 0` and
item-level, so it applies with or without the coupon - `coupon_discount` stays `0.00`
and `grand_total` does not move. Proving that totals change is therefore the mock's job.
**Making it verifiable on a real bench needs a `coupon_code_based` transaction-level
Pricing Rule, which is production-like discount configuration and was deliberately NOT
created.** Raise it before relying on real-backend coupon pricing.

**Known non-blocking backend defects** (recorded, not worked around here):

- `apply_coupon` on an empty cart can report success while `coupon_code` stays `null`.
- `apply_coupon` lacks its own `ValidationError` boundary - its `try/except` is
  commented out in `cart.py` - so uncommon `ValidationError` subclasses can escape as
  raw Frappe responses. `remove_coupon` has the boundary; the two are inconsistent.

**Cart semantics unchanged.** `add_to_cart.qty` is still a positive delta, still one row
per `item_code`, still non-idempotent, and cart quantity is still display-only.

**Two pre-existing tests were narrowed, not deleted.** `cart-page.spec.ts` and
`cart.spec.ts` each asserted the cart page contained no `input` at all, as a proxy for
"quantity is not editable". That was true by coincidence until a coupon field existed.
Both are now scoped to `cart-lines`, which is what they were actually claiming.

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

## CONFIRMED - Responsive storefront header and product typeahead (Phase 26B, 2026-08-27)

Frontend for backend Phases 26A/26A-1, against API **3.8.0**. The authenticated header
was redesigned and given a product typeahead. Nothing else moved: pricing, UOM, stock,
variants, cart logic, content blocks, placements, filters, Product Grid, route content,
the footer and the Phase 25J/25L page layout are all untouched.

### The header is now its own component

`SecureShell` went from 139 lines to 60: it owns the page frame, the full-width `main`
and the footer, and nothing else. `SecureHeader` owns composition; `SecureNav`,
`MobileNavDrawer`, `ProductSearch`, `CartAction` and `UserMenu` each own one thing.

```text
desktop  [ brand ] [ merchant nav ] [ ——— search ——— ] [ cart ] [ user ▾ ]
mobile   [ ☰ ] [ brand ]                               [ cart ] [ user ]
         [ ————————————— search ————————————— ]
```

**The breakpoint is `lg` (1024px), not `sm`.** Measured, not guessed: brand, navigation,
a usable search box, the cart and a name do not fit at the 768px tablet width, and the
casualty would have been the search box - squeezed to something unusable before the
layout ever switched. So a tablet gets the two-row layout with the hamburger, which is
the honest answer for a header this dense.

### The merchant tree lost its lodgers

`SecureNav` used to end with Cart, Orders and Account. Its own comment already argued
those are application controls rather than merchandising; Phase 26B acted on it. The cart
became `CartAction`, the account routes moved into `UserMenu`, and the merchant row now
renders the published tree and nothing else. The rule that a merchant cannot switch those
controls off by omission is unchanged - it is simply asserted against the header that now
owns them.

**The mobile drawer reads the same `MenuStore`.** One request, one dataset, two
renderings: no mobile menu key, no static Catalog fallback, no second navigation config.
Where the menu is empty or failed **no hamburger is rendered at all** - an empty panel
tells a buyer the store is broken; a missing hamburger looks like a store with no
published navigation, which is what it is.

### The typeahead

`catalog.get_product_suggestions`, and nothing else. Five fields, no money - the contract
is explicit that a price in a dropdown is a second place for money to be wrong, so the
DTO is deliberately **not** a small `ListingCard`, and a guard asserts the forbidden
listing fields stay absent from the published schema.

- **Three characters minimum.** One and two query nothing; the backend answers an empty
  list for them anyway, so asking could only return nothing.
- **250ms debounce**, so four keystrokes cost one request rather than four.
- **`switchMap` is the stale-response protection.** A newer term unsubscribes the older
  request, so a slow answer for `bol` can never paint over a fast one for `bolt`. That is
  why this is an observable pipeline rather than promise state with a generation counter
  to get wrong.
- **Matching is the backend's**, shared with `get_items` - name **or** item code, AND
  across words. Angular sends the string and matches nothing.
- Discovery uses that endpoint alone: no `get_items`, no `get_item`, no `resolve_variant`.

**Enter does nothing, deliberately.** There is no results page, no `/search` route and no
open-the-first-result behaviour. The input is not inside a form and the default is
prevented, so no host can later give Enter a meaning. It has its own regression test in
both suites.

### Recent products, per user

Only products the buyer **clicked** - never a typed string, which is a guess rather than
a decision. Five, newest first, a repeat moving back to the top rather than duplicating.

Namespaced by the Frappe user id (`user.name`), never the display name: display names are
neither unique nor stable, and two colleagues sharing one would share a history. Changing
identity re-reads the list, so a sign-out drops the previous buyer's products from
**memory** as well as from storage.

Only the five published fields are persisted, copied field by field rather than spread -
spreading would persist whatever a future backend adds, which is how a price ends up in
`localStorage` without anyone deciding to put it there. Malformed JSON, a row of the wrong
shape, a non-array and storage that throws on access all degrade to "no recent products".

### Contract discrepancies found

None. 3.8.0 is additive: one new read endpoint and two new schemas.

### Live smoke - PENDING

No credentials in this environment.

## CONFIRMED - Contained and full-width content blocks (Phase 25L, 2026-08-26)

Frontend for backend Phase 25K, against API **3.7.0**. A small additive layout
enhancement on top of Phase 25J: nothing else changed, and no business behaviour was
touched.

Every projected `ContentBlock` now carries `content_width` - `contained` or `full_width` -
alongside `section_style`. Both belong to the **placement**, so the same hero Banner can
run full width on one route and contained on a page.

### The whole change

`ContentSection` gained one input and one branch:

| | `contained` | `full_width` |
| --- | --- | --- |
| band | `<section class="yob-page-section …">` | identical |
| column | `<div class="yob-content-container">` | **absent** |
| surface, spacing | identical | identical |

Full width needed no trick at all. `main` has been full width since Phase 25J, so **not
opening the column** is the entire implementation - no `100vw`, no `w-screen`, no
negative-margin breakout, no viewport arithmetic. A guard scan enforces that.

`contained` reuses `.yob-content-container` exactly, so every placement that predates the
field - all of which migrated as `contained` - is byte-identical to Phase 25J.

### One `<ng-content>`, stamped twice

Two branches project the same content, and **Angular projects a given `<ng-content />`
slot once**: a second slot in the other branch renders empty, which is a section with no
block inside it. Phase 25E hit exactly this in `DestinationLink`. So the content is
captured in an `<ng-template>` once and stamped through `ngTemplateOutlet`, and a test
asserts both branches actually render their child.

### Independence, and the safe fallback

The two keys are never derived from one another; all ten combinations are asserted. The
Phase 25J dark-band foreground rules key off the band rather than the column, so
`dark` + `full_width` stays readable - measured, not assumed.

`isFullWidth()` is the one place a width value is interpreted, and it is written
inverted on purpose: **anything** that is not the published full-width word is contained.
An unrecognised value falls back to the safe, unchanged behaviour rather than letting
merchant content escape the column. No width value ever becomes a class.

### What it does not reach

`content_width` affects Content Blocks only. The application's own sections - cart,
product, orders, account - keep their source-owned `.yob-content-container`, and a guard
asserts nothing outside the content domain so much as mentions the field. A merchant
cannot make the cart full width.

### Contract discrepancies found

None. 3.7.0 is additive: one required field on `ContentBlock`, published as the reusable
`ContentWidth` schema, always present.

### Live smoke - PENDING

No credentials in this environment.

## CONFIRMED - Full-width content sections and a fixed inner column (Phase 25J, 2026-08-22)

Frontend for backend Phase 25I, against API **3.6.0**. A layout refactor: **no business
behaviour changed**. Pricing, variants, UOM, stock, cart, filters, navigation,
route-content loading and Product Grid hydration are all untouched, and a request-log
assertion re-proves the last of those.

### What actually changed

One thing. The shell's `main` used to carry the content column, so **every** routed page
- and therefore every content block inside one - was capped at the content width and no
block could paint a background past it.

| | Before | After |
| --- | --- | --- |
| `main` | `mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 flex-1 py-8 sm:py-10` | `w-full flex-1 py-8 sm:py-10` |
| the column | once, on `main` | once per band, inside it |
| a block's background | capped at the column | spans the full width of `main` |

The vertical padding stayed on `main`: it is the gap under the header, it is the same on
every route, and pushing it into eight pages would be eight chances to disagree.

### Two primitives, defined once

`styles.css` owns both, because every page and every block uses them:

- **`.yob-content-container`** - `mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8`. These
  are the exact classes `main` carried before, **moved rather than re-chosen**, so the
  width, the responsive padding and the alignment are unchanged. `SHELL_CONTAINER`
  resolves to this same class, so the header, the footer and every column are one
  definition and cannot drift.
- **`.yob-page-section`** - `width: 100%`. Never `100vw`, which includes the scrollbar
  gutter and is the usual source of horizontal overflow; a source scan enforces it.

### `ContentSection`, and why it is one component

Every block type needs the identical band and none of them should know it. So the wrapper
is a single component that `ContentBlocks` stamps around each block - **not** logic added
to the image banner, the rich text, the carousel, the product grid and the promo grid.
A sixth block type gets banding for free, and no host page mentions a section style.

Because `ContentBlocks` is the one renderer both `StorefrontPage` and `ContentSlot`
already used, `/pages/:slug`, `/home` and all seven system route placements got this
behaviour without a line of per-page code.

**Each block is its own band**, so three consecutive blocks are three sections and a
merchant can put a dark hero directly above a muted grid. Block-to-block spacing moved
from `gap-10` on the list into padding on each section - a gap between two surfaces would
show a stripe of page background between them. `default` uses `py-5`, which reproduces
the previous 40px between consecutive blocks exactly.

### The style mapping

`section_style` is five approved words and nothing else - never a class, a colour or any
CSS. They map through a **fixed table** written out in full, because Tailwind compiles
the classes it can see and an interpolated `yob-section-${style}` would name a class that
exists in the markup and nowhere in the stylesheet.

| `section_style` | Surface | Token reused |
| --- | --- | --- |
| `default` | none - the ordinary page background | - |
| `muted` | `bg-slate-50` | the neutral alert surface |
| `brand_soft` | `bg-blue-50` | the badge info hue |
| `accent` | `bg-amber-50` | the badge warning hue |
| `dark` | `bg-slate-900 text-slate-100` | the primary button |

No new colours. An unrecognised value falls back to `default` rather than reaching the
DOM.

**`dark` also remaps the foreground**, in one place. The blocks inside it hard-code the
light-theme slate ramp - `text-slate-900` on a title, `border-slate-200` on a product
card - and a utility class beats an inherited colour, so a band that only set `color`
would render dark text on a dark ground. The ramp is remapped within that band using the
same tokens, rather than teaching five components about dark mode or touching a single
line of stored merchant HTML.

Two things about those rules were got wrong first and are worth recording, because both
failed silently and neither is obvious from reading the CSS.

**Cascade layers beat specificity.** The overrides were written in `@layer components`,
where plain `.text-slate-900` from the later `utilities` layer won *however specific* they
were - so a dark band rendered slate-900 text on a slate-900 ground and no test noticed.
They now live in `@layer utilities`, competing with the utilities they override, where
ordinary specificity decides. A `:is()`-versus-`:where()` argument is beside the point
across layers.

**A component that paints its own light surface keeps its own foreground.** A badge is
`bg-slate-100 text-slate-700` and a secondary button is `bg-white text-slate-900`;
flipping their text would be light type on a light card. The obvious spelling - one flip
rule with `:not(:is(.bg-white, …) *)` - is wrong, because `:not()` is not scoped to the
band and the secure shell's own root carries `bg-white`, so every element in the
application counted as surfaced and nothing was flipped at all. So it is **flip, then
restore**: the flip claims the band, and a second, more specific set of rules - each
anchored to `.yob-section-dark`, so it matches only surfaces *inside* it - hands back the
components that brought a surface with them. The restore list is written out
per-shade rather than compressed; the compressed version is what silently broke.

`e2e/dark-section.spec.ts` measures **computed colour** through a canvas pixel readback -
Tailwind v4 computes to `oklch()`, so parsing the colour string measures the wrong
numbers - against a `dark-band` fixture carrying all four block types, and probes an
injected `bg-white`/`text-slate-900` pairing to prove the exemption holds for components
no block renders yet.

### Application sections are source-owned

Every application page now opens its own band with a semantic hook -
`catalog-section`, `cart-section`, `order-detail-section` and so on - and the storefront
column inside it. These are styling hooks for later; they carry **no** merchant surface,
and a test asserts no application band ever does.

That separation is the point of having two mechanisms: a Content Placement styles its own
band, and nothing a merchant configures can reach the cart, the product page or the order
list.

`checkout-section` was added although Phase 25J did not list it. Checkout sits in the same
`main` and would otherwise have gone edge-to-edge - a regression, not a feature.

### The invariant that was at risk

Phase 25H established that every page's heading starts at the same position, and
`design.visual.spec.ts` enforces it. Removing the global column put that at risk, so each
page's heading sits in its own band's column and the geometry is unchanged. A browser test
now measures the brand, a page heading and a block's column and asserts all three share
one x-position.

### Contract discrepancies found

None. API 3.6.0 is additive: one required field on `ContentBlock`, published as the
reusable `SectionStyle` schema, always present.

### Live smoke - PENDING

No credentials in this environment.

## CONFIRMED - System route content slots and Home (Phase 25H, 2026-08-22)

Frontend for backend Phase 25G, against API **3.5.0**. The same Content Blocks that
Phase 25E draws on a merchant-authored page can now appear at fixed positions inside
application pages - above the cart, below a product - without those pages knowing what a
block is.

### The distinction that defines this phase

| | Standalone dynamic Page | System route content |
| --- | --- | --- |
| What it is | a `YOB Storefront Page` record | a position inside an existing app route |
| URL | `/pages/:slug`, merchant-named | the route's own URL, application-owned |
| Endpoint | `cms.get_page(slug)` | `cms.get_route_content(route_key)` |
| Who decides it exists | the merchant | Angular source, in `ROUTE_SLOTS` |
| Who decides what is in it | the merchant | the merchant |

**Angular owns slot locations. The merchant owns the blocks and their order inside one.**
A merchant cannot create a route, invent a position, or reorder Home's three regions -
adding a slot is a source change in *both* repositories. **This is not a generic layout
builder**, and the registry being a `const` rather than something read from the response
is what keeps it from becoming one.

**The response can be customer-specific.** A slot may hold a Product Grid, which is
priced through the buyer's own context, so a route's content is never shared across
customers - unlike a menu, which the contract states is customer-independent. That is why
`RouteContentStore` empties itself when the session identity changes and `MenuStore` does
not.

### One renderer, extracted

Phase 25E kept the block-type `@switch` inside `StorefrontPage`, because a page was the
only thing that had blocks. That would now mean the cart, the account page and the order
list each learning what a carousel is. So the dispatch moved into `ContentBlocks`, and
`StorefrontPage` and `ContentSlot` both render it.

Adding a sixth block type is therefore a change to one component. A guard test asserts
that `@case ('image_banner')` exists in **exactly one file**, and that no host page names
a block type at all.

### One request per route, never per slot

The backend deliberately returns every slot of a route - empty ones included - in one
answer. `RouteContentStore` is the coordinator: a slot asks for its *route*, the first ask
starts the one request, and every later ask reads what it produced. Home's three regions
and the cart's two placements are one request each, asserted in both the unit suite and
the browser.

Entries are keyed by route because slot keys are **not** unique on their own:
`above_listing` is declared by both `catalog` and `category`, so only the (route, slot)
pair identifies a position.

### Supplemental means supplemental

Content is decoration on a route that works without it. Loading leaves the host usable,
empty renders nothing at all - no wrapper, no gap, no placeholder - and a failure leaves
the page working with no error shown for content the buyer never asked to see. **Nothing
retries**: a retry loop behind a page someone is using is a request storm, not a recovery.

Home is the one exception worth a loading treatment, because Home is almost entirely
content and an empty frame reads as a broken store. It uses the existing `Spinner`; there
is no second loading framework.

### Type safety for positions

`ContentSlot<R>` is generic on the route key, so `slotKey` is the slots **that** route
declares:

```html
<yob-content-slot routeKey="cart" slotKey="hero" />
<!-- error TS2322: Type '"hero"' is not assignable to type '"above_cart" | "below_cart"'. -->
```

That is a compile error under `strictTemplates`, not a runtime surprise.

`e2e/route-content-contract.spec.ts` then asserts the local `ROUTE_SLOTS` is **exactly**
the published `x-route-slots` - not a subset and not a superset - that every declared
`<yob-content-slot>` names a real pair, and that every published position is rendered
somewhere. This also closes the Phase 25F recommendation about DTO/contract drift, without
adding a code generator.

### Slot placement, and why it is route-level

Slots sit at the **outer edges of each route's template**, above everything the route
renders and below all of it. That follows from what the endpoint is: `get_route_content`
takes a route key and **no slug**, so the content is generic for the route *type*, not for
the category or product being viewed. Placing it inside a loaded-document branch would
have implied a per-document relationship the contract does not have.

| Route | Component | Slots |
| --- | --- | --- |
| `home` | `HomePage` | `hero`, `main`, `bottom` |
| `catalog` | `CatalogPage` | `above_listing`, `below_listing` |
| `category` | `CategoryPage` | `above_listing`, `below_listing` |
| `product` | `ItemPage` | `above_product`, `below_product` |
| `cart` | `CartPage` | `above_cart`, `below_cart` |
| `account` | `AccountPage` | `above_content`, `below_content` |
| `orders` | `OrdersPage` | `above_list`, `below_list` |
| `order_detail` | `OrderPage` | `above_order`, `below_order` |

**Account boundary:** `AccountPage` itself. Account is a single routed component, not a
shell hosting child routes, so there is no shared parent to place the slot on and no risk
of the request being repeated per sub-view.

**Login, checkout, payment and the payment callback carry none**, by decision on both
sides. The backend answers `content_route_unknown` for those keys and `ContentRouteKey`
makes them unspellable here.

### Home

`/home` is the authenticated landing page, and `DEFAULT_AUTHENTICATED_PATH` moved from
`/catalog` to it - so the root redirect, the sign-in redirect and the session-unavailable
retry all follow, since they read that one constant. The brand link goes to `/home` too.

Home is **not** a Storefront Page and does not route through `/pages/home`: it is three
slots and nothing else, so a merchant can fill it without configuring a document, and
cannot rename or unpublish the store's front door. `/catalog` remains a first-class route,
reachable directly and from the merchant's own menu.

### Product Grid, unchanged

A grid inside a system slot arrives already hydrated by the backend's own `list_items()`
path, exactly as it does on a page. Angular issues **no** `get_items`, `get_item`,
`resolve_variant`, pricing or stock request for its cards, and renders the catalogue's own
`ItemCard`. Asserted on Home in both suites.

### Contract discrepancies found

None. API 3.5.0 is additive - one new path and two new schemas - and the `ContentBlock`
union is byte-identical to 3.4.1, so no existing DTO changed. The two documentation gaps
recorded in Phase 25E were fixed by the backend in 3.4.1.

### Live smoke - PENDING

No credentials in this environment.

## CONFIRMED - Storefront pages and content blocks (Phase 25E, 2026-08-22)

The rendering layer for `cms.get_page`, against API 3.4.0. Backend owns publication,
block order, destinations, the Product Grid's catalogue query and its customer pricing;
Angular draws what arrives.

### One request, and the reason it matters

A page is `cms.get_page(slug)` and nothing else. The Product Grid's rows are the **same
`ListingCard`s the catalogue returns**, produced by the same service under the buyer's own
pricing context - so there is no per-card `get_item`, no pricing call, no stock lookup and
no variant resolution. A page with four grids is still one request, and a test asserts the
absence of every one of those calls.

### The union is strict, because the published schema cannot be

`ContentBlock` lists every block's fields side by side with everything nullable, and its
own description says why that is a description rather than a model: *"never infer the kind
from which nullable fields are set."* Typing it that way in Angular would invite exactly
that, and would make `block.html` readable on a product grid. So each block is its own
interface, discriminated on `type`, narrowed once by `isRenderableBlock`.

An unknown `type` is **skipped, not fatal**: a backend that adds a sixth block must not
take an old client's page down, so the renderer draws what it knows and omits the rest.

### Slide and card shapes came from the backend, not the schema

`slides` and `cards` are `array<object>` in the OpenAPI document - untyped. Their fields
were read from the backend's own projector (`content_service._media_row`), which is the
canonical source when the published schema is silent: `desktop_image`, `mobile_image`,
`title`, `alt_text`, `destination`. A slide and a promo card are one shape there and one
type here. **Recorded as a contract gap** - see the discrepancies below.

### One destination renderer for four callers

`DestinationLink` wraps content in the link a destination describes, or in nothing.
Written once because menu items, banners, slides and promo cards carry the identical
shape and need the identical three decisions - clickable, internal or external, new tab.
Four copies would be four chances to forget `rel="noopener"` or to invent a route for a
`storefront_page`, whose `href` is always null by design.

**A bug the tests caught:** the first version had three `<ng-content />` slots, one per
branch. Angular projects a slot once, so every branch after the first rendered an empty
element - a banner with no image inside its own link. Now the content is declared once in
a template and stamped per branch.

### Blocks

- **Image banner** - both assets in a `<picture>`, so a phone never fetches the desktop
  file; the one asset present is used at both sizes when only one is configured. Heights
  are merchant values, **clamped** (80-900px) and applied as a height, never as style
  text. Not `NgOptimizedImage`: it has no `<picture>` support and its `fill` needs a
  positioned direct parent, which `<picture>` is not. `mediaUrl()` is still the only place
  a stored path becomes a URL.
- **Rich text** - rendered through ordinary `[innerHTML]`, so Angular's sanitiser runs.
  **No `bypassSecurityTrustHtml` anywhere**, and a test asserts its absence in the file:
  the backend sanitising on save is the first boundary, and this is the second - the one
  that protects the buyer's session from a stored XSS in an admin field. Alignment is a
  lookup in a fixed table, so a value outside the enum cannot reach the DOM as a class.
- **Carousel** - hand-written, no library. Manual controls are real buttons with names, a
  polite live region reports the position, and it wraps in both directions. Autoplay stops
  on hover and focus, stops **permanently** once the buyer presses a control - they have
  said which slide they want - and never starts under `prefers-reduced-motion`. The
  interval is the backend's, clamped to 2-30s so a mistyped 50 cannot strobe.
- **Product grid** - renders the catalogue's own `ItemCard`. `card_type` adds a `ratio`
  input to that card and changes nothing else: square and portrait are a frame, not a
  second product-card implementation with its own idea of price. An empty grid renders
  nothing; the backend refuses to substitute other products and so does this.
- **Promo grid** - content cards, merchandising only, no offer or pricing semantics.
  `cards_per_row` maps through a fixed table because Tailwind compiles the classes it can
  see: an interpolated `grid-cols-${n}` would name a class in the DOM that exists nowhere
  in the stylesheet.

### SEO

`Title` and `Meta` directly - there is no SEO abstraction in this project, and one route
needing two tags is not the case that should invent one. `meta_title ?? title`, and the
description is **removed** when the next page has none, so a stale one never describes a
page the buyer has left.

### Contract discrepancies found - BOTH CLOSED in API 3.4.1

1. **`slides` and `cards` are untyped** in the published OpenAPI (`array<object>`). Shapes
   taken from the backend projector; worth publishing properly.
2. **`desktop_height_px` / `mobile_height_px` are documented under `image_banner` only**,
   but the backend also projects them for `banner_carousel` and `promo_grid`. Typed where
   the backend sends them.

Neither changed any behaviour, and neither was a defect in the backend - only in what the
document said about it.

**Resolved by backend Phase 25C-1 (API 3.4.1).** `BannerCarouselSlide` and `PromoCard`
are now real schemas that `slides` and `cards` `$ref`, and `x-block-fields` records
machine-readably which fields each block type carries. Every DTO in `page.types.ts` was
compared field-by-field against 3.4.1 and **matches exactly** - the shapes read from the
projector were right, so **no application change was needed**; only the mirrored
reference moved. The backend now runs a guard asserting its published schemas against
blocks it actually projected, so this cannot drift again.

One deliberate asymmetry remains: the contract publishes two schemas of identical shape
where this repo has one `ContentMediaRowDto`. The backend keeps them separate because a
slide and a promo card are separate stored types that may diverge; if they ever do, this
type splits.

### Live smoke - PENDING

No credentials in this environment.

## CONFIRMED - Storefront navigation and category filters (Phase 25D, 2026-08-22)

Frontend for backend Phases 25B/25C, against API **3.4.0**. Navigation and merchandising
filters only: Storefront Pages and Content Blocks are the next phase, and `cms.get_page`
is deliberately neither typed nor mocked here.

### The mirror was stale, and was re-synced before anything was written

`reference/api/` and `docs/api-handoff/` were at 3.4.0 already, but three files differed
from the backend's canonical `frontend-api-handoff/`: the backend had regenerated them
three hours after the drop. The delta was **documentation only** - the `Destination`
schema's `href` description changed from "null until the SPA owns that route" to "always
null for `storefront_page`" - with identical fields, enums and required lists. All nine
files were copied from canonical before implementation, and both mirrors are again
byte-identical to it.

### Navigation

`cms.get_menu('main')` is fetched **once**, by a store, because the shell renders the nav
component twice - wide header and narrow row - and the phase requires one dataset rather
than two that could drift. The store is idempotent: a second instance, and every
subsequent navigation, reuses the tree instead of re-asking for a customer-independent
menu on every page.

Publication rules are **not** re-implemented. The backend has already removed disabled
items, disabled descendants, unresolvable destinations and emptied groups; what arrives is
rendered in the merchant's order, unsorted.

| Node | Rendered as |
| --- | --- |
| leaf with `href` | router link, or a plain anchor when `external` |
| **group** | a `button` with `aria-expanded` + `aria-controls`, never a link |
| `destination: null` | text, not clickable - a group and a retired target look alike |
| `storefront_page` | **`/pages/<target>`, built on the client** - `href` is always null |
| `external_url` | the backend URL; `target=_blank` **only** when `open_in_new_tab`, with `rel="noopener noreferrer"` |

`external` and `open_in_new_tab` are independent flags and the fixture carries a node for
each combination, because inferring one from the other is the easy mistake.

**Application controls stay code-owned.** Cart, Orders and Account are how the application
works, not merchandising: an empty menu, or a failed one, leaves them untouched. A menu
that fails to load is silent - `menu_not_found` covers "no such menu" and "disabled"
indistinguishably, so an error banner on every page would be noise about a decoration.

### Category filters

`get_category_filters(scope_value)` is fetched per **leaf** category, keyed on the slug.
A group category is never asked, because it answers `category_not_listable` by design.
`{filters: []}` renders no facet UI at all. Order is preserved for filters and values, and
**no counts are shown** - the contract publishes none, and one computed from the loaded
page would be wrong for every page after the first.

Angular implements **no matching**. OR-within-a-filter and AND-across-filters are the
backend's rules; the frontend carries grouped keys.

### The URL is the state

The selection lives in `storefront_filters` and nowhere else. Clicks navigate; the new URL
updates the page. That is what makes reload, back, forward and a shared link all work
without a second copy of the state to disagree with the address bar.

One canonical form per query, so that a link, a reload and a re-click produce the same
request and the same cursor fingerprint: filter keys sorted, values sorted, duplicates
dropped, empty arrays removed, and the parameter **absent** rather than `{}` when nothing
is selected.

`parseSelection` is a boundary, not a parser: bad JSON, arrays, strings, numbers, nested
objects and non-string members all collapse to "no filters". Arbitrary URL JSON never
becomes query grammar.

### Reconciliation, and why it happens before the request

A selection outlives the category it was made in. It is trimmed against the new
category's own projection **before** anything is sent, so a stale link produces a valid
listing rather than a `storefront_filter_unknown`. Trimming only: an unavailable value is
dropped and **nothing is chosen in its place**. When the reconciled form differs from what
the URL asked for, the URL is corrected with `replaceUrl` - a correction is not somewhere
the buyer navigated to and should not be a stop on the way back.

### Cursors never cross a selection change

`ItemListing.load()` is the only path that applies a selection, and it resets rows, cursor
and flags. There is deliberately no "apply filters" route that keeps a cursor. The mock
puts the selection in its cursor fingerprint exactly as the backend does, so a reused
cursor surfaces as `cursor_invalid` in the tests rather than as a silent mismatch.

### Errors

The four `storefront_filter_*` refusals get their own state with a **Clear filters**
action and no retry button: re-sending a selection the backend has already refused earns
the same refusal, which is a loop rather than a recovery. Clearing is a different request.
No server text is rendered.

### No ERPNext Item Group

Nothing in navigation, the filter projection, the selection, the request or the URL refers
to an Item Group. It is not storefront taxonomy, and the Item Filter Set that governs what
a merchant may tag an item with is an admin-side concept the storefront never sees.
Regression tests assert its absence in all of those places.

### Not implemented, by instruction

`/pages/:slug` renders nothing yet - navigation only *generates* the route. No Image
Banner, Rich Text, Carousel, Product Grid or Promo Grid.

### Live smoke - PENDING

No credentials in this environment. Nothing was created on `yob.localhost`, which is also
still awaiting the backend's slug patch.

## CONFIRMED - Variant wire-contract sign-off (Phase 24D-2, 2026-08-20)

Verification only; no product behaviour was designed here. Backend Phase 24D-1 published
API **3.3.0** into this repository, and every Phase 24C assumption is now either confirmed
against it or corrected.

### The contract is now in the repo, and it is the backend's

`docs/api-handoff/` and `reference/api/` hold the same package, **byte-identical**
(`md5` equal for both `openapi.json` and `postman_collection.json`), generated by the
backend and not edited here. A test reads the OpenAPI document rather than restating it,
so a future contract change breaks a test instead of drifting.

### Every Phase 24C assumption held

| Assumed in 24C | API 3.3.0 says |
| --- | --- |
| `resolve_variant` is a GET | `get`, and the only verb published |
| `template`, `attributes` (JSON string), `qty` | exactly those three; `template` + `attributes` required |
| Angular's encoding is acceptable | "JSON object, URL-encoded into the query string" |
| `qty` may be 1 for the first resolution | "defaults to 1 and simply reprices the preview" |
| branch on `code`, not status | all three variant refusals are **422** |

The one status guess that was wrong cost nothing: 24C's mock answered
`variant_not_available` with 404 where the contract says 422. The application never read
the status, so only the mock changed.

### Four real mismatches found, all in typing rather than behaviour

1. **A family listing card carries `null` money, not zero.** `ListingCard` types
   `base_price`, `rate`, `discount_percentage`, `discount_amount`, `net_amount`,
   `tax_amount`, `total_amount`, `uom` and `conversion_factor` as nullable, because
   ERPNext cannot price a template. Angular typed them non-null and the mock sent zeros -
   a plausible number sitting in a fixture is how one eventually gets rendered. Types now
   match, the mock sends `null`, and `hasDiscount` returns false on a null rather than
   comparing one.
2. **`variant_family_unsupported` comes from `get_item`, not the resolver.** A
   Manufacturer-based family is refused at load. Angular showed the generic "please try
   again", which is false advice for a permanent property of the product; it now shows the
   same safe "cannot be configured online" state the empty-matrix path shows.
3. **`item_is_template` and `item_not_purchasable`** are published `add_to_cart` refusals
   and had no wording of their own. Both now say what the buyer can do, and neither
   suggests retrying. The mock refuses a template code outright, so the path is reachable.
4. **`ProductDetail.custom_slug` is nullable**, and `is_template` / `is_purchasable` /
   `variant_of` / `selected` are **required** rather than optional. `VariantFamily`
   carries `variant_of` too. All typed.

No rendering changed for any simple or resolved product: 803 pre-existing tests passed
before the first new test was written.

### What is now pinned by test

The request, at the mock's server boundary in a real browser as well as in unit tests:
`GET`, no body, exactly `template` + `attributes` + `qty`, attributes percent-encoded and
decoding back to the selection, and **no** `item_code`, `uom`, `stock_uom`,
`conversion_factor`, `warehouse`, `rate` or `price_list`. Attribute **key order is not
semantic** - `pruneSelection` rebuilds the map around whichever attribute was clicked
last, so the order legitimately varies and only the decoded object is asserted.

The response: every required `ProductDetail` field is read and displayed, with figures
chosen so a calculation would be visible (rate 1000 in Box of 25 Nos - 40, 25,000 and
"5 Box" must never appear, and a derived percentage would read 16.666 rather than the
backend's 16.67).

### A dev-only request log, and why it exists

In mock mode the interceptor answers **inside `HttpClient`**, so nothing reaches the
network and `page.waitForRequest` waits forever - the browser cannot observe a request
that is never sent. `src/mock-api/core/mock-request-log.ts` records each RPC at the mock's
server boundary, one step before the socket, so a browser test can assert the request
Angular actually composed. Bounded, in memory, and inside the folder `fileReplacements`
keeps out of production - the purity scan covers it.

### Live smoke - PENDING

Not run: no credentials in this environment. Per the phase brief, **no merchant variant
data was created on `yob.localhost` to force one**, and nothing on the backend was
modified. `yob.localhost` has also not yet had the backend's slug patch (`bench migrate`),
so a live variant smoke must wait for that regardless.

## CONFIRMED - Variant family selection (Phase 24C, 2026-08-20)

Frontend for backend Phase 24B. The buyer chooses **attributes and quantity**; ERPNext
chooses everything else. Angular never constructs a SKU.

### One page, three states

`ItemPage` renders a simple item, an unresolved family and a resolved variant from one
implementation - the split is a **discriminated union**, not two components:

```text
get_item -> ItemDetailDto   (salable: rate, uom, stock, tax)
         -> ItemFamilyDto   (is_template: 1, attributes[], variants[])
```

A family is not "an item with missing prices"; it genuinely has no rate, no UOM and no
stock until a variant exists, so typing it as optional fields on the item shape would
have produced a page of blanks and an unlabelled quantity box. Everything downstream -
price, UOM, availability, tax, quantity, Add to cart - reads one `purchasable()` computed
that is the simple item, or the **resolved** variant, or nothing.

### Availability comes only from `variants[]`

A candidate value is offered when at least one **real** variant row carries it alongside
the buyer's other choices. Nothing is generated. With `Orange/Medium` and `Yellow/Large`
the only rows, choosing Orange leaves Large visibly disabled although Orange and Large
both exist as values.

**One rule was added that the brief did not specify, because the literal rule strands the
buyer.** Once a selection is complete, every alternative is unavailable *with the current
choices* - Yellow is not available "with Medium" - so a strict reading disables every
route out of the first variant reached. An attribute the buyer has already chosen
therefore offers its values on their own terms, and choosing one **re-anchors** the
selection: choices it contradicts are dropped, not substituted. Dropping `Size: Medium`
asks the question again; substituting would answer it for them. This also stops the page
ever asking the resolver to price a combination its own matrix says cannot exist.

### The resolver is the only authority

`catalog.resolve_variant(template, attributes, qty)` is called once the selection is
complete, and never for a partial one. Angular sends the template code and the chosen
values - no candidate item code, no concatenation, no UOM, no warehouse, no price list -
and the returned payload's `name` is the SKU. The matrix is UX; it can be stale, and when
the server refuses a combination it offered, the page says so and stops. No retry, no
alternative SKU, no Add to cart.

`variant_not_available`, `variant_attributes_required` and `variant_family_unsupported`
each get our own wording; the server's `detail` is never rendered. A family that arrives
with nothing to choose - Manufacturer-based variants - gets the existing safe alert and no
bespoke UI.

### Quantity cannot cross a variant boundary

Quantity is hidden until a variant resolves (an unlabelled quantity box has no meaningful
unit), then labelled with the resolved `uom`. It **resets to 1 whenever the resolved SKU
changes**, which is not cosmetic: the two fixture variants sell in `Box` and `Nos`
respectively, so carrying 4 across would silently reprice the buyer's intent. Changing the
quantity issues no request; resolution sends the reset default of 1 and is never re-run to
reprice.

### Add to cart is unchanged

`{ item_code, qty }` and nothing else - the resolved SKU, never the template, never the
attributes, never a unit or warehouse. `cart_item_uom_changed` handling is untouched.

### Listing

`price_state` decides the card: `priced` renders the authoritative price and selling UOM
as before; `select_options` renders **no money at all** - not zero, not "from", not a
cheapest child - plus a Select options affordance that opens the family page. A family is
one card and its children are not listed. An absent or unknown `price_state` keeps the
priced card, so an older backend is unaffected. No listing quantity or Add to cart was
added. Cursor pagination, sort and the Phase 22 behaviour are untouched.

### No variant deep links

The URL stays on the family slug throughout; no variant slug is constructed.

### RESOLVED by Phase 24D-2 - the request contract is confirmed

Everything below was written before backend Phase 24D-1 published API 3.3.0 into this
repository. It is retained for the record; the assumptions **all held**, and the two
corrections are described in the 24D-2 entry above.

#### As it stood in 24C

`reference/api/` carries **no** variant contract: `resolve_variant`, `price_state`,
`is_template` and `has_variants` appear nowhere in `openapi.json`, the Postman collection
or the verified responses, which are still at API reference 2.0.0. The shapes here come
from the Phase 24C brief, and two things about the *call* are inference:

- **`resolve_variant` is issued as a GET**, with `attributes` as a JSON object string -
  because every other catalog endpoint is a GET and `get_items` already sends a structured
  `filters` parameter that way. If the backend expects POST, one method in `CatalogApi`
  changes and nothing else does.
- **Status codes** for the three refusals are assumed (422 / 404 / 422). The frontend
  branches on `code`, never on status, so a mismatch changes nothing.

Re-capture both against the running backend before treating this as wire-verified, and
update `docs/API-CONTRACT.md` §8, which still documents three catalog endpoints and no
`get_items` either.

## CONFIRMED - E2E gate integrity (Phase 23B-5U-FE-GATE, 2026-08-20)

Tooling only; no application behaviour changed. It closes the one defect found during
23B-5U-FE that could invalidate every other result in this document.

### The old failure mode

`playwright.config.ts` had `reuseExistingServer: !process.env['CI']`, so a local run
adopted whatever was already answering on port 4300. A `ng serve --configuration mock`
that had been up for hours **stopped rebuilding**, kept answering the URL check, and was
adopted twice: once reporting **green against a bundle that predated the change**, and
once failing new-but-correct tests. Nothing in the output said which build was under test.

A gate that can pass without exercising the working tree is not a gate - and the failure
is silent in the dangerous direction, since the false green is the one nobody
investigates.

### The hardening

| | Authoritative gate | Local loop |
| --- | --- | --- |
| Command | `npm run e2e` | `npm run e2e:dev` |
| Port | **4301**, its own | 4300, the dev server's |
| Server | started by Playwright, always | reused, whatever is there |
| `reuseExistingServer` | **false** | true |
| Trustworthy | yes | no, and it says so |

Reuse is **opt in** via `E2E_REUSE_SERVER=1`, never opt out of the gate: a missing,
empty, misspelled or `true`-spelled variable leaves the run authoritative, so the failure
direction is "start a fresh server", which is recoverable.

The two ports are deliberately distinct. A hand-started `npm run start:mock` on 4300 no
longer blocks a gate run and can no longer be seen by one - verified both ways: the gate
passes while a dev server holds 4300, and the reuse loop attaches to that same server.

**An occupied gate port is rejected, not adopted.** With a stale server squatting on 4301,
`npm run e2e` stops before any test with `http://localhost:4301 is already used…` and exit
code 1. A refusal is recoverable; a false green is not.

### Guards, so this cannot regress quietly

- `e2e/support/global-setup.ts` reads the **resolved** config and aborts the whole run if
  an authoritative run is paired with reuse - so re-enabling reuse in the config stops the
  gate instead of weakening it. It also prints one line naming the mode, port and server
  ownership, so any log says which kind of run produced it.
- `e2e/gate-integrity.spec.ts` asserts the invariant from inside the run, reading
  `testInfo.config.webServer`: an authoritative run has `reuseExistingServer: false` on
  4301; a reuse run is labelled as such on 4300; the mode helper is opt-in; and the
  browser really reached the URL the config chose.

### Not attempted

A per-run build stamp compiled into the mock bundle would prove freshness by content
rather than by provenance. It needs a generated source file and a rebuild wait on every
run, and it is unnecessary once nothing is ever adopted: a server Playwright starts is
built from the tree under test by definition.

## CONFIRMED - Authoritative selling UOM display and UOM conflict (Phase 23B-5U-FE, 2026-08-20)

Frontend alignment to backend Phases 23B-5W / 23B-5U / 23B-5U-1. Display only: **the buyer
chooses a quantity and, where they exist, variant attributes - never a unit and never a
warehouse.** No UOM selector, no warehouse selector, and no conversion arithmetic was added,
and the tests below exist to make adding one fail.

### Three units, three jobs

| Field | What it labels | Where |
| --- | --- | --- |
| `uom` | the price, and the quantity the buyer types | listing card, item detail, cart row |
| `stock_uom` | `actual_qty`, and nothing else | item detail availability |
| `conversion_factor` | **nothing on screen** | typed, carried, never multiplied |

`₹100 / Strip`, `Quantity: [2] Strip`, `Available: 125 Nos` is one coherent screen, not a
mismatch: the first two are the selling unit and the third is the stock unit, each labelled
by the backend that produced it. Restating either in the other's unit would be a conversion,
and ERPNext owns those.

### The listing card was wrong, and is the one behaviour change

`get_items` used to supply only `stock_uom`, so the card captioned every price with it. With
a Box-priced item stocked in Nos that read `₹1000 per Nos`. `get_items` now sends `uom` and
`conversion_factor` too, and the card uses `uom`. Nothing else about listing changed - no
quantity control and no Add to cart was added, because none existed.

### Item detail

The price already used `uom`. What was missing was the quantity control's association with
it: the label is now parameterised - **"Quantity to add (Box)"** - so the input's accessible
name carries the unit, and the unit repeats beside the box as `aria-hidden` decoration. One
control on the page, and it takes a number.

Availability is unchanged and re-pinned: `is_stock_item: 0` shows nothing, `actual_qty: null`
shows nothing, and a number **including `0`** is shown in `stock_uom`. A variant is just a
different SKU with its own `get_item` response.

### Cart rows already read the projection, and now prove it

`pricing_rows[].uom` per row, never the cart item's unit, never `stock_uom`, never derived
through `conversion_factor`. The case that matters is one item code with two rows: ERPNext
prices a free Product Discount row in `Pricing Rule.free_item_uom` or, failing that, the
item's `stock_uom`, so **a paid `2 Box` beside a promotional `1 Nos` is correct output**. The
mock reproduces exactly that, and a test would fail if the paid row's unit were forced onto
the free one.

### `cart_item_uom_changed` - a refusal, not a repair

`add_to_cart` can answer **409** with `details.item_code` / `existing_uom` / `current_uom`
when the cart line is held in a unit the item no longer sells in.

It is a **definite refusal** - the request reached the endpoint and was rejected - so it
takes the path that already existed for those: the error is shown, **nothing is retried**,
and **no `get_cart` follows**, because nothing changed. Its own alert with a link to the
cart, rather than a line in the generic add failure, because it is the one add error with a
specific action attached: remove the line, add the product again.

Not done, deliberately: no automatic removal (the storefront does not delete a buyer's line
to resolve a problem they have not been told about), no quantity conversion, and no unit in
the request. **`existing_uom` / `current_uom` are not surfaced** - `YobApiError.context`
stays a three-key allow-list, the same call made for the coupon thresholds in Phase 16, and
naming the two units does not change what the buyer must do.

`get_cart` reports the same fact as `uom_changed_items[]`. Typed, exposed on the store, and
shown on the cart as a count in its own notice. It is **not** counted as `cart_updated`: the
backend did not restate the line, so nothing about the cart actually changed.

### Contract additions, all additive

`CatalogItemDto` gains `uom` and `conversion_factor`; `ItemDetailDto` gains
`conversion_factor` and `stock_qty`; `CartPayloadDto` gains `uom_changed_items`. `stock_qty`
and `conversion_factor` are typed and deliberately **not rendered** - they exist so nothing
here ever needs to compute the stock equivalent of a quantity.

### Two mock defects found and fixed

- `MockServerCart` built every cart line with `stock_uom: item.uom`, mirroring the selling
  unit into the stock field. Invisible while every fixture sold in the unit it stocked; wrong
  the moment one did not.
- A `splitGst` docblock had drifted onto `freeRow`, describing a CGST/SGST split above a
  promotion-row builder.

### Stale wording cleaned

`item-quantity.spec.ts` still had a `quantity-driven repricing` block whose leading test
claimed the backend priced the committed quantity - it passed only because the fixture's
default rate happens to be the number it asserted. Phase 23B-2 removed that refetch. The
block, and two Playwright comments saying a committed quantity triggers repricing, now
describe what actually happens: the quantity is local until Add to cart.

### Gate

Unit **758/758**, Playwright **951/951** at three viewports, typecheck clean across app,
spec and e2e projects, production build clean, production purity clean (no mock fixture,
scenario name, dev host or credential in the bundle).

One environment lesson worth recording: a long-lived `ng serve --configuration mock` on
port 4300 stopped rebuilding, and `reuseExistingServer` meant Playwright silently tested
that stale bundle - new tests failed while the code was correct, and, worse, an earlier
run reported green against pre-change output. **This is now fixed in tooling rather than
left to memory** - see the Phase 23B-5U-FE-GATE entry above: `npm run e2e` starts its own
server on its own port and never adopts one.

### Not verified from here

Live smoke was **not** run: it needs `YOB_SMOKE_PASSWORD`, which this session does not have,
and every catalog endpoint is session-protected so there is no safe read-only substitute. The
additive fields are typed from the stated backend contract and exercised against the mock,
not observed on the wire from this machine. No merchant configuration was created.

## CONFIRMED - ERPNext pricing compatibility sign-off (Phase 23B-5, 2026-08-20)

Verification gate. Tests and documentation only; no production behaviour changed.

### The architecture, as verified in source

```text
preview   get_item -> SellingContext -> throwaway in-memory Sales Order -> ERPNext prices it
qty +/-   local signal only, zero requests
mutation  add/remove/coupon -> load COMPLETE cart -> rebuild Sales Order -> ERPNext prices
          everything -> pricing_rows + document totals
commit    Draft Sales Order
```

- **No parallel pricing engine.** `frappe.new_doc("Sales Order")` plus `set_missing_values()`,
  `calculate_taxes_and_totals()` and ERPNext's own `apply_pricing_rule_on_transaction`.
  The YOB Cart DocType is **never** passed to ERPNext pricing as if it were a Sales Order.
- **`for_shopping_cart` appears nowhere** in `yob_storefront`, `yob_core` or `yob_auth`.
- **Row tax comes from `_item_wise_tax_details`**, grouped by row identity rather than
  `item_code` - which is what keeps a same-SKU paid row and its free row apart.
- Angular performs **no** pricing or tax arithmetic. Verified behaviourally, not by
  source-scanning: tests pin figures any calculation would get wrong.

### Environments, and why two passed gates looked contradictory

`test.localhost` (backend tests) has an **Unregistered** company; `yob.localhost` (live
smoke) has a **Registered Regular** company, GSTIN `24AEQPV5389F1ZS`, Gujarat. Same company
name, different sites. Both earlier reports were correct. The backend skip message already
names the company and its `gst_category`, and `fail()`s if a registered company produces no
classification - so it was accurate and is retained unchanged.

### Two observations recorded, neither a production defect

**1. The legacy cart-item tax snapshot is prorated, the projection is not.**
`cart_row.tax_amount` is computed as `total_taxes / net * row_net`, while
`pricing_rows[].tax_amount` comes from ERPNext's item-wise attribution. With items on
different tax rates the two disagree by construction. Harmless today because the snapshot is
non-authoritative and Angular reads only `pricing_rows` - and the projection is covered by
`test_items_with_different_tax_rates_each_get_their_own`. Worth retiring the prorated field
when the legacy snapshot is next touched.

**2. `get_payment_methods(order_amount=...)` trusts a client number for *listing*.**
A caller can pass any amount and see a method it is not entitled to. No financial authority:
`process_payment` re-evaluates eligibility against the immutable Payment Request's own
`grand_total` and refuses with `payment_method_unsupported`. Cosmetic enumeration only.

### Boundaries confirmed unchanged

Single-currency storefront. No selectable UOM, no warehouse selection, no independent
duplicate lines, no per-line expiry. One paid intent row per SKU - the invariant that makes
Angular's `item_code` mutation mapping safe while `source_line_ids` stays unresolvable.

## CONFIRMED - Authoritative row-level tax display (Phase 23B-4, 2026-08-20)

`cart.pricing_rows` now drives row-level **price and tax** presentation. Angular performs
**zero tax arithmetic**: no rate multiplication, no `net + tax`, no CGST/SGST/IGST split,
and no jurisdiction inferred from state, address, GSTIN or account name.

### The contract, as verified on the wire

Additive on each pricing row: `tax_amount`, `total_amount`, and `tax_components[]` with
`tax_type`, `label`, `rate`, `amount`, `taxable_amount`, `included_in_print_rate`,
`charge_type`.

One deviation from the phase brief, adapted to rather than worked around:
**`included_in_print_rate` is a number (`0`/`1`), not a boolean.** Typing it as boolean
would make `0` truthy after a naive mapping.

### Read, never reconstructed

`total_amount` is **not** `net_amount + tax_amount`. With an inclusive tax the backend
returns `amount 100, net 84.75, tax 15.25, total 100`; adding the tax back would show
115.25 and bill the buyer for it twice. Both figures are rendered exactly as sent.

Likewise `tax_amount` is **not** the sum of its components. ERPNext may assign a rounding
difference to one component, so the parts can differ from the total by a paisa - a fixture
splits an odd amount deliberately so that drift would be caught.

### Component naming

`tax_type ?? label`. A `null` `tax_type` is legitimate rather than missing data - a company
without GST registration produces real, unclassified tax - so such a component is shown,
named by the backend's own `label`, and never relabelled "GST" on a guess. Rates come from
`rate`, never from `amount / taxable_amount`.

`taxable_amount` is deliberately not surfaced: components can have different bases, so
there is no single "taxable value" for a row.

### Roles carry their own tax

A promotion row renders its own `tax_amount` and components, never the paid row's - which
matters most for the same-SKU case, where both rows share an `item_code` and are kept apart
by `row_id`. A gift SKU with no intent row still renders its tax from the projection. A
paid row priced to zero by a 100% discount keeps whatever tax ERPNext gave it; nothing is
inferred from `rate === 0`.

### Cart summary remains document-authoritative

Row totals are item-level attribution; the summary is the financial authority, because
document-level discounts, rounding, additional charges and inclusive taxes all live there.
Nothing sums `pricing_rows`. A `cart-summary-mismatch` scenario rigs the rows to `999` /
`9999` so a future "simplification" that summed them would fail immediately.

### Live verification

Against the real bench at 390px and 1440px: row tax `₹214.92`, row total `₹1,408.92`,
components `SGST 9% ₹107.46 · CGST 9% ₹107.46`, summary unchanged, no overflow, and **no
additional HTTP request** - the tax arrives with the cart.

The breakdown sits in the details column rather than beside the money: in the narrow
right-hand column it was the longest string on a 390px line and squeezed the product name
onto three lines.

### GST environments - corrected in Phase 23B-5

An earlier version of this entry claimed the phase brief's "GST-unregistered bench" premise
was outdated. That was **half right and stated too broadly**. There are two environments,
and they genuinely differ:

| | Site | Company `gst_category` | GSTIN |
| --- | --- | --- | --- |
| Backend automated tests | `test.localhost` | **Unregistered** | none |
| Live Angular smoke | `yob.localhost` | **Registered Regular** | `24AEQPV5389F1ZS` (Gujarat) |

The same Company *name* exists on both sites in different states, which is why the backend
suite legitimately skips the CGST/SGST/IGST classification cases while the live cart
legitimately returns `SGST 9% + CGST 9%`. Neither report was wrong.

So: classified intra-state GST rendering **is** verified against a real registered company
on `yob.localhost`. Generic (`tax_type: null`) rendering stays mock-backed - that is the
case `yob.localhost` cannot produce. IGST remains an environment sign-off (see Phase
23B-5).

## CONFIRMED - Pricing projection, UOM, stock and local quantity (Phase 23B-2, 2026-08-17)

Frontend only. ERPNext remains the sole owner of pricing: Angular computes no rate, no
discount, no threshold and no tax, and this phase removed the last place where it implied
otherwise.

### Two cart concepts, deliberately not merged

| | Purpose |
| --- | --- |
| `cart.items` | persistent customer **intent** - the mutation source, one line per SKU |
| `cart.pricing_rows` | the priced **projection** ERPNext derived - what the cart displays |

The cart page renders `pricing_rows` and tracks by **`row_id`**, never `item_code`: the
same SKU legitimately appears twice, once `Paid` and once `Promotion`, and tracking by
item code made one overwrite the other - the bug backend Phase 23B-1 fixed.

`cart.rows.ts` joins the two once: **every figure comes from the projection**, and only
decoration (thumbnail, product link, readable offer wording) comes from the intent row. A
gift SKU has no intent row, so it renders without a thumbnail or link - correct, not
degraded.

Totals still come from the cart document. Summing projection rows would drop tax, coupons
and transaction-level discounts, and a test pins that the two numbers genuinely differ.

### Paid vs Promotion

Read from the backend's explicit `line_role`, **never inferred from `rate === 0`**: a Paid
row can price to zero through a legitimate 100% discount, and calling that a gift would
tell the buyer something false. Promotion rows show a `Free` badge and carry **no mutation
controls at all** - they are ERPNext output that can change or vanish after any mutation.

`source_line_ids` is typed and carried, but **cannot be resolved in the browser**:
`cart.items` rows expose no `name` for those ids to match. Mutation controls therefore map
by `item_code`, which is unambiguous while the backend keeps one intent line per SKU.
Recorded as a contract gap, not worked around.

### Quantity is local until Add to cart

Item detail used to refetch `get_item(slug, qty)` on every committed quantity. Removed.
Choosing a quantity now changes a signal and issues **no request of any kind**; Add to
cart sends the chosen quantity once and the returned cart is authoritative.

Verified against the real backend: **1 `get_item` on load, 0 after three quantity
changes**, with the displayed price unchanged.

Two reasons, both decisive. The displayed price is a **standalone preview** for the
backend's default quantity - the transaction rate is settled only when the whole cart is
priced as one document, where quantity rules, mixed conditions, transaction-amount rules
and coupons apply and none can be previewed per item. And the refetch made a misconfigured
Pricing Rule break the page: a tier conflict at qty 5 turned typing a quantity into "We
could not load this item". A cart rate differing from the preview is legitimate.

`item-pricing-race.spec.ts` was inverted rather than deleted - the race it guarded cannot
happen once nothing refetches, so it now pins the stronger guarantee.

### UOM

Shown on listing cards and item detail. `get_items` supplies only `stock_uom`, which is
the priced unit for a default-quantity preview; `get_item` supplies a distinct `uom` and
detail shows that. **No UOM selector**, and no extra request - both arrive on the product
response.

### Availability

Three situations, deliberately distinct:

| Backend | Shown |
| --- | --- |
| `is_stock_item: 0` | nothing - availability does not apply to a service |
| stock item, `actual_qty: null` | nothing - no warehouse resolved, so the quantity is unknown |
| stock item, number (**including `0`**) | the quantity, in `stock_uom` |

`null` is never rendered as `0`, and a stocked item with an unresolved warehouse is never
shown as sold out - that invents a stock position the system never reported. Zero *is*
shown, because a resolved warehouse holding none is a fact worth telling the buyer.

Availability is **informational**. Nothing restricts what may be added; ERPNext owns that.
The warehouse is ERPNext-resolved and the browser never sends one.

Variants use the actual variant SKU's own response - no template lookup, no sibling
summing.

### Deliberately unchanged

Duplicate-SKU behaviour, cart mutation semantics, and cart-page quantity operations (a
real cart change is still a server mutation). No selectable UOM, no warehouse selector, no
independent duplicate lines, no per-line expiry, no client-side stock reservation.

### Phase 22 cleanup, completed here

Both recorded items are done: the mock `get_category` payload no longer carries the legacy
`items` array (listing fixtures moved to `MOCK_ITEMS_BY_CATEGORY`, feeding `get_items`),
and the unused `CategoryMetaDto.item_count` is gone.

## CONFIRMED - Scalable bounded catalog listing (Phase 22, complete, 2026-08-16)

**Phase 22 is complete.** Both halves have passed: the frontend migration (22B-2) and the
backend cleanup (22B-3). Nothing about catalog listing is awaiting further work.

### What is active

- **Bounded listing through `get_items`.** Category product listing is served by the
  bounded, sorted, cursor-paginated endpoint. Page size 24.
- **Cursor-based Load More** in Angular, with `has_more` as the sole exhaustion signal -
  an empty page carrying `has_more: true` is a scan-budget continuation, not the end of
  the catalogue.
- **Sorting:** Name A-Z (default), Name Z-A, Newest. No price sorting - there is no
  global customer-price order to sort by.
- **Customer-aware Item Price eligibility remains ERPNext-backed.** Pricing is unchanged
  by this phase: the backend resolves per-customer eligibility and every figure shown is
  the backend's. Angular displays prices and never derives one.

### What was retired

The legacy unbounded `get_category().items` loading **and pricing** path has been removed
from the backend. `get_category` now returns category metadata and children only; it no
longer loads or prices an unbounded item array. The frontend had already stopped reading
that field in 22B-2, so the removal required no frontend change.

### Cleanup for the next Angular touch

Neither is user-visible; both are tidy-ups left deliberately rather than bundled into a
documentation-only change:

- **`src/mock-api/fixtures/catalog.fixture.ts`** still carries `items` on its category
  payloads, via the `MockCategoryPayload` wire type added in 22B-2. It existed to keep the
  mock as strict as the real backend while the field was still on the wire. Now that the
  backend no longer sends it, the mock should stop sending it too, and
  `MockCategoryPayload` should collapse back into `CategoryPayloadDto`.
- **`CategoryMetaDto.item_count`** is unused. It described the size of the embedded array
  that no longer exists, and nothing reads it.

## CONFIRMED - Catalog listing migration to `get_items` (Phase 22B-2, 2026-08-15)

Category product listing moved off the unbounded embedded array onto the bounded,
cursor-paginated endpoint.

```text
before:  get_category -> metadata + subcategories + every item, unbounded
after:   get_category -> metadata + subcategories
         get_items    -> one bounded, sorted, cursor-paginated page
```

Wire-verified against the running backend: envelope, pagination, cursor continuation with
no overlap, terminal `has_more: false`, and every documented error
(`category_not_listable` 422, `category_not_found` 404, `unsupported_sort`,
`page_size_invalid`, `cursor_invalid`, `unsupported_filters`, `unsupported_scope`).

### `has_more` is the only exhaustion signal

The backend scanner has a per-request scan budget, so this is a **valid continuation**:

```json
{ "items": [], "pagination": { "has_more": true, "next_cursor": "..." } }
```

It means the request ran out of budget, not that the catalogue ran out of items. Nothing
in the frontend derives exhaustion from `items.length` or `returned_count`; an empty page
with `has_more: true` keeps Load More available, and nothing auto-chases continuations -
one click, one request. The `catalog-empty-page` mock scenario exists solely to keep that
behaviour under test, since it is otherwise unreproducible.

### Listing state

`ItemListing` (`domains/catalog/state/`) is a plain class the page constructs with `new` -
not a `@Service()`, because one page consumes it. It owns items, cursor, hasMore, the two
loading flags and the **two separate failures**:

- a first page that fails leaves nothing on screen, so it is a page-level error with a retry;
- a Load More that fails **keeps every row already loaded**, shows a message beside the
  button, and does not advance the cursor, so a retry repeats the identical request.

Appends deduplicate by item `name` without reordering - belt and braces over a cursor
contract that already forbids overlap.

### Race protection

`load()` unsubscribes the previous request, which **cancels it at the transport**, and
bumps a generation counter that discards anything that still slips through. So a category
change or a burst of sort changes can never be overtaken by the request it replaced.
Proven by test: superseded requests are observably `cancelled`.

### Sort

| Option | Value |
| --- | --- |
| Name: A to Z (default) | `name_asc` |
| Name: Z to A | `name_desc` |
| Newest | `newest` |

A native `<select>`, not the Phase 21 `SearchSelect`: three options need no search box,
and a native control is better on mobile. **No price sorting** - there is no global
customer-price order, and sorting only the loaded page would be wrong for every page after
the first while looking authoritative.

Sort resets to `name_asc` on category change (a `linkedSignal` keyed on the slug), and a
sort change resets items, cursor and errors - the old cursor is bound to the old query and
the backend would reject it.

### Group categories are not listed

`get_items` answers `category_not_listable` for a group category, so the page checks
`is_group` first and simply does not ask. Subcategory navigation is unchanged.

### Legacy embedded payload - retired

`CategoryPayloadDto` **no longer declares `items`**, so a page that tried to read it
would not compile. **Zero frontend listing consumers remain.**

Backend Phase 22B-3 has since retired the legacy path at source: `get_category` no longer
loads or prices an unbounded item array. Both halves of the migration are therefore done -
see the Phase 22 completion entry above.

### Deferred by design

Search and filters are in the query model (`search: ''`, `filters: []`) and nowhere in the
UI. The backend supports search and rejects non-empty filters today. No search box, no
filter chips, no header autocomplete, no collection or all-products scope.

## CONFIRMED - Reusable address form and location data (Phase 21, 2026-08-15)

### What was already true

The phase brief assumed the address form was duplicated across Account and Checkout. It
was not: `AddressForm` has been a single shared, API-free component since Phase 15, used
by both, emitting values while the page owns the request. Address *display* derivation is
likewise already shared through `toAddressChoice`.

So the real work was the parts that genuinely did not exist: a searchable select, static
geography, an India default, and country/state interaction.

### `SearchSelect` - generic, and Signal Forms native

`design/search-select` knows nothing about addresses; its options are
`{value, label?, hint?}`.

It implements Angular's **`FormValueControl<string>`**, not `ControlValueAccessor`. The
brief suggested the latter, but `ControlValueAccessor` is the Reactive Forms integration
point and **this project has no Reactive Forms** - every form is a Signal Form bound with
`[formField]`. `FormValueControl` is the equivalent contract in that world: a component
exposing a `value` model plus optional `disabled` / `invalid` / `required` / `name`
inputs the `Field` directive fills in. It therefore binds exactly like the native inputs
beside it, with no adapter and no second forms API in the bundle. It also works
standalone via `[(value)]`.

Combobox behaviour: filter by label *and* hint, arrow/Home/End navigation, Enter to
commit, Escape to close and restore focus, click-outside to close, `aria-expanded`,
`role="listbox"`, `aria-selected`, and `aria-activedescendant` so a screen reader follows
the highlight while focus stays in the search box. **Highlighting never commits** - only
Enter or a click - so arrowing past an option cannot silently rewrite a stored address.

### Static geography, generated from the bench

`foundation/locations/location.data.ts` is **generated**, not hand-written or taken from a
generic internet dataset:

| Data | Source |
| --- | --- |
| 250 country names | `frappe/geo/country_info.json` |
| 36 Indian states/UTs + GST numbers | `india_compliance/gst_india/constants/__init__.py` |

That provenance is the point. `country` is a **Link to the Country doctype** - a name that
does not match a Country record is rejected - and `state` is validated by India
Compliance. Taking names from anywhere else risks values that look right and are refused.
It also gets the cases a generic dataset gets wrong: `Dadra and Nagar Haveli and Daman and
Diu` (merged, 26) and `Ladakh` (38). `Other Countries` / `Other Territory` are GST filing
artefacts and are excluded from the picker.

Regenerate with `node scripts/generate-locations.mjs` after a bench upgrade. **No runtime
request, no geography API, no npm dependency.** The data compiles into a lazy chunk: the
initial bundle grew ~1 kB.

Saved values are the canonical names (`India`, `Gujarat`) - never `IN` / `GJ`. The GST
state number is carried as **metadata only**; this phase sends no `gst_state`,
`gst_state_number` or `gst_category`.

### India default, and the rule that protects stored addresses

A **new** address starts on India, overridable via `AddressFormConfig.defaultCountry`.
No state is preselected by default - pre-selecting one a buyer did not choose is how
addresses get filed in the wrong place.

**Editing never applies the default.** The stored record wins outright, and a first-run
guard stops the country-change effect firing during seeding - without it, opening a
Kenyan address for editing would have wiped its state.

Changing country clears a state that cannot survive: it is kept only when the new country
has a controlled list *and* the value is in it. Where the new country has no list nothing
here can validate the value, but it was chosen for a different country, so it goes. Other
fields are untouched.

### Partial updates - unchanged and now directly tested

The form still emits **values**, and the page still diffs them with `changedFields`. That
division is what makes one component serve create and edit without a `mode` flag, and it
is what protects presence-based updates. Newly proven by test at the form level: untouched
fields are omitted, a deliberately cleared field emits `""`, a falsy-but-present `"0"`
postal code is not mistaken for an omission, and an unchanged form produces no patch.

### Deliberately not built

- **`AddressSelectorComponent`** - excluded by the brief, and correctly: selection is
  contextual.
- **`AddressCard`** - the brief allows skipping it if displays are materially different.
  They are: Account renders a list row with Edit/Delete, Checkout renders a radio option.
  The shared part - deciding which fields identify an address - is already extracted into
  `toAddressChoice`. Wrapping two different containers would add conditionals, not reuse.
- **`mode` / `context` / `isBilling` / `showX` inputs** - the form behaves identically
  everywhere, and create-versus-edit is already expressed by whether `initial` is passed.
  `AddressFormConfig` carries only wording and new-address defaults.
- **`phone` / `email` fields** - `get_addresses` still does not return them (the Phase 15
  gap). Rendering them would show blanks over data the frontend cannot see and clear it on
  save.
- **`is_primary_address` / `is_shipping_address` toggles** - default-address management,
  explicitly out of scope since Phase 19.

### Known limitation

Only India ships subdivisions. Every other country falls back to a free-text State field,
which is what the backend accepts there. This is a supported fallback, not a gap - a
picker offering nothing would be a broken control.

## RELEASE READINESS (Phase 20, 2026-08-15)

Review only. **No release blockers were found, and no code was changed.**

### READY

| Area | Evidence |
| --- | --- |
| Authentication & session | login, restore, logout, CSRF, guest 403, safe `returnUrl`; no `sid`/token in web storage |
| Catalog baseline | routes, images, no overflow at any viewport (density deferred) |
| Item detail | contract, quantity-to-add semantics, add-to-cart |
| Cart | DELTA add, non-idempotent, display-only quantity, no auto-retry |
| Coupon | `code` field, canonicalized via `get_cart`, `coupon_discount` distinct |
| Checkout | setter to `get_cart`, backend-owned `is_shippable`, 200 and 201 both accepted |
| Payment | public route, no session dependency, token never persisted, server-owned HMAC |
| Orders | immutable snapshot addresses, backend currency, no Address master reads |
| Account | presence-based partial updates, explicit clears, 409 in-use, no delete retry |
| Responsive & a11y | 390/768/1440: no overflow, one `h1`, ordered headings, labelled inputs, named buttons, visible focus, no traps |

Gate: unit **610/610**, Playwright **831/831** (3 viewports), typecheck clean, production /
development / mock builds clean, production purity clean, live smoke **45/45** read-only
and **64/64** with the disposable account write cycle. Bench verified clean afterwards.

### Verified security properties

- `/payment/:token` reachable with **no session**: no cookies, empty `localStorage` and
  `sessionStorage`, token absent from the DOM, no traceback / `_server_messages` /
  Desk URL / `key_secret` in rendered output.
- Every secure route (`/catalog`, `/cart`, `/checkout`, `/orders`, `/account`) redirects a
  guest to sign-in; `/payment` and `/terms` stay public; unknown routes reach not-found.
- `X-YOB-Original-Host` appears **nowhere** in `src/` or `proxy.conf.json` - it remains the
  edge's to assert.
- No hardcoded development hostnames in shipped code; production `methodBasePath` is
  relative and the production environment file imports nothing from `src/mock-api`.
- Secret scan across all tracked files: no keys, tokens, private keys, real provider IDs
  or customer PII. Mock credentials use RFC 2606 `.invalid`; the Razorpay value is a
  fabricated **publishable** key (`rzp_test_EXAMPLE0001`).

### Runtime measurements (real backend, browser)

One RPC per navigation, **zero duplicates**, and no cart read on navigations that do not
need one. One full page load for the whole journey - navigation is client-side
throughout. No page errors, no broken images, no unexpected failed requests. The single
console error at boot is the guest `get_session_context` 403, which is the documented
session-restore probe.

### KNOWN NON-BLOCKING

| Item | Class | Note |
| --- | --- | --- |
| Full-resolution originals on small cards | BACKLOG | a 1200x1800 JPEG into a 171px mobile card. Needs backend thumbnails or an `IMAGE_LOADER`; markup is already shaped for it |
| Catalog untested at realistic volume | BACKLOG | density, pagination and merchandising deliberately deferred until representative data exists |
| Deferred independent-line cart redesign | BACKLOG | recorded separately; current contract is one row per `item_code` |
| `<app-secure-nav>` rendered twice | BACKLOG | once per breakpoint, so `aria-current` appears twice in the **DOM**. The second is under a `display:none` ancestor and is therefore absent from the accessibility tree - DOM duplication, not an a11y defect |
| `data-testid` ships to production | ACCEPTED | inert attributes, deliberately retained so production smoke tests can address elements |
| `application_access_denied` wording | ACCEPTED | an Origin rejection renders as "This account cannot access this store", which names the account rather than the origin. Safe and non-leaking; only reachable from a wrong-origin host |

### Branch state



## CONFIRMED - Transactional storefront polish (Phase 19, 2026-08-15)

A refinement pass over everything except Catalog, which was deliberately left alone: the
development catalog is too small and too industry-specific to justify decisions about
grid density, hierarchy or merchandising. Catalog received no changes in this phase.

### The finding that mattered: checkout asked for commitment before disclosure

Stacked - which is **both mobile and tablet**, since the two-column layout only began at
1024px - checkout rendered in this order:

```text
Contact -> Billing -> Shipping -> [Proceed to payment] -> Items -> Total
```

The buyer was asked to commit before seeing the amount. Fixed by splitting the page into
three grid regions with explicit row/column placement, so one DOM order yields both
arrangements: stacked it reads selections -> summary -> action, and side by side the
summary sits in its own column and is sticky. No duplicated markup, nothing hidden per
breakpoint, and no change to any setter or `get_cart` behaviour.

### Sparse pages: cap the measure, never invent content

Order Detail stretched a single line item across 1264px, leaving a product name most of a
screen from its price and every totals label a screenful from its figure. The article is
now capped at `max-w-3xl`, totals and payment figures sit in a narrow right-aligned block
with tabular figures, and the who/where grid flows to three columns so the third cell
stops wrapping alone and leaving a hole.

The cap is generous enough that a twenty-line order still uses it well. Padding the page
with invented content was never an option.

### Header stickiness is a phone-viewport decision

Two header rows are about 110px - 13% of a 390x844 phone, permanently, on every page. The
header is now sticky from `sm` up only. On a phone it scrolls away and the browser's own
back gesture is the navigation; wider screens have room to spare.

### Destructive actions recede until requested

`Remove` in the cart and `Delete` in the account were outlined red buttons, so a list of
saved addresses read as a list of hazards. A new `quiet-destructive` variant keeps the
colour - which is what says *what the action does* - and drops the weight. The full
destructive treatment now appears only on the confirmation, where the decision is made.
It also gave a long product name back about 25px on a 390px cart line.

### `*_in_use` reads as information, not alarm

Was "This address is currently in use and can't be deleted." Now "This address is used by
an existing order, so it needs to stay on your account. You can edit it instead." Shown
in the ordinary notice tone, never as an error: nothing went wrong. The referring
document is still deliberately unnamed.

### Smaller corrections

- Cart thumbnails use the **product** ratio; a 2:3 photograph contained in a square box
  shrank to a strip and stopped resembling the card it was added from.
- Cart lines keep the image beside the text at every width. Fully stacked, a phone gave
  each line ~230px and orphaned the thumbnail on a row of its own.
- `12 Nos x₹11.25` - a zero-width `sr-only` span sat between the multiplication sign and
  the rate and contributed no whitespace. Reordered.
- Payment page left-aligned in the shared container, so the brand sits above the content
  rather than off to one side.
- `netbanking` is capitalized for display only; the stored value is untouched.
- Order Detail badges now use the shared `Badge` primitive with the same tone mapping as
  the orders list, so one order cannot read two ways.
- Grand totals in cart, checkout and order detail share one treatment and tabular figures.

### Deliberately left unchanged

- **Catalog**, per the phase brief.
- **Notice persistence.** Notices clear when the next action starts and on navigation.
  Auto-dismiss timers were not added: a total or a refusal a buyer has not read yet
  should not vanish on a timer, and no toast library is warranted.
- **Totals heading offset** on Order Detail - the section heading sits left while the
  figures align right. Conventional for an invoice, and the alternative pulled the
  figures away from the edge they should align to.

## CONFIRMED - Product & category image standardization (Phase 18, 2026-08-15)

The frontend owns the **box and the behaviour**; the business owns the **picture**. YOB is
a multipurpose B2B storefront, so no source image may change the layout around it.

### Image source contract - wire-verified

| DTO | Field | Live value |
| --- | --- | --- |
| Category (list + subcategory) | `thumbnail` | `/files/F001779FGreyHarbor-70417.01.jpg` |
| Category | `banner` | `null` on every record |
| Item (listing + detail) | `image` | `/files/3502LFWashedBasil-…jpg` |

Root-relative, same-origin, served by the edge in production and by the dev proxy's
existing `/files` entry in development. **No URL rewriting**: no base prefix, no media
host, no environment media root. The one normalization is in
`foundation/media/media-url.ts`, which treats `''` and whitespace as absent - a cleared
Frappe `Attach Image` can arrive as an empty string, and `src=""` re-requests the page and
then fails as an image, producing the very broken-image icon the fallback exists to stop.

Measured on the bench: **products 1200x1800 (2:3 portrait)**, one 512x768; **categories
1200x1200 (1:1)**. Every live record has an image, so the no-image path exists only in
mocks.

### The standard

`design/media` owns all of it. One primitive, five box shapes, chosen by purpose:

| Use | Ratio | Fit | Why |
| --- | --- | --- | --- |
| product card | 3:4 | `contain` | the whole product, whatever shape it was shot in |
| category card | 4:3 | `cover` | editorial; cropping a category banner loses nothing |
| item detail | height-capped | `contain` | the subject of the page |
| cart thumbnail | 1:1 | `contain` | a reminder, not an examination |

**Why products are `contain`.** The square `cover` box this replaced cut a third off every
2:3 photograph, top and bottom - collars and hems on apparel, threads on a fitting.
`cover` only looks right when the source ratio happens to match the box, which is a fact
about one client's photo library, not a decision a master project can make. Categories are
the deliberate exception, and the two are **not** forced to share a ratio.

**The item-detail box is capped by viewport height, not given a ratio.** At 3:4 across a
full column it produced an image taller than the screen, pushing the price and Add to cart
below the fold. Height derives from the viewport and never from the image, so it remains
layout-shift free.

### Fallback and failure are the same thing

A missing image and a URL that 404s are identical to a buyer: there is no picture. Both
render one neutral inline glyph, at exactly the same box size. Verified in a real browser -
the broken fixture yields `img=0, placeholder=1, box=258x194`, the same box as its working
neighbour. Deliberately not a stock photo: a fallback showing a t-shirt would be actively
wrong for a bearings catalog.

### NgOptimizedImage - adopted, with a documented limit

Used with `fill`. It buys lazy loading by default, a real `fetchpriority` on the one image
that deserves it, and enforcement that every image has a sized container.

Two compatibility findings worth recording:

- **It rejects Base64 sources outright** (`NG02952`), which ruled out data-URI fixtures.
- **`sizes` must be responsive units**; a pixel value is rejected, so the fixed-size cart
  thumbnail passes none.

It does **not** resize: `srcset` generation needs an `IMAGE_LOADER`, and no image CDN was
introduced. Full-size originals are therefore sent to small cards - a 1200x1800 JPEG into
a 171px mobile card. **This is the main outstanding cost of the phase.** The fix is
backend-rendered thumbnails or a loader, not markup.

Exactly one image in the storefront is `priority`: the item-detail hero.

### Alt text

The image describes the *thing*, never itself - "Product image of…" appears nowhere.

- **Cards: empty alt.** The whole tile is one link whose text is the product name, so
  naming the image makes a screen reader announce the same product twice.
- **Item detail: the product name.** There the image is the subject of the page.
- **Placeholders: `aria-hidden`.** The absence of a picture is not information.

### Mock media

`public/mock-media/` holds flat SVGs at deliberately awkward intrinsic sizes - 2:3, 3:2,
1:1, and one 3000x2000 - plus a null case and a path that 404s. `angular.json` includes
that directory **only in the `mock` configuration**, the same structural guarantee
`fileReplacements` gives the mock API. Verified: mock bundle 6 files, production and
development 0, and `/mock-media/…` 404s on the development server.

Flat labelled rectangles rather than photographs on purpose: a cropping or stretching bug
is obvious at a glance in one and invisible in the other.

### Copy

Sentence case is the convention, confirmed by audit - "Add to cart", "Proceed to
checkout", "Sign in", "Pay now", "Save address". **"Proceed to Payment" was the only
title-case action label in the application** and is now "Proceed to payment". No other
copy changed.

## CONFIRMED - Storefront UX & visual design (Phase 17, 2026-08-14)

A styling pass over the whole buyer journey. No business logic, no contract changes, no
structural rewrites of passing pages. Every page was inspected in a real browser at
390x844, 768x1024 and 1440x900 before anything was edited.

### The defect that mattered most

**The product grid was not a grid.** Catalog and category pages wrapped each card in
`<li class="flex">`, and the card component's host is `display: contents` - so the
card's own root became a *flex item*, which shrinks to its content instead of filling
the grid cell. Every product card was a different width, image placeholders were
different sizes, and prices landed at different heights. It was worst at 390px, where
one card was full-width and the next was half.

The fix is `w-full` on the card root and a plain `<li>`. It is one word per card, and it
is the single largest visible change in this phase.

### Design decisions worth keeping

**Button variants exist now, and are chosen by meaning.** `yob-button` carried one
treatment on the rule that a second gets added when a screen needs one. Three did: the
cart rendered **Remove** at the same weight as **Proceed to checkout**, checkout rendered
three **Add new address** buttons heavier than **Proceed to Payment**, and account had
given up and hand-written `secondary`/`destructive` class strings as page fields. There
are four - `primary`, `secondary`, `destructive`, `quiet` - and two sizes. No `colour`
or `width` input; restyling means editing the class table in the component.

**One primary action per view.** Everything supporting is secondary, and destructive
actions are outlined rather than filled - a list of filled red buttons reads as a page
full of errors.

**Two new primitives, both earning their place.** `PageHeader` replaced the same title
markup hand-written on eleven pages, which had already drifted so pages did not start at
the same height. `Badge` replaced ad-hoc pills and gave order status semantic tones -
before it, `Completed` and `Cancelled` rendered in identical grey in a list a buyer scans
precisely to tell them apart. Colour is always redundant: every badge shows its word.

**Deliberately *not* extracted:** card containers, summary panels and list rows. Those
legitimately differ per page, and wrapping them would force pages to fight the
abstraction. The rule applied throughout: extract what is genuinely identical, leave what
differs in the page where a designer can edit it.

**Repeated records are divided lists, not stacks of cards.** Orders, account addresses
and contacts, address choices and payment methods. A border around every row of the same
kind of thing adds no information and makes a storefront look like an admin screen. The
selected choice is marked with a tint and a left accent that reserves its own space, so
selecting does not shift the row.

**`SHELL_CONTAINER` is shared by both shells.** The public shell used to centre its own
narrower container while the pages inside centred theirs, so sign-in and payment visibly
did not line up with the brand above them.

### Two real gaps closed

- **There was no way to sign out.** `SessionStore.signOut()` existed and was tested from
  Phase 3 but had no UI. The header now has one.
- **The active nav link was visual only.** `routerLinkActive` swaps classes and does not
  set `aria-current`; `ariaCurrentWhenActive="page"` was missing.

### The cart count never triggers a request

The nav badge reads whatever `CartStore` already holds. Fetching from the shell would put
a cart request on every navigation, including pages unrelated to the cart, purely to
decorate a link. So it appears once something has genuinely loaded the cart and is absent
before that - a wrong number would be worse than none.

### Visual tests assert outcomes, never classes

`e2e/design.visual.spec.ts` checks grid alignment by measured width, hierarchy by
measured control width, navigation by role and accessible name, and `aria-current` rather
than styling. A test asserting `bg-slate-900` would fail the moment a copied client
restyled the storefront - which is the point of a master project - while proving nothing
a buyer can perceive.

### Known trap, hit again

A backtick inside an HTML comment **inside a component template literal** terminates the
literal and produces baffling errors elsewhere in the file (`NG1001: Decorator argument
must be literal`). It has now caught three phases. The repo-wide sweep is:

```bash
python3 -c "import pathlib,re;[print(f) for f in pathlib.Path('src').rglob('*.ts') for m in re.finditer(r'<!--.*?-->',f.read_text(),re.S) if '\`' in m.group(0)]"
```

## CONFIRMED - Account address & contact management (Phase 15, 2026-08-14)

Buyers can now add, edit and delete their own addresses and contacts at `/account`.
The forms are the existing checkout `parts/` doing double duty - `address-form` and
`contact-form` gained `initial`, `heading` and `submitLabel` inputs rather than the
domain growing a second, nearly identical pair.

### Field presence is the write contract, and it is load-bearing

`update_address` and `update_contact` apply a field **because the key is present**,
whatever its value:

| In the request | Effect |
| --- | --- |
| key omitted | the stored value is kept |
| `"value"` | set |
| `""` | **deliberately cleared** |

Wire-verified. This is why the page never submits the form object: a form serialises
every input it renders, and the ones the buyer never touched arrive as `""`. Sending
that whole object would clear the customer's second address line, phone and email - the
same data loss backend Phase 15B was written to stop, reintroduced from the client.

`account.changed-fields.ts` therefore diffs the form against the record **as it was when
the editor opened** and sends only what differs. The comparison is strict inequality
after trimming, never truthiness: `""` is a change the buyer asked for, and dropping it
would make the UI appear to save and then show the old value back.

When nothing changed, no request is sent at all.

### Deletes are confirmed once, sent once, and never retried

A referenced record cannot be deleted; the server refuses with `address_in_use` /
`contact_in_use` at 409 and detaches nothing. **That is the system working, not a
fault** - so the page says so plainly, keeps the record, and offers no retry for
something that can never succeed. The referring document is deliberately not named: it
would leak order and cart identifiers onto the account page.

Failures are split by whether the outcome is actually known:

| Outcome | Response |
| --- | --- |
| `*_in_use` (409) | definite refusal - keep the record, no re-read |
| `*_not_found` (404) | the record is gone - re-read the list, which becomes the truth |
| status 0 or 5xx | **unknown** - re-read the list and report what it shows |

The recovery for an unknown outcome is a **read**, never another delete: a delete that
succeeded and lost its response answers `404` the second time, so a retry would report a
failure for something that worked. Wire-verified.

`address_not_found` is also the answer for another customer's record, so the wording
covers both - the frontend genuinely cannot tell them apart and must not imply it can.

### Not a session problem

A business refusal on one record is not a lost login. Nothing in this domain clears
`SessionStore`, redirects to sign-in, or suggests the buyer is signed out.

### Documented API gap: no phone or email on an address

`get_addresses` does not return `phone` or `email_id`, so `AddressFormValues` has no such
fields and the address form has no such inputs. Adding them would mean rendering blanks
over data the frontend cannot see and clearing it on the next save. Contact details are
edited on the contact form, which does carry them. The live smoke asserts their absence,
so the day the backend adds them, the gap is reported rather than silently persisting.

### Focus, because a confirmation destroys the button that opened it

The delete confirmation replaces the row's actions. A focused element that leaves the
document takes focus to `<body>` with it, and the next Tab restarts from the top of the
page - stranding a keyboard user mid-way through a destructive action. So the
confirmation takes focus when it appears (on **Cancel**, which is also first in the DOM,
so the reflexive Enter keeps the record) and hands it back to the Delete button when
dismissed. Found by the Phase 15 E2E keyboard test, not by review.

### Verification level (Phase 15)

| Endpoint | Level |
| --- | --- |
| `get_addresses`, `get_contacts` | **wire** |
| `add_address`, `add_contact` | **wire** |
| `update_address`, `update_contact` | **wire**, including presence semantics both ways |
| `delete_address`, `delete_contact` | **wire**, including the repeated-delete 404 |

The live smoke covers Account read-only by default (45 checks). Its write cycle is gated
behind `YOB_SMOKE_ACCOUNT_WRITE=1` (64 checks, all passing 2026-08-14), creates a record
named `ZZ SMOKE TEST - DELETE ME`, edits and deletes only that record, and never touches
a pre-existing one. `add_address` answers **201**, not 200.

#### Address geography is validated as a unit, and the fixture must not invent it

The write cycle borrows `country`, `state` and `pincode` from an existing Address rather
than hardcoding them. All three are site-specific and validated together:

- `state` is checked against the country's list - `Testing` was refused with
  "Please select a valid State from available options".
- `pincode` is checked for format (6 digits, not starting with `0`, so `000000` failed)
  **and then for association with the state** - "Postal Code 999999 for address is not
  associated with Gujarat."

So the postal code is a validation-bearing field on this site, not decoration, and no
invented value can satisfy a rule that ties it to a state the script did not choose. The
title, street and city stay obviously synthetic. If no existing Address carries all
three fields the write cycle skips with a diagnostic rather than guessing.

#### `_server_messages` beside a 422 - checked, and safe

A YOB `validation_failed` envelope arrives with a Frappe `_server_messages` sibling. The
browser client ignores every sibling key, but that is not the same as it being safe to
send, so it was inspected on the wire:

```json
{"message":"Please select a valid State from available options","as_table":false,
 "title":"Invalid State","indicator":"red","raise_exception":1,
 "__frappe_exc_id":"c6e0f6a1…"}
```

It repeats the **same sanitized wording** already in `errors[0].detail`, plus display
hints and an opaque exception id. No HTML, no URLs or Desk paths, no traceback, no
doctype internals, no SQL. `exc` and `exc_type` are absent entirely. **No backend change
is warranted.** The smoke now asserts all four of those properties, so a future backend
change that starts leaking markup or internals into the sibling is reported rather than
discovered later.

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
| Frontend Phase 15 - Account address & contact management | **PASS** |
| Frontend Phase 17 - Storefront UX & visual design | **PASS** |
| Frontend Phase 18 - Product & category image standardization | **PASS** |
| Frontend Phase 19 - Transactional storefront polish | **PASS** |
| Frontend Phase 20 - Release readiness review | **READY WITH NON-BLOCKING BACKLOG** |
| Frontend Phase 21 - Reusable address form, search select, static geography | **PASS** |
| Frontend Phase 22B-2 - Catalog listing migration to `get_items` | **PASS** |
| Backend Phase 22B-3 - legacy unbounded catalog path retired | **PASS** |
| **Phase 22 - scalable bounded catalog listing (overall)** | **PASS - complete** |
| Frontend Phase 23B-2 - pricing projection, UOM, stock, local quantity | **PASS** |
| Frontend Phase 23B-4 - authoritative row-level tax display | **PASS** |
| **Phase 23B-5 - ERPNext pricing compatibility sign-off audit** | **PASS with environment sign-off** |
| Frontend Phase 23B-5U-FE - authoritative selling UOM display & UOM conflict | **PASS (mock-verified; no live smoke)** |
| Phase 23B-5U-FE-GATE - E2E gate integrity (no reused server) | **PASS** |
| Frontend Phase 24C - variant family selection UX | **PASS** |
| Phase 24D-2 - variant wire-contract sign-off (API 3.3.0) | **PASS (live smoke pending)** |
| Frontend Phase 25D - storefront navigation & category filters (API 3.4.0) | **PASS (live smoke pending)** |
| Frontend Phase 25E - storefront pages & content blocks (API 3.4.0) | **PASS (live smoke pending)** |
| Frontend Phase 25H - system route content slots & Home (API 3.5.0) | **PASS (live smoke pending)** |
| Frontend Phase 25J - full-width content sections & fixed inner column (API 3.6.0) | **PASS (live smoke pending)** |
| Frontend Phase 25L - contained & full-width content blocks (API 3.7.0) | **PASS (live smoke pending)** |
| Frontend Phase 26B - responsive header & product typeahead (API 3.8.0) | **PASS (live smoke pending)** |
| Frontend Phase 16 - Cart coupon | **PASS** |
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
