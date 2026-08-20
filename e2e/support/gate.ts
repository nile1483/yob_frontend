/**
 * Which kind of Playwright run this is, and which server it may talk to.
 *
 * ## The failure this exists to prevent
 *
 * `webServer.reuseExistingServer` adopts whatever is already answering on the port. A
 * long-lived `ng serve` that has stopped rebuilding still answers, so the suite ran
 * against a **stale bundle** and reported green - twice, during Phase 23B-5U-FE: new
 * tests failed against correct code, and an earlier run passed against pre-change output.
 * A gate that can pass without exercising the working tree is not a gate.
 *
 * ## Two modes, and only one of them is the gate
 *
 * | Mode | Port | Server | Trustworthy |
 * | --- | --- | --- | --- |
 * | authoritative (default) | {@link GATE_PORT} | started by Playwright, always | yes |
 * | reuse (`E2E_REUSE_SERVER=1`) | {@link DEV_PORT} | whatever is already running | no |
 *
 * The authoritative run cannot adopt a server: Playwright either starts its own from the
 * current tree or fails because the port is occupied. Rejection is the intended
 * behaviour - a refusal is recoverable, a false green is not.
 *
 * The two ports are deliberately different, so an ordinary `npm run start:mock` on
 * {@link DEV_PORT} neither blocks the gate nor can be picked up by it.
 */

/** The hand-run development server's port. Never used by an authoritative run. */
export const DEV_PORT = 4300;

/**
 * The authoritative gate's port.
 *
 * Its own, so that the only thing that can ever be listening here is a server Playwright
 * started for a gate run - and a leftover one from an aborted run is rejected rather
 * than adopted.
 */
export const GATE_PORT = 4301;

/** Set `E2E_REUSE_SERVER=1` to trade trustworthiness for a fast local loop. */
export const REUSE_ENV_VAR = 'E2E_REUSE_SERVER';

/** The mode a run is in, published to the workers by the global setup. */
export const MODE_ENV_VAR = 'YOB_E2E_MODE';

export type E2eMode = 'authoritative' | 'reuse';

/**
 * Decide the mode from the environment.
 *
 * Opt **in** to reuse, never out of the gate: a missing or misspelled variable leaves the
 * run authoritative, which is the safe direction to fail.
 */
export function e2eMode(env: NodeJS.ProcessEnv = process.env): E2eMode {
  return env[REUSE_ENV_VAR] === '1' ? 'reuse' : 'authoritative';
}

/** The port a run of this mode talks to. */
export function e2ePort(mode: E2eMode): number {
  return mode === 'reuse' ? DEV_PORT : GATE_PORT;
}

/** Whether this mode may adopt a server it did not start. */
export function mayReuseServer(mode: E2eMode): boolean {
  return mode === 'reuse';
}

export function baseUrl(mode: E2eMode): string {
  return `http://localhost:${e2ePort(mode)}`;
}
