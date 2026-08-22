import type { HttpTestingController } from '@angular/common/http/testing';

/**
 * Answer the route-content request an application page makes, so `verify()` stays useful.
 *
 * ## Why specs need this at all
 *
 * Since Phase 25H every content-bearing route renders `<yob-content-slot>`s, and those
 * ask for `cms.get_route_content` once per route. A cart spec is not about merchant
 * banners, but its page still issues that request - so `http.verify()` would fail on an
 * open request that is entirely expected.
 *
 * Draining it *and answering it* is deliberate. Simply ignoring the request would make
 * `verify()` blind to it for ever; answering it keeps every **other** unmatched request
 * a failure, which is the property those specs are actually relying on.
 *
 * The reply is an empty slot list by default: supplemental content that is absent is the
 * ordinary case, and a spec that wants blocks passes its own.
 *
 * ## Why it lives here rather than in a spec file
 *
 * Sixteen specs need it. `tsconfig.app.json` excludes `*.testing.ts` and
 * `tsconfig.spec.json` includes it, so this is compiled for tests only and can never
 * reach a production bundle - the same guarantee `fileReplacements` gives the mock API.
 */
export function answerRouteContent(
  http: HttpTestingController,
  slots: readonly unknown[] = [],
): number {
  const open = http.match((request) => request.url.includes('cms.get_route_content'));

  for (const request of open) {
    const routeKey = new URL(request.request.urlWithParams, 'http://test.invalid').searchParams.get(
      'route_key',
    );
    // The wire shape, not the unwrapped one: these specs run through the real
    // `YobApiClient`, and a pre-unwrapped body would skip the layer under test.
    request.flush({ message: { data: { route_key: routeKey, slots } } });
  }

  return open.length;
}
