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
      return { kind: 'frappe', code: 'client_permission_denied' };
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
  check('403 -> kind=frappe client_permission_denied', r.status === 403 && c.kind === 'frappe' && c.code === 'client_permission_denied', `${r.status} ${JSON.stringify(c)}`);
  check('body really is raw Frappe, not the YOB envelope', r.json?.message === undefined && typeof r.json?.exc_type === 'string');
  // `exc` (the traceback) and `exception` only appear when the bench runs with
  // developer_mode on. With it off the body narrows to {exc_type, _server_messages}.
  // Classification must survive both, which is why it keys on exc_type and status
  // rather than on any message text - assert the shape, not the debug extras.
  check('classification keys on exc_type, which is present either way', typeof r.json?.exc_type === 'string');
  check('any traceback present is a field the client must discard, never surface',
    r.json?.exc === undefined || typeof r.json.exc === 'string');
}

console.log('\n== 3b. Guest session restore (SessionStore.restore before sign-in) ==');
{
  const r = await call('yob_auth.api.auth.get_session_context', { query: { application: APP } });
  const c = classify(r.status, r.json, r.text);
  check('guest get_session_context -> client_permission_denied (store maps to guest)', r.status === 403 && c.code === 'client_permission_denied', `${r.status} ${JSON.stringify(c)}`);
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
// NON-DESTRUCTIVE BY CONSTRUCTION. Both calls use `set_cart_contact` with no arguments.
//
// Frappe validates CSRF in the request pipeline, before the whitelisted method runs, so
// the pair still proves exactly what it needs to: without a token the request is
// rejected at 400, and with one it reaches the handler - which then refuses on its own
// terms with 422 `contact_required` and changes nothing.
//
// It used to call `clear_cart` with a valid token, which succeeded and emptied the real
// customer's cart every run. Ordinary smoke must not mutate real business data: no
// cleared carts, no Payment Requests, no Sales Orders, no provider calls. In particular
// `proceed_to_payment` must never appear in this file - it issues and revokes real
// financial obligations. Payment flows are covered by the mock and browser suites.
{
  const r = await call('yob_storefront.api.cart.set_cart_contact', { verb: 'POST', body: {}, headers: auth });
  const c = classify(r.status, r.json, r.text);
  check('POST without CSRF -> client_csrf_token_invalid @400', r.status === 400 && c.code === 'client_csrf_token_invalid', `${r.status} ${JSON.stringify(c)}`);
}
{
  const r = await call('yob_storefront.api.cart.set_cart_contact', {
    verb: 'POST',
    body: {},
    headers: { ...auth, 'X-Frappe-CSRF-Token': csrf },
  });
  const c = classify(r.status, r.json, r.text);
  // Past CSRF and into the handler: a business validation failure, not a 400.
  check('POST with X-Frappe-CSRF-Token accepted -> interceptor header name is correct', r.status === 422 && c.code === 'contact_required', `status=${r.status} ${JSON.stringify(c)}`);
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

console.log('\n== 6b. Account address book (Phase 15) ==');
//
// READ-ONLY BY DEFAULT. The lists below are the real customer's real records, so this
// section only looks at them: it proves the shapes the Account page relies on, and the
// two field-presence rules that a wrong request would use to destroy data.
//
// The write cycle underneath is gated behind YOB_SMOKE_ACCOUNT_WRITE=1 because it does
// mutate the bench. Even then it only ever touches a record it created itself, named so
// it is obviously disposable, and it deletes it again - no pre-existing address or
// contact is edited or removed to prove a frontend behaviour.
let smokeAddress = null;
let existingAddresses = [];
{
  const r = await call('yob_storefront.api.address.get_addresses', { headers: auth });
  const env = unwrap(r.json);
  check('get_addresses 200', r.status === 200, `status=${r.status} ${r.text.slice(0, 160)}`);
  check('data is an array', Array.isArray(env?.data));
  existingAddresses = Array.isArray(env?.data) ? env.data : [];

  const first = env?.data?.[0];
  if (first) {
    check('address rows carry a name to address them by', typeof first.name === 'string');
    check('address_line1 and city are present as the page renders them', 'address_line1' in first && 'city' in first);
    // The page deliberately has no phone/email input on the address form because these
    // are absent here. If they ever appear, the form is out of date.
    check('no phone/email on an address row (documented API gap the form matches)', !('phone' in first) && !('email_id' in first), JSON.stringify(Object.keys(first)));
  }
}
{
  const r = await call('yob_storefront.api.address.get_contacts', { headers: auth });
  const env = unwrap(r.json);
  check('get_contacts 200', r.status === 200, `status=${r.status}`);
  check('data is an array', Array.isArray(env?.data));

  const first = env?.data?.[0];
  if (first) {
    check('contact rows carry name/first_name/email/phone as the form edits them', typeof first.name === 'string' && 'first_name' in first && 'email' in first && 'phone' in first, JSON.stringify(Object.keys(first)));
  }
}
{
  // Someone else's record, or one that never existed, must answer the same way - the
  // page shows one wording for both because it genuinely cannot tell them apart.
  const r = await call('yob_storefront.api.address.update_address', {
    verb: 'POST',
    body: { name: 'ADDR-DOES-NOT-EXIST-0000', city: 'Nowhere' },
    headers: { ...auth, 'X-Frappe-CSRF-Token': csrf },
  });
  const c = classify(r.status, r.json, r.text);
  check('update_address on an unknown name -> address_not_found', c.code === 'address_not_found', `${r.status} ${JSON.stringify(c)}`);
  check('the refusal names no Desk URL or doctype internals', !/\/app\//.test(r.text) && !/Traceback/.test(r.text));
}

if (process.env.YOB_SMOKE_ACCOUNT_WRITE === '1') {
  const mutate = (method, body) =>
    call(`yob_storefront.api.address.${method}`, {
      verb: 'POST',
      body,
      headers: { ...auth, 'X-Frappe-CSRF-Token': csrf },
    });

  // GEOGRAPHY COMES FROM THE BENCH, NOT FROM THIS FILE.
  //
  // Address geography is validated as a unit, and every part of it is site-specific:
  //
  //   state    checked against a country's list. `Testing` was refused with
  //            "Please select a valid State from available options".
  //   pincode  checked for format - 6 digits, not starting with 0, so `000000` failed -
  //            and then checked for *association with the state*: "Postal Code 999999
  //            for address is not associated with Gujarat."
  //
  // So the postal code is a validation-bearing field here too, not decoration, and no
  // synthetic value can satisfy a rule that ties it to a state this script did not
  // choose. An existing Address is already known-good geography for this site, so the
  // smoke record borrows exactly the validated triple from one and nothing else.
  //
  // Everything that is *not* validated stays obviously synthetic - title, street, city -
  // so the record can never be mistaken for real data. The source record is read only:
  // it is never updated, never deleted, and is checked afterwards to prove it.
  const isGeoUsable = (a) =>
    ['country', 'state', 'pincode'].every(
      (k) => typeof a?.[k] === 'string' && a[k].trim() !== '',
    );
  const geoSource = existingAddresses.find(isGeoUsable);

  if (!geoSource) {
    // No guessing. A wrong triple would either fail the same way or, worse, quietly
    // create a record with geography nobody intended.
    console.log('  SKIP  write cycle: no existing Address carries all of country, state');
    console.log('        and pincode, so no valid fixture geography could be derived for');
    console.log('        this site. The postal code must be one the backend already');
    console.log('        associates with the state, and this script will not invent one.');
    console.log('        Add one valid Address to the smoke customer, or run read-only.');
  } else {
    console.log(`  (write cycle enabled: one disposable record, geography borrowed from ${geoSource.name})`);
    const geo = {
      country: geoSource.country,
      state: geoSource.state,
      pincode: geoSource.pincode,
    };

    // ---------------------------------------------------------------- 422 sibling
    // A deliberate refusal, to read what rides alongside the clean YOB envelope.
    // Nothing is created: the state is invalid by construction.
    {
      const r = await mutate('add_address', {
        address_title: 'ZZ SMOKE TEST - SHOULD NOT BE CREATED',
        address_line1: '1 Rejected Road',
        city: 'Refusedville',
        ...geo,
        state: 'ZZ NOT A REAL STATE',
      });
      const c = classify(r.status, r.json, r.text);
      check('add_address with an invalid state -> 422 validation_failed', r.status === 422 && c.code === 'validation_failed', `${r.status} ${JSON.stringify(c)} ${r.text.slice(0, 200)}`);

      // Frappe attaches `_server_messages` beside the YOB envelope. The browser client
      // ignores every sibling key, but "ignored by the client" is not the same as "safe
      // to send", so this asserts what the sibling may contain.
      const sibling = r.json?._server_messages;
      if (sibling !== undefined) {
        check('_server_messages carries no HTML markup', !/<[a-z/][^>]*>/i.test(sibling), sibling.slice(0, 300));
        check('_server_messages carries no URL or Desk path', !/https?:\/\/|\/app\//.test(sibling), sibling.slice(0, 300));
        check('_server_messages carries no traceback or internal frames', !/Traceback|File "|frappe\/|\.py['"]?[,:]/.test(sibling), sibling.slice(0, 300));
        check('_server_messages repeats the same sanitized validation wording', /valid State/i.test(sibling), sibling.slice(0, 300));
      } else {
        console.log('  note: no _server_messages sibling on this response');
      }

      // If the backend ever stops validating state, this would have created a record.
      if (r.status === 200 || r.status === 201) {
        const stray = unwrap(r.json)?.data?.name;
        if (stray) {
          await mutate('delete_address', { name: stray });
          check('the probe record was not left behind', true);
        }
      }
    }

    // ------------------------------------------------------------------- create
    const created = await mutate('add_address', {
      address_title: 'ZZ SMOKE TEST - DELETE ME',
      address_line1: '1 Smoke Lane',
      address_line2: 'Second line',
      city: 'Smoketown',
      ...geo,
    });
    const createdEnv = unwrap(created.json);
    smokeAddress = createdEnv?.data?.name ?? null;
    // 201, not 200 - a creation. The client treats the whole 2xx range as success, as
    // Phase 12 established for `proceed_to_payment`, so both are correct here.
    check('add_address 2xx and returns the new name', (created.status === 200 || created.status === 201) && typeof smokeAddress === 'string', `status=${created.status} ${created.text.slice(0, 200)}`);

    const listAddresses = async () =>
      unwrap((await call('yob_storefront.api.address.get_addresses', { headers: auth })).json)?.data ?? [];
    const findSmoke = async () => (await listAddresses()).find((a) => a.name === smokeAddress);

    if (smokeAddress) {
      const afterCreate = await findSmoke();
      check('the new address is in the list immediately', afterCreate !== undefined);
      check('it was stored as sent', afterCreate?.address_line1 === '1 Smoke Lane' && afterCreate?.city === 'Smoketown', JSON.stringify(afterCreate));

      // --------------------------------------------------------------- partial
      // THE RULE THE WHOLE CHANGED-FIELDS DIFF EXISTS FOR: an omitted key is left
      // alone. If this ever starts failing, a partial update becomes data loss.
      const updated = await mutate('update_address', { name: smokeAddress, city: 'Smokeville' });
      check('update_address 200 on a partial body', updated.status === 200, `status=${updated.status} ${updated.text.slice(0, 200)}`);

      const after = await findSmoke();
      check('the changed field changed', after?.city === 'Smokeville', JSON.stringify(after));
      check('OMITTED FIELDS SURVIVED - a partial update is not a wipe', after?.address_line1 === '1 Smoke Lane' && after?.address_line2 === 'Second line', JSON.stringify(after));

      // ----------------------------------------------------------------- clear
      const cleared = await mutate('update_address', { name: smokeAddress, address_line2: '' });
      check('update_address 200 clearing a field', cleared.status === 200, `status=${cleared.status}`);
      const afterClear = await findSmoke();
      check('an empty string clears rather than being ignored', !afterClear?.address_line2, JSON.stringify(afterClear?.address_line2));
      check('and clearing one field left the others alone', afterClear?.address_line1 === '1 Smoke Lane', JSON.stringify(afterClear));

      // ---------------------------------------------------------------- delete
      const removed = await mutate('delete_address', { name: smokeAddress });
      check('delete_address 200 - the disposable record is cleaned up', removed.status === 200, `status=${removed.status} ${removed.text.slice(0, 200)}`);
      check('it is really gone from the list', (await findSmoke()) === undefined);

      // A repeated delete answers not_found - which is exactly why the page never
      // retries one and re-reads the list instead. This is a deliberate second call
      // to observe that answer, not a retry of a failed delete.
      const again = await mutate('delete_address', { name: smokeAddress });
      const c = classify(again.status, again.json, again.text);
      check('deleting it a second time -> address_not_found (so a retry would mislead)', c.code === 'address_not_found', `${again.status} ${JSON.stringify(c)}`);
      smokeAddress = null;
    }

    // The borrowed record was only ever read from. Prove it came through untouched.
    const sourceNow = (await listAddresses()).find((a) => a.name === geoSource.name);
    check('the address the geography was borrowed from is unchanged', sourceNow?.country === geoSource.country && sourceNow?.state === geoSource.state && sourceNow?.address_line1 === geoSource.address_line1 && sourceNow?.city === geoSource.city, JSON.stringify(sourceNow));

    check('no disposable smoke record is left behind', (await listAddresses()).every((a) => !String(a.address_title ?? '').startsWith('ZZ SMOKE TEST')), JSON.stringify((await listAddresses()).map((a) => a.address_title)));
  }
} else {
  console.log('  (write cycle skipped - set YOB_SMOKE_ACCOUNT_WRITE=1 to run it)');
}

console.log('\n== 7. Session lifecycle (Phase 3) ==');
{
  // Restore with a live session: the exact call SessionStore.restore() makes.
  const r = await call('yob_auth.api.auth.get_session_context', { query: { application: APP }, headers: auth });
  const env = unwrap(r.json);
  check('authenticated get_session_context 200', r.status === 200, `status=${r.status}`);
  check('authentication_method is session', env?.data?.authentication_method === 'session');
  check('same payload shape as login (user + context + csrf_token)', typeof env?.data?.user?.name === 'string' && typeof env?.data?.context?.profile_name === 'string' && typeof env?.data?.csrf_token === 'string');
  check('application echoed back matches the configured code', env?.data?.context?.application === APP);
  check('roles/company withheld by the backend, so nothing can gate on them', env?.data?.context?.roles === undefined && env?.data?.context?.company === undefined);
  check('no notice on this endpoint -> notice must stay optional', env?.notice === undefined);
}
{
  // Sign out using the CSRF token exactly as yobCsrfInterceptor would send it.
  const r = await call('yob_auth.api.auth.logout', { verb: 'POST', body: {}, headers: { ...auth, 'X-Frappe-CSRF-Token': csrf } });
  const env = unwrap(r.json);
  check('logout 200 with the CSRF header', r.status === 200, `status=${r.status} ${r.text.slice(0, 160)}`);
  check('logout returns authenticated:false', env?.data?.authenticated === false);
  check('logout notice matches the source-verified text', env?.notice === 'Logout successful.');
}
{
  // After sign-out the same sid must no longer resolve: restore -> guest again.
  const r = await call('yob_auth.api.auth.get_session_context', { query: { application: APP }, headers: auth });
  const c = classify(r.status, r.json, r.text);
  check('post-logout restore -> client_permission_denied (guest)', r.status === 403 && c.code === 'client_permission_denied', `${r.status} ${JSON.stringify(c)}`);
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
