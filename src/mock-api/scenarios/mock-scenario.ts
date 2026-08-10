import { Service, signal } from '@angular/core';

/**
 * Mock behaviours that cannot be produced by asking the mock to behave normally.
 *
 * Deliberately short. The obvious candidates for a scenario switch are already
 * reachable through real behaviour, and reaching them that way tests the contract
 * instead of testing the switch:
 *
 * - guest / unauthenticated -> do not sign in
 * - validation or login error -> sign in with the wrong credentials
 * - empty collections       -> a handler whose fixture is empty
 *
 * What is left genuinely needs a knob:
 *
 * - `server-error` a fault no correct request can trigger
 * - `empty`        a populated fixture cannot also be the empty one, and swapping
 *                  fixtures per test would need a second set of them
 * - latency        a slow network, which is orthogonal to the reply itself
 */
export type MockScenario = 'normal' | 'empty' | 'server-error';

/**
 * Runtime knobs for the mock API.
 *
 * Injectable so a test can set them, and a future developer console could too. Not
 * persisted and not configurable at build time - this is a development aid, not a
 * feature-flag system.
 */
@Service()
export class MockApiScenario {
  readonly scenario = signal<MockScenario>('normal');

  /**
   * Artificial delay in milliseconds, applied to success and failure alike.
   *
   * `0` disables it entirely rather than scheduling a zero-length timer, so mock
   * responses stay synchronous by default and tests need no timer plumbing.
   */
  readonly latencyMs = signal(0);

  constructor() {
    // Dev affordance: `?mockLatency=600` on any URL makes slow responses reachable in
    // a real browser, which is otherwise impossible - the mock answers in memory, so
    // there is no request for a test to intercept and stall. Needed to exercise
    // pending states such as a submit button that must block a second click.
    //
    // Mock-only by construction: this whole folder is absent from production builds.
    const query = new URLSearchParams(globalThis.location?.search ?? '');

    const requested = Number(query.get('mockLatency'));
    if (Number.isFinite(requested) && requested > 0) {
      this.latencyMs.set(requested);
    }

    // `?mockScenario=empty` / `=server-error` for browser tests of those states.
    const scenario = query.get('mockScenario');
    if (scenario === 'empty' || scenario === 'server-error') {
      this.scenario.set(scenario);
      this.sparesAuth.set(true);
    }
  }

  /**
   * Whether the active scenario should spare the `yob_auth` endpoints.
   *
   * Set only when the scenario came from the URL. A browser test has to sign in
   * before it can reach the feature it wants to watch fail, and a `server-error` that
   * also broke `login_with_password` could never be used for anything past the
   * sign-in page. Tests that set the scenario programmatically keep it global,
   * because they can choose the moment.
   */
  readonly sparesAuth = signal(false);

  reset(): void {
    this.scenario.set('normal');
    this.latencyMs.set(0);
    this.sparesAuth.set(false);
  }
}
