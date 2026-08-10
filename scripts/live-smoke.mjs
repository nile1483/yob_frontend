/**
 * Phase 2 live smoke test.
 *
 * Drives the SAME relative /api/method/... URLs YobApiClient builds, through the
 * Angular dev proxy and the YOB edge on :8080. Asserts that each wire shape the
 * normalizer branches on actually occurs, so the unit-test fixtures cannot drift
 * away from reality.
 *
 * Never targets Frappe on :8000 directly - that would bypass the edge.
 */
const ORIGIN = 'http://localhost:4200';
const BASE = '/api/method/';
const APP = 'STOREFRONT';

let pass = 0;
let fail = 0;

function check(label, condition, extra = '') {
  if (condition) {
    console.log(`  PASS  ${label}`);
    pass++;
  } else {
    console.log(`  FAIL  ${label} ${extra}`);
    fail++;
  }
}

async function call(method, { verb = 'GET', query, body, headers = {} } = {}) {
  const url = new URL(ORIGIN + BASE + method);
  for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, String(v));

  const res = await fetch(url, {
    method: verb,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}),
    redirect: 'manual',
  });

  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON body is itself a case under test */
  }
  return { status: res.status, json, text, headers: res.headers, path: url.pathname };
}

/** Mirror of the client's success unwrap, to prove the real body satisfies it. */
function unwrap(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null;
  const message = body.message;
  if (message === null || typeof message !== 'object' || Array.isArray(message)) return null;
  if (message.errors) return null;
  if (!('data' in message)) return null;
  return {
    data: message.data,
    ...(typeof message.notice === 'string' ? { notice: message.notice } : {}),
    ...(message.meta && typeof message.meta === 'object' ? { meta: message.meta } : {}),
  };
}

/** Mirror of the client's failure classification. */
function classify(status, json, text) {
  if (json?.message?.errors?.length) return { kind: 'yob', code: json.message.errors[0].code };
  if (typeof json?.exc_type === 'string') {
    if (status === 403 && json.exc_type === 'PermissionError')
      return { kind: 'frappe', code: 'client_session_required' };
    if (status === 400 && json.exc_type === 'CSRFTokenError')
      return { kind: 'frappe', code: 'client_csrf_token_invalid' };
    return { kind: 'frappe', code: 'client_unexpected_failure' };
  }
  if (json === null && text.length) return { kind: 'unexpected', code: 'client_unreadable_response' };
  return { kind: 'unexpected', code: 'client_unreadable_response' };
}

console.log('== 1. RPC URL construction reaches the edge ==');
{
  const r = await call('yob_storefront.api.payment.get_checkout_data', { query: { token: 'bogus' } });
  check('relative /api/method/<method> path used', r.path === '/api/method/yob_storefront.api.payment.get_checkout_data', r.path);
  check('edge did NOT answer 421 (Host: storefront.local preserved)', r.status !== 421, `status=${r.status}`);
  const c = classify(r.status, r.json, r.text);
  check('public YOB error -> kind=yob checkout_token_invalid @404', r.status === 404 && c.kind === 'yob' && c.code === 'checkout_token_invalid', JSON.stringify(c));
  check('error carries field=token', r.json?.message?.errors?.[0]?.field === 'token');
}

console.log('\n== 2. YOB validation error (422) ==');
{
  const r = await call('yob_auth.api.auth.login_with_password', { verb: 'POST', body: {} });
  const c = classify(r.status, r.json, r.text);
  check('422 validation_failed via YOB envelope', r.status === 422 && c.code === 'validation_failed', `${r.status} ${JSON.stringify(c)}`);
  check('field names the missing parameter', r.json?.message?.errors?.[0]?.field === 'application');
}

console.log('\n== 3. Raw Frappe 403 PermissionError (no session) ==');
{
  const r = await call('yob_storefront.api.catalog.get_categories');
  const c = classify(r.status, r.json, r.text);
  check('403 -> kind=frappe client_session_required', r.status === 403 && c.kind === 'frappe' && c.code === 'client_session_required', `${r.status} ${JSON.stringify(c)}`);
  check('body really is raw Frappe, not the YOB envelope', r.json?.message === undefined && typeof r.json?.exc_type === 'string');
  check('body really does contain a traceback the client must discard', typeof r.json?.exc === 'string' && r.json.exc.includes('Traceback'));
}

console.log('\n== 4. Success envelope: data + notice + meta ==');
const loginRes = await call('yob_auth.api.auth.login_with_password', {
  verb: 'POST',
  body: { application: APP, username: 'storefront@yob.test', password: process.env.YOB_SMOKE_PASSWORD },
});
check('login 200', loginRes.status === 200, `status=${loginRes.status} ${loginRes.text.slice(0, 160)}`);

const setCookie = loginRes.headers.get('set-cookie') ?? '';
check('sid returned as HttpOnly cookie for the browser to own', /sid=/.test(setCookie) && /HttpOnly/i.test(setCookie));

const loginEnvelope = unwrap(loginRes.json);
check('login body satisfies the client unwrap contract', loginEnvelope !== null);
check('notice preserved', loginEnvelope?.notice === 'Login successful.');
check('csrf token present at message.data.csrf_token', typeof loginEnvelope?.data?.csrf_token === 'string');
check("Frappe's sibling top-level keys are present and must be ignored", loginRes.json?.home_page !== undefined);

const sid = /sid=([^;]+)/.exec(setCookie)?.[1];
const csrf = loginEnvelope?.data?.csrf_token;
const auth = { Cookie: `sid=${sid}` };

{
  const r = await call('yob_storefront.api.cms.get_config', { headers: auth });
  const env = unwrap(r.json);
  check('authenticated get_config 200 (edge added X-YOB-Original-Host)', r.status === 200, `status=${r.status}`);
  check('data unwrapped', env?.data?.store_name !== undefined);
  check('notice present, meta absent -> both must be optional', env?.notice === 'Store config loaded' && env?.meta === undefined);
}
{
  const r = await call('yob_storefront.api.catalog.get_categories', { headers: auth });
  const env = unwrap(r.json);
  check('get_categories 200 with meta.count', r.status === 200 && typeof env?.meta?.count === 'number', JSON.stringify(env?.meta));
  check('data is an array', Array.isArray(env?.data));
}

console.log('\n== 5. Raw Frappe 400 CSRFTokenError, then the header that fixes it ==');
{
  const r = await call('yob_storefront.api.cart.clear_cart', { verb: 'POST', body: {}, headers: auth });
  const c = classify(r.status, r.json, r.text);
  check('POST without CSRF -> client_csrf_token_invalid @400', r.status === 400 && c.code === 'client_csrf_token_invalid', `${r.status} ${JSON.stringify(c)}`);
}
{
  const r = await call('yob_storefront.api.cart.clear_cart', {
    verb: 'POST',
    body: {},
    headers: { ...auth, 'X-Frappe-CSRF-Token': csrf },
  });
  check('POST with X-Frappe-CSRF-Token accepted -> interceptor header name is correct', r.status === 200, `status=${r.status}`);
}

console.log('\n== 6. Non-JSON edge failure (421) ==');
{
  // The dev proxy always asserts Host: storefront.local, so an unknown Host can only
  // be produced by addressing the edge directly. Still the edge, never Frappe :8000.
  const res = await fetch('http://127.0.0.1:8080/api/method/ping', { headers: { Host: 'unknown.local' } });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* expected */ }
  const c = classify(res.status, json, text);
  check('edge 421 with a non-JSON body -> client_unreadable_response', res.status === 421 && json === null && c.code === 'client_unreadable_response', `status=${res.status}`);
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
