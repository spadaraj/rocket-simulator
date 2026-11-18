import { describe, expect, it } from 'vitest';
import { CASES, accuse, cleared, flyCase, openCase, pickCulprit, recorder, runTest, starChecks, starsFor, testNote } from '../cases';

describe('Crash Detective cases', () => {
  for (const c of CASES) {
    describe(c.title, () => {
      const healthy = flyCase(c, null);

      it('flies perfectly with no fault', () => {
        expect(healthy.result.failure).toBeUndefined();
      });

      for (const s of c.suspects) {
        it(`fails when the fault is in: ${s.name}`, () => {
          const crash = flyCase(c, s.id);
          expect(crash.result.failure).toBeDefined();
          // The recorder always has at least one clue.
          expect(recorder(c.gauges, healthy, crash).some((r) => r.odd)).toBe(true);
        });
      }

      it('has unique suspects', () => {
        expect(new Set(c.suspects.map((s) => s.id)).size).toBe(c.suspects.length);
      });
    });
  }

  const c = CASES.find((x) => x.id === 'broken-recorder')!;
  const [a, b, d] = c.suspects.map((s) => s.id);

  it('clears every swapped part when a test still fails', () => {
    const s = runTest(c, openCase(d), [a, b]);
    expect(s.tests[0].fixed).toBe(false);
    expect([...cleared(c, s)].sort()).toEqual([a, b].sort());
    expect(testNote(c, s.tests[0])).toContain('ALL of those are innocent');
  });

  it('clears everything else when a test flies', () => {
    const s = runTest(c, openCase(a), [a, b]);
    expect(s.tests[0].fixed).toBe(true);
    const innocent = cleared(c, s);
    expect(innocent.has(a)).toBe(false);
    expect(innocent.has(b)).toBe(false);
    expect(innocent.size).toBe(c.suspects.length - 2);
  });

  it('gives three stars for a clean solve, and takes one for a wrong name or a wasted test', () => {
    const clean = accuse(runTest(c, openCase(a), [a]), a);
    expect(starsFor(clean)).toBe(3);

    const wrongFirst = accuse(accuse(openCase(a), b), a);
    expect(starChecks(wrongFirst)).toEqual([true, false, true]);
    expect(cleared(c, wrongFirst).has(b)).toBe(true);

    // Testing a part already proved innocent tells us nothing.
    const wasted = accuse(runTest(c, runTest(c, openCase(d), [a]), [a]), d);
    expect(wasted.tests[1].wasted).toBe(true);
    expect(starChecks(wasted)).toEqual([true, true, false]);
  });

  it('stops at the test limit', () => {
    let s = openCase(a);
    for (let i = 0; i < c.tests + 2; i++) s = runTest(c, s, [b]);
    expect(s.tests.length).toBe(c.tests);
  });

  it('does not pick the same culprit twice in a row', () => {
    for (let i = 0; i < 20; i++) expect(pickCulprit(c, a, () => i / 20)).not.toBe(a);
  });
});
