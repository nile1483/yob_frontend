# Live API verification capture (Phase 1)

`verified-responses.json` holds sanitized responses captured from the running local
YOB/Frappe stack. It exists so that Phase 2+ network, session and mock code can be
typed against observed behaviour instead of the incomplete OpenAPI examples.

## Environment used

```text
curl --resolve storefront.local:8080:127.0.0.1
  -> nginx edge proxy   (~/yob-edge/nginx.conf, listening on :8080)
     vhost storefront.local
       proxy_set_header Host                $host
       proxy_set_header X-Frappe-Site-Name  yob.localhost
       proxy_set_header X-YOB-Original-Host $host
       proxy_set_header X-YOB-Client-IP     $remote_addr
  -> Frappe bench       (127.0.0.1:8000, site yob.localhost)
```

- `storefront.local` has no DNS/hosts entry inside WSL; `--resolve` (curl) or a hosts
  entry (browser) is required.
- The default nginx server on `:8080` answers `421 Misdirected Request` for any other
  Host, so the Host header must be `storefront.local`.
- Bench apps installed: `frappe`, `erpnext`, `payments`, `india_compliance`,
  `yob_core`, `yob_auth`, `yob_storefront`.
- Application code on this site: `STOREFRONT`.

## How to re-capture

Log in once with `POST /api/method/yob_auth.api.auth.login_with_password`
(`application`, `username`, `password`), keep the `sid` cookie from `Set-Cookie`,
then send `Cookie: sid=…` on subsequent calls.

`yob_auth` rate-limits password login to **10 attempts per 300 s keyed on the
username**, and successful logins consume the budget. Log in once per capture run.

`~/yob-edge/smoke.sh` is the existing backend smoke test for the same environment and
is the source of the working credentials. Credentials are deliberately **not** stored
in this repository.

## Sanitization

`csrf_token`, `sid`, and payment/checkout `token` values are replaced with
`<REDACTED>`. Frappe traceback payloads (`exc`, `_server_messages`) are truncated to
a marker — see `errors.raw_frappe_*`, which record the *shape* the frontend must
tolerate, not the full traceback text.

## Data-state caveat

This bench currently has **no catalog, order, address or contact data**, so
`get_categories`, `get_orders`, `get_addresses`, `get_contacts`,
`get_payment_methods` and the cart were captured in their empty state.

Entries marked `"verified": "source"` were derived from the installed backend
implementation under `~/frappe_local/frappe-bench/apps/` rather than from the wire,
because no seed data exists to produce them. Entries marked `"verified": "wire"` were
observed directly. Re-capture the `source` entries once demo data is loaded before
freezing the corresponding DTOs.
