# YOB Storefront API Contract Notes

> **Phase 1 status: the live contract has been verified.** Sections below marked
> **VERIFIED** were captured from the running local stack on 2026-08-10. See
> `reference/api/live/README.md` and `reference/api/live/verified-responses.json`.
> Where this document and `reference/api/openapi.json` disagree, this document wins.

## 1. Source Files

This document is derived from:

- `reference/api/openapi.json`
- `reference/api/postman_collection.json`
- `reference/api/live/verified-responses.json` (captured, authoritative)

The source set currently contains 33 operations in both OpenAPI and Postman.

The OpenAPI description explicitly says this is a Frappe RPC-style API. Every response is wrapped by Frappe in an outer `message` object. The inner YOB envelope contains `data`, optional `notice`, optional `meta` on success, or `errors[]` on failure.

There is no `success` boolean. Frontend logic should branch on HTTP status and normalized YOB error codes.

## 2. Base URL and Local Development

OpenAPI server reference:

```text
https://storefront.local
```

Postman local variable:

```text
http://storefront.local:8080
```

For local Angular development, prefer browser calls to same-origin `/api/...` and use the Angular dev proxy to forward them to the already-working local YOB/Frappe edge endpoint.

This reduces CORS/session-cookie problems and keeps production code independent of a development host/port.

Do not hard-code `http://storefront.local:8080` throughout domain code.

## 3. Frappe/YOB Envelope - VERIFIED

The outer `message` wrapper **is always present** on YOB endpoint responses, for both
success and failure. The inconsistent OpenAPI examples that show only the inner
envelope are documentation defects, not a second wire format.

Success response:

```json
{
  "message": {
    "data": {},
    "notice": "Optional human-readable notice",
    "meta": {}
  }
}
```

Error response:

```json
{
  "message": {
    "errors": [
      {
        "code": "some_error_code",
        "detail": "Human-readable detail",
        "field": "optional_field",
        "details": {"correlation_id": "0246f04aea554d10"}
      }
    ]
  }
}
```

Verified envelope rules (from `yob_core/api/response.py`, confirmed on the wire):

- `data` is always present on success and may be an object, an array, or `null`.
- `notice` and `meta` are **omitted entirely** when empty. `get_session_context`
  returns no `notice` at all, so both must be optional in every type.
- `errors` is always a list and never appears alongside `data`.
- `field` and `details` are optional on each error. `cart_empty` has no `field`.
- There is no `success` flag. Branch on HTTP status, then on `errors[0].code`.
- Frappe may add its own keys **next to** `message` at the top level. Login adds
  `home_page` and `full_name`. Unknown top-level siblings must be ignored, not
  treated as a parse failure.

### 3a. The second, non-YOB failure shape - VERIFIED

Two request rejections happen inside Frappe *before* the YOB envelope exists, and
return a raw Frappe exception body with **no `message` wrapper and no `errors`
array**:

```json
{
  "exception": "frappe.exceptions.PermissionError: ...",
  "exc_type": "PermissionError",
  "exc": "<full python traceback as a JSON-encoded string>",
  "_server_messages": "<JSON-encoded list>"
}
```

| Situation | Status | `exc_type` |
| --- | --- | --- |
| Secure endpoint called with no session | 403 | `PermissionError` |
| Mutating call with a missing/stale CSRF token | 400 | `CSRFTokenError` |

Consequences the network layer must honour:

- Normalize this shape into the same typed frontend error. Branch on
  `exc_type` + HTTP status, never on the HTML-bearing `exception` text.
- Frappe's phrase *"Function X is not whitelisted"* is its generic wording for
  "whitelisted but not guest-allowed". It does not mean the endpoint is missing.
- The body carries a **full server traceback**. Never surface it to users and never
  log it verbatim.
- A non-JSON error body is also reachable: the edge proxy answers `421` with an HTML
  page for an unexpected `Host`. Do not assume every failure parses as JSON.

## 4. Authentication Model - VERIFIED

The API uses Frappe session-cookie authentication.

Observed `Set-Cookie` on successful login:

```text
sid=…; Expires=<+7d>; Max-Age=612000; HttpOnly; Path=/; SameSite=Lax
system_user=no; full_name=…; user_id=…; user_lang=en   (all Path=/; SameSite=Lax)
```

`sid` has **no `Domain` and no `Secure` attribute**: it is host-scoped and HttpOnly.
The SPA can neither read it nor needs to. Rules:

- the browser manages the `sid` cookie
- do not manually read/copy/store `sid` in localStorage
- because the cookie is host-scoped, the SPA and the API must share one origin - this
  is the real reason the dev proxy exists, not merely CORS convenience
- do not add `X-YOB-Original-Host` in Angular browser code; the edge proxy owns it

### 4a. The `application` parameter - RESOLVED

`application` is **required**, not optional as the OpenAPI file suggests. Omitting it
answers `422 validation_failed` with `field: "application"`.

| Endpoint | `application` |
| --- | --- |
| `login_with_password` | required (body) |
| `request_otp` | required (body) |
| `get_session_context` | required (query) |
| `login_with_otp` | not accepted - recovered from the challenge |

The value on the current local site is `STOREFRONT`. It identifies the calling
application, and a copied client project may be issued a different code, so it belongs
in environment configuration rather than hardcoded in domain code.

An unknown value answers `403 application_access_denied`.

### 4b. Session restore returns a non-YOB body for guests - VERIFIED

`get_session_context` is **not** guest-allowed. Calling it without a session returns
the raw Frappe `403 PermissionError` body from section 3a, not a YOB error envelope.

Session restore must map that specific shape to *guest*, not to a transport fault.

### 4c. Login rate limit - VERIFIED

`yob_auth` allows **10 password attempts per 300 s keyed on the username**, counted
*before* authentication, so successful logins consume the budget too. Exceeding it
answers `429 rate_limit_exceeded`, which is easy to mistake for a wrong password.
Sign-in UI should present `rate_limit_exceeded` distinctly from
`invalid_credentials`, and automated tests must not log in in a loop.

## 5. CSRF - VERIFIED

Authenticated non-GET operations require:

```text
X-Frappe-CSRF-Token
```

Verified token location - **`message.data.csrf_token`**, returned identically by
`login_with_password`, `login_with_otp` and `get_session_context`.

Frontend behavior:

```text
login/session restore
-> store csrf token in in-memory session state
-> csrf interceptor adds header to same-origin mutating YOB requests when token exists
```

Do not persist the CSRF token. A missing or stale token answers
`400` + `exc_type: "CSRFTokenError"`; the correct recovery is to re-run
`get_session_context`, **not** to log the user out.

### 5a. Verified session payload

`login_with_password`, `login_with_otp` and `get_session_context` all return the same
`data` payload, differing only in `authentication_method`
(`"password"` / the OTP method / `"session"`):

```json
{
  "authenticated": true,
  "authentication_method": "session",
  "user": {"name": "", "full_name": "", "user_image": null, "email": "", "mobile_no": null},
  "context": {"application": "STOREFRONT", "profile_doctype": "Customer", "profile_name": ""},
  "csrf_token": "…"
}
```

`roles` and `company` are deliberately withheld by the backend. Authorization is
re-decided server-side on every request, so the client must never gate on them.

`logout` returns `{"data": {"authenticated": false}, "notice": "Logout successful."}`.

## 6. Central Network API

Implement one small Frappe-aware network helper in `foundation/network`.

Conceptual responsibility:

```text
YobApiClient
  get<T>(method, query?)
  post<TResponse, TBody>(method, body?)
```

Where `method` is the Frappe method name, for example:

```text
yob_storefront.api.catalog.get_categories
```

and the helper constructs:

```text
/api/method/yob_storefront.api.catalog.get_categories
```

It should:

1. build the method URL
2. call Angular HttpClient
3. unwrap verified Frappe `message`
4. return the typed YOB success payload
5. normalize HTTP/YOB failures into a typed `YobApiError`
6. preserve error `code`, `detail`, `field`, and extra details when present

Do not create a giant business `ApiService` containing every endpoint.
Each domain should own small focused API files that use the common network helper.

## 7. Error Shape

Use a normalized frontend error concept similar to:

```text
YobApiError
- httpStatus
- code
- detail
- field?
- details?
- original?
```

The full stable code registry is recorded in
`reference/api/live/verified-responses.json` under `stable_error_codes`, sourced from
`yob_core/api/errors.py`, `yob_auth/api/response.py` and
`yob_storefront/api/response.py`. It is far larger than the four codes the OpenAPI
examples happen to show, and covers catalog, cart, coupons, contacts/addresses,
orders, checkout and payment.

Codes that change frontend behaviour rather than just messaging:

```text
application_access_denied   valid session, wrong/untrusted domain - NOT session expiry, do not log out
rate_limit_exceeded         429 on login - distinct from invalid_credentials
internal_server_error       carries details.correlation_id, worth surfacing for support
```

Do not switch UI behavior on error message text when a stable code exists.

Generic UI can display `detail`.
Domain pages can react to `code` when needed.

## 8. Endpoint Inventory

### Auth - 5

```text
GET  yob_auth.api.auth.get_session_context        secure
POST yob_auth.api.auth.login_with_otp             public
POST yob_auth.api.auth.login_with_password        public
POST yob_auth.api.auth.logout                     secure + CSRF
POST yob_auth.api.auth.request_otp                 public
```

Verified request inputs (all listed fields are required, not optional):

```text
get_session_context: application (query)
login_with_otp:      challenge_id, otp
login_with_password: application, username, password
request_otp:         application, identifier, method
logout:              empty body
```

Success payloads are now verified - see section 5a. `request_otp`'s `data` keys are
the one remaining unknown in this group; OTP is not exercisable on the current bench.
Its `notice` is deliberately non-committal so a client cannot infer whether an account
exists, so never branch on it.

### Address and contact - 8

```text
POST yob_storefront.api.address.add_address                 secure + CSRF
POST yob_storefront.api.address.delete_address              secure + CSRF
POST yob_storefront.api.address.delete_contact              secure + CSRF
GET  yob_storefront.api.address.get_addresses               secure
GET  yob_storefront.api.address.get_contact_for_customer    secure
GET  yob_storefront.api.address.get_contacts                secure
POST yob_storefront.api.address.update_address              secure + CSRF
POST yob_storefront.api.address.update_contact              secure + CSRF
```

Documented concrete inputs:

```text
delete_address: name?
delete_contact: name?
get_contact_for_customer: customer? query
```

The empty request bodies in the OpenAPI/Postman source are now resolved from the
backend implementation (`yob_storefront/api/address.py`):

```text
add_address:    address_title, address_type, address_line1, address_line2,
                city, state, country, pincode, email, phone, fax,
                is_primary_address, is_shipping_address, disabled,
                tax_category, gstin, gst_category, gst_state, gst_state_number
update_address: the same fields plus a required `name`
update_contact: name, salutation, first_name, last_name, designation,
                company, gender, email, phone
```

Notes: `address_type` defaults to `Billing`; `is_primary_address`,
`is_shipping_address` and `disabled` are `cint()`-coerced so send `0`/`1`; address
`email` maps to backend `email_id` and contact `company` maps to `company_name`.

Field *names* are settled. Allowed *values* for `address_type`, `gst_category` and
`tax_category` are still unverified - confirm those before shipping a write form.

`get_addresses` and `get_contacts` contain useful success examples and should seed mock fixtures after the outer wrapper is verified.

### Cart - 9

```text
POST yob_storefront.api.cart.add_to_cart                    secure + CSRF
POST yob_storefront.api.cart.apply_coupon                   secure + CSRF
POST yob_storefront.api.cart.clear_cart                     secure + CSRF
GET  yob_storefront.api.cart.get_cart                       secure
POST yob_storefront.api.cart.remove_coupon                  secure + CSRF
POST yob_storefront.api.cart.remove_from_cart               secure + CSRF
POST yob_storefront.api.cart.set_cart_billing_address       secure + CSRF
POST yob_storefront.api.cart.set_cart_contact               secure + CSRF
POST yob_storefront.api.cart.set_cart_shipping_address      secure + CSRF
```

Inputs:

```text
add_to_cart: item_code?, qty? (default documented as 1)
apply_coupon: code?
clear_cart: empty body
remove_coupon: empty body
remove_from_cart: item_code?
set_cart_billing_address: billing_address?
set_cart_contact: contact_person?
set_cart_shipping_address: shipping_address?
```

The documented cart response includes server reconciliation fields:

```text
cart_updated
price_updated_items
removed_items
```

Verified live: those three fields are present on a **plain `get_cart` load**, not only
after a mutation, so reconciliation must be handled on every cart response.

The verified `get_cart` envelope wraps the cart in a container:

```text
data.cart                 the cart document (name, currency, totals, status, items[], …)
data.contact              resolved contact or null
data.billing_address      resolved address or null
data.shipping_address     resolved address or null
data.cart_updated         boolean
data.removed_items        array
data.price_updated_items  array
```

The UI must treat the returned cart as authoritative after every cart mutation/load and be able to notify the user when the backend changes/removes items or updates prices.

Do not update only a local line item and assume backend totals/pricing remain unchanged.

Still unverified: the **line-item shape inside `cart.items`** - the bench cart is
empty. Capture it before building the cart domain (Phase 10).

`ordered_on` is a naive `YYYY-MM-DD HH:MM:SS.ffffff` string with no timezone marker;
do not feed it to `new Date()` and assume UTC.

### Catalog - 3

```text
GET yob_storefront.api.catalog.get_categories      secure
GET yob_storefront.api.catalog.get_category        secure
GET yob_storefront.api.catalog.get_item            secure
```

Inputs:

```text
get_categories: parent_slug? query
get_category: slug?, qty? query
get_item: slug?, qty? query
```

Catalog examples show B2B pricing information such as:

```text
base_price
discount_amount
discount_percentage
pricing_rule_label
rate
net_amount
tax_amount
total_amount
stock_uom
```

This means Angular must NOT recreate pricing rules, discount rules, or tax calculations.
Quantity can affect server pricing, so quantity-aware price refresh must call the appropriate backend endpoint.

The `get_item` success shape is resolved from `yob_storefront/api/catalog.py` and
recorded in `reference/api/live/verified-responses.json`. Points that will bite:

- the item slug is returned as **`custom_slug`** by `get_item` but as **`slug`** in
  `get_category`'s item rows - the names genuinely differ between the two endpoints
- `pricing` is a nested object duplicating most top-level pricing fields and adding
  `item`, `selling_price_list`, `total_discount`, `pricing_rules`; prefer the
  top-level fields
- `available_rules` is a list of human-readable offer label **strings**, not objects
- `get_item` returns no `meta`
- `thumbnail`, `banner` and `image` are raw stored paths, **not absolute URLs** - the
  backend's `get_url()` calls are currently commented out, so the frontend must
  resolve them
- an unknown `parent_slug` on `get_categories` answers `200` with `data: []`, not `404`

The reason the OpenAPI 200 example holds an `internal_server_error` body is that
`get_item`'s `try/except` is commented out in the backend, so an unexpected fault
there escapes as a raw Frappe 500 instead of the YOB envelope. Still true today.

### Checkout - 1

```text
POST yob_storefront.api.checkout.proceed_to_payment    secure + CSRF
```

The body is empty. The success shape is resolved from
`yob_storefront/api/checkout.py`:

```json
{"message": {"data": {"payment_url": "/payment/<token>",
                      "payment_request": "PREQ-…",
                      "token": "<token>"},
             "notice": "Proceed to payment"}}
```

Status is `201` when a Payment Request is created and `200` when an open one is
reused. `payment_url` is a **relative SPA path**, so the public payment route must own
`/payment/:token`. The token expires one hour after issue.

Precondition failures, in the order the backend checks them - all `422` unless noted:

```text
cart_not_found              404
cart_empty                  (verified live)
contact_required            field=contact_person
billing_address_required    field=billing_address
shipping_address_required   field=shipping_address, only when the cart is shippable
```

The success path was deliberately not triggered during capture because it creates a
real Payment Request.

### Store/CMS config - 1

```text
GET yob_storefront.api.cms.get_config    secure
```

The example includes fields such as:

```text
allow_guest_purchase
allowed_payment_modes
company
default_currency
default_price_list
default_privacy_page
default_terms_page
default_warehouse
store_domain
store_logo
store_name
```

Verified live. Confirmed authenticated, so it cannot bootstrap public sign-in pages
unless the backend changes that security contract.

`allow_guest_purchase` arrives as the integer `0`/`1`, not a JSON boolean - true of
Frappe check fields generally (`is_group`, `is_primary_address`, `is_shippable`, …).
Type them as numbers and coerce at the edge; do not declare them `boolean`.

### Orders - 2

```text
GET yob_storefront.api.order.get_order_details    secure
GET yob_storefront.api.order.get_orders           secure
```

Input:

```text
get_order_details: order_id? query
```

The list example includes:

```text
name
transaction_date
delivery_date
status
grand_total
```

`get_order_details` returns at least these `data` keys (from
`yob_storefront/api/order.py`):

```text
name customer status transaction_date delivery_date currency
original_total discount subtotal net_total tax grand_total rounded_total
contact_person contact_email contact_mobile
billing_address_name shipping_address_name payment_terms_template
```

`original_total` and `discount` are computed server-side from the order lines - do not
recompute them. Orders not owned by the caller answer identically to non-existent ones
(`404 order_not_found`), deliberately, so the endpoint cannot be used to probe.

The item and payment-log sections of the response were not fully enumerated; capture a
real order before typing the full detail DTO (Phase 15).

### Public payment - 3

```text
GET  yob_storefront.api.payment.get_checkout_data    public
POST yob_storefront.api.payment.process_payment      public
POST yob_storefront.api.payment.verify_payment       public
```

Inputs:

```text
get_checkout_data: token? query
process_payment: token?, payment_method?
verify_payment: razorpay_order_id?, razorpay_payment_id?, razorpay_signature?
```

These endpoints are explicitly unauthenticated in the current OpenAPI contract and therefore belong in a public token-based payment flow, not behind the secure-route guard.

The presence of Razorpay verification fields is part of the current API contract; do not expose secrets or perform signature verification in Angular. The backend verification endpoint owns verification.

### Authenticated payment methods - 1

```text
GET yob_storefront.api.payment_method.get_payment_methods    secure
```

Inputs:

```text
customer?
company?
order_amount?
```

The endpoint summary explicitly describes payment methods available to the authenticated customer.

## 9. Security Summary

Current source inventory:

```text
33 total operations
27 session-protected operations
6 public operations
15 operations explicitly requiring X-Frappe-CSRF-Token
```

Public operations are currently:

```text
login_with_otp
login_with_password
request_otp
get_checkout_data
process_payment
verify_payment
```

Do not infer public/private routing from endpoint names; keep it aligned with the security contract.

## 10. Dev Proxy Requirement - VERIFIED ENVIRONMENT

The target local flow is unchanged:

```text
browser
-> http://storefront.local:4200
-> Angular dev server
-> /api proxy
-> http://storefront.local:8080
-> YOB edge proxy
-> Frappe
```

The backend half is verified and already running. It is **not** Docker - it is a
user-space nginx plus a local Frappe bench:

```text
~/yob-edge/nginx.conf     nginx on :8080
    server_name _              -> 421 Misdirected Request  (deliberate)
    server_name storefront.local -> 127.0.0.1:8000, sets:
        Host                 $host
        X-Frappe-Site-Name   yob.localhost
        X-YOB-Original-Host  $host
        X-YOB-Client-IP      $remote_addr
    server_name erp.local        -> same Frappe, proves header-strip control

~/frappe_local/frappe-bench   site yob.localhost
    apps: frappe erpnext payments india_compliance yob_core yob_auth yob_storefront

~/yob-edge/smoke.sh       backend smoke test for this exact setup
```

Constraints this places on the Angular dev proxy (Phase 2):

- The proxy target must be `http://storefront.local:8080`, and the request must
  arrive at nginx with `Host: storefront.local`. Any other Host answers `421`.
  In Angular's proxy config that means **not** rewriting the host header
  (`changeOrigin` must leave the value nginx matches on).
- Bypassing the edge - pointing the proxy straight at `127.0.0.1:8000` - produces
  `403 application_access_denied` even with a perfectly valid session, because
  `X-YOB-Original-Host` is absent. That is the failure mode to expect from a
  misconfigured proxy.
- **`storefront.local` does not resolve inside WSL and has no `/etc/hosts` entry.**
  A hosts entry is required on the machine running the browser, and on WSL for any
  tooling that resolves the name (`curl --resolve` works for scripts).
- The `sid` cookie is host-scoped with no `Domain`, so the SPA origin and the API
  origin must match. Serving the dev server on `storefront.local:4200` and proxying
  `/api` keeps that true.

Do not solve a proxy/DNS problem by adding trusted backend headers in Angular.

## 11. Mock API Contract

Mock handlers should intercept the same `/api/method/...` URLs used in production code.

Mocks must return the verified outer Frappe wrapper and inner YOB envelope.

Example mock success after verification:

```json
{
  "message": {
    "data": [],
    "meta": {"count": 0},
    "notice": "Categories loaded"
  }
}
```

Example mock failure after verification:

```json
{
  "message": {
    "errors": [
      {
        "code": "category_not_found",
        "detail": "Category not found.",
        "field": "slug"
      }
    ]
  }
}
```

Both example shapes above are now confirmed against the live API, so mock handlers can
be written against them directly.

Mock scenarios must use real documented error codes when available - the full registry
is in `reference/api/live/verified-responses.json`.

Mock mode must also be able to reproduce the **raw Frappe failure shape** from section
3a, not only the YOB envelope. The unauthenticated (403 `PermissionError`) and
missing-CSRF (400 `CSRFTokenError`) scenarios are exactly the ones where the
application's error handling is most likely to be wrong, so a mock that only ever
returns the tidy envelope would hide the bug it exists to catch.

## 12. Do Not Auto-Generate a Full Client Yet

The current OpenAPI document is excellent as an endpoint/security/reference inventory, but it is not yet strongly typed enough for high-quality automatic TypeScript client generation:

- success/error schemas are generic envelopes
- many endpoint-specific success schemas are not declared
- several request bodies are empty/incomplete
- some examples omit the documented outer wrapper
- `get_item` has an error example under its 200 response

Therefore, initially implement small handwritten typed domain API files over one Frappe-aware `YobApiClient`.

Revisit OpenAPI code generation later if the specification gains endpoint-specific request/response schemas.

## 13. First Live API Verification - DONE (2026-08-10)

Captured to `reference/api/live/verified-responses.json`. Results:

| Check | Result |
| --- | --- |
| actual outer wrapper | `message`, always present on YOB endpoints |
| CSRF token location | `message.data.csrf_token` |
| cookie behavior | `sid`: HttpOnly, Path=/, SameSite=Lax, no Domain, no Secure |
| HTTP status behavior | real and meaningful: 200/201/400/401/403/404/422/429/500 |
| error envelope location | `message.errors[]`, plus a second raw-Frappe shape (§3a) |
| notice/meta location | inside `message`, both omitted when empty |
| `application` usage | required on login/OTP-request/session-context; `STOREFRONT` here |
| logout / mutations vs token | verified: no token -> 400 `CSRFTokenError`; with token -> accepted |
| successful `get_item` shape | resolved from backend source (§8 catalog) |
| checkout transition response | resolved: `{payment_url, payment_request, token}` |

Wire-verified: `login_with_password`, `get_session_context`, `get_config`,
`get_categories`, `get_cart`, `get_orders`, `get_addresses`, `get_contacts`,
`get_payment_methods`, and the errors `validation_failed`, `category_not_found`,
`order_not_found`, `checkout_token_invalid`, `cart_empty`,
`application_access_denied`, raw-Frappe 403, raw-Frappe 400 CSRF, edge 421.

Source-verified only, because the bench has **no catalog, order, address or contact
data**: successful `get_category`, `get_item`, `get_order_details`, a non-empty
`get_cart`, `proceed_to_payment` success, `request_otp` / `login_with_otp` payloads,
and the address/contact write bodies. These are derived from the installed backend
implementation, which is stronger than the OpenAPI examples but is still not a wire
capture. **Re-capture them once demo data is seeded, before freezing the affected DTOs
and mock fixtures.**

Credentials for the local environment live in `~/yob-edge/smoke.sh` and are
deliberately not stored in this repository.
