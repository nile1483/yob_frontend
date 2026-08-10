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
 * - latency        a slow network, which is orthogonal to the reply itself
 */
export type MockScenario = 'normal' | 'server-error';

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
    const requested = Number(new URLSearchParams(globalThis.location?.search ?? '').get('mockLatency'));
    if (Number.isFinite(requested) && requested > 0) {
      this.latencyMs.set(requested);
    }
  }

  reset(): void {
    this.scenario.set('normal');
    this.latencyMs.set(0);
  }
}
