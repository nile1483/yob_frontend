import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { expect, test } from '@playwright/test';

/**
 * Non-production sources must not reach Tailwind's class scanner.
 *
 * ## The bug this exists to prevent
 *
 * Tailwind v4 scans project files for class-like strings and cannot tell prose, or an
 * assertion, from a template. So a spec asserting that a class is **absent**, a component
 * comment explaining why the project avoids it, and a line of documentation describing
 * the rule were each enough to make Tailwind emit a real `.w-screen{width:100vw}` into
 * the **shipped** stylesheet - the exact utility the layout guards exist to keep out.
 *
 * Nothing failed. The class was simply there, unused, in every production build.
 *
 * The fix is to tell Tailwind that tests and documentation are not markup, which is what
 * `@source not` in `src/styles.css` does. This test protects that instruction: without
 * it, writing about a utility silently ships it.
 */

const STYLES = resolve(process.cwd(), 'src/styles.css');

/** Directories and patterns whose contents describe the application rather than build it. */
const EXCLUDED = ['../e2e', '../docs', '**/*.spec.ts'] as const;

test.describe('Tailwind scans the application only', () => {
  test('the stylesheet excludes every non-production source', () => {
    const styles = readFileSync(STYLES, 'utf8');

    for (const source of EXCLUDED) {
      expect(styles, `src/styles.css does not exclude ${source} from Tailwind scanning`).toContain(
        `@source not "${source}"`,
      );
    }
  });

  test('those exclusions are load-bearing, not decorative', () => {
    // If nothing outside the application ever mentioned a utility, the directives above
    // would be harmless clutter and someone would eventually delete them. They are kept
    // honest by the fact that the test suites really do spell these strings - which is
    // exactly how the class reached the bundle in the first place.
    const mentions = [
      ...testFiles(resolve(process.cwd(), 'e2e')),
      ...testFiles(resolve(process.cwd(), 'src'), true),
    ].filter((file) => /\bw-screen\b/.test(readFileSync(file, 'utf8')));

    expect(
      mentions.length,
      'no test mentions a bare utility any more - the @source exclusions may no longer be needed',
    ).toBeGreaterThan(0);
  });

  test('the built stylesheet carries no viewport-width utility', () => {
    const browser = resolve(process.cwd(), 'dist/yob-frontend/browser');
    test.skip(
      !existsSync(browser),
      'no production build present - run `ng build` to check the shipped stylesheet',
    );

    const sheets = readdirSync(browser).filter((f) => f.endsWith('.css'));
    expect(sheets.length, 'a production build has at least one stylesheet').toBeGreaterThan(0);

    for (const sheet of sheets) {
      const css = readFileSync(join(browser, sheet), 'utf8');
      expect(css, `${sheet} ships a viewport-width utility`).not.toMatch(
        /\.w-screen|width:\s*100vw/,
      );
    }
  });
});

/** Spec files under a directory, recursively. */
function testFiles(dir: string, specsOnly = false): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...testFiles(path, specsOnly));
    } else if (path.endsWith(specsOnly ? '.spec.ts' : '.ts')) {
      out.push(path);
    }
  }
  return out;
}
