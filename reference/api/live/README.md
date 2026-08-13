# YOB frontend API reference — live verification capture

**Reference version 2.0.0 — regenerated for backend Payment Lifecycle Phase 2B.**

`verified-responses.json` holds sanitized responses produced by the current
backend. It exists so SPA network, session and mock code can be typed against
observed behaviour rather than against the OpenAPI examples alone.

## Capture

| | |
|---|---|
| Capture date | 2026-08-13 |
| Backend phase | Payment Lifecycle Phase 2B |
| Payment capture site | `test.localhost` (seeded demo data, fully migrated) |
| Earlier non-payment wire capture | `yob.localhost` via the `:8080` edge proxy |
| Application code | `STOREFRONT` |

The payment capture site was confirmed migrated for every current payment custom
field before capture: `custom_checkout_token` (Data, **UNIQUE**),
`custom_checkout_expiry`, `custom_source_fingerprint`, `custom_razorpay_order_id`,
`custom_razorpay_payment_id`.

## Verification levels

Each entry carries `"verified"`, and the three values mean different things:

- **`wire`** — observed over HTTP through the edge proxy.
- **`test`** — the real endpoint was executed in-process against seeded data,
  inside a rolled-back savepoint with `frappe.db.commit` suppressed and a
  deterministic Razorpay fake. The bodies are real envelopes from the real
  implementation, but **no HTTP round trip and no live provider were involved.**
- **`source`** — read from the implementation; not executed.

### Why payment endpoints are `test`, not `wire`

Every payment endpoint mutates durable business state: a real call creates
Payment Requests and Sales Orders, leaves the Cart Ordered, and contacts
Razorpay. Running those against a site merely to populate documentation is not
acceptable, so they were executed under the isolation described above instead.
The site was verified byte-for-byte unchanged afterwards — no Payment Requests,
Sales Orders, Ordered Carts, API keys, provider orders or payment logs left
behind.

This is a deliberate accuracy choice: these responses are **not** labelled
`wire`, because no HTTP request was made.

## Payment lifecycle the SPA must model

A Payment Request is an **immutable obligation**. Its amount and currency never
change after issue.

```
proceed_to_payment   ->  Payment Request backed by a CART
process_payment      ->  commits ONE Draft Sales Order
                     ->  Payment Request now backed by that SALES ORDER
verify_payment       ->  settles that exact Sales Order
```

Consequences for the frontend:

- `get_checkout_data` returns **two different shapes**. Branch on
  `data.source_doctype` (`"Cart"` or `"Sales Order"`). In the Sales Order shape
  `billing_address`/`shipping_address` are **name strings**, not objects, and
  `items[]` is flat.
- After the obligation becomes Sales-Order-backed, **the Cart is no longer
  payment truth.** It is not read or revalidated, and later cart edits cannot
  invalidate the committed payment.
- The checkout token is **not** revoked when the source moves Cart → Sales
  Order. `/payment/:token` keeps working across refreshes and retries, and a Pay
  Later order stays payable later. It *is* revoked once the payment settles.
- `amount` is in normal business units everywhere **except** the Razorpay
  `process_payment` response, where it is in provider units (paise:
  `13500` == INR 135.00) for direct handoff to the Razorpay widget.
- A provider failure after commitment returns `payment_provider_error` with
  `details.retryable = true` and `details.sales_order`. **The order was not
  rolled back** — offer a retry rather than reporting a failed order.

`/payment/:token` is a **public SPA route**: the payment endpoints are
guest-accessible and require no session.

## Sanitization

`csrf_token`, `sid`, checkout `token`, `payment_url` token segment,
`razorpay_key` and `razorpay_signature` are replaced with `<REDACTED>`. Checkout
tokens are live bearer credentials and are never stored here. Razorpay order and
payment ids in the examples are fake (`order_EXAMPLE0001`, `pay_EXAMPLE0001`)
and were produced by the deterministic stub.

Frappe traceback payloads (`exc`, `_server_messages`) are truncated to a marker
— see `errors.raw_frappe_*`, which record the *shape* the frontend must
tolerate, not the text.

## Still pending

**Real Razorpay Test-Mode verification.** Everything provider-facing was proven
against a deterministic fake that enforces Razorpay's documented receipt rules.
Not yet confirmed against the live sandbox: the 40-character receipt accepted on
the wire, the exact duplicate-receipt error class, `order.all({"receipt": …})`
filtering, and live signature verification. The response *contract* the SPA
consumes is unaffected by these, but the recovery paths are not wire-proven.

## Superseded statements

Earlier revisions of this file said the bench had no catalog/order/address data
and that `proceed_to_payment` success could not be captured. Both are obsolete:
`test.localhost` is seeded, and every payment branch above was executed.
