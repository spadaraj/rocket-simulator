// Ghost and Guess: clean and muddy tests, guesses, and what gets written in the Lab Notes.

import { describe, expect, it } from 'vitest';
import { catalog } from '../../data/catalog';
import { MISSIONS } from '../../missions/missions';
import { setEngineCount, setTank } from '../../physics/edit';
import { flyMission } from '../../physics/mission';
import type { RocketSpec } from '../../physics/types';
import { EMPTY_LAB, changesSince, compareFlights, judge, reachOf, record, type Flown } from '../lab';

const fly = (spec: RocketSpec): Flown => ({ spec, mission: flyMission(spec, catalog) });
const trainer = MISSIONS[0].rocket();
const base = fly(trainer);

describe('Ghost and Guess', () => {
  it('a first flight has nothing to compare with, only the guess', () => {
    const v = judge(null, base, reachOf(base.mission));
    expect(v.kind).toBe('first');
    expect(v.guess?.right).toBe(true);
    expect(judge(null, base, null).guess).toBeUndefined();
  });

  it('the same rocket again is not a test', () => {
    expect(changesSince(trainer, { ...trainer, name: 'Renamed' })).toEqual([]);
    expect(judge(base, fly({ ...trainer }), null).kind).toBe('same');
  });

  it('one change is a clean test, and its finding goes in the Lab Notes', () => {
    const now = fly(setEngineCount(trainer, catalog, 0, 5));
    const v = judge(base, now, 'up');
    expect(v.kind).toBe('clean');
    expect(v.changes).toHaveLength(1);
    expect(v.guess?.right).toBe(v.compare!.dir === 'up');
    const lab = record(EMPTY_LAB, v, 'Sandbox');
    expect(lab.clean).toBe(1);
    expect(lab.guesses).toBe(1);
    expect(lab.findings[0].change).toBe(v.changes[0].text);
    // Running the same test again replaces the note instead of adding another.
    expect(record(lab, v, 'Sandbox').findings).toHaveLength(1);
  });

  it('several changes at once is a muddy test, with no finding', () => {
    const now = fly(setTank(setEngineCount(trainer, catalog, 0, 5), catalog, 0, { lengthM: 60 }));
    const v = judge(base, now, null);
    expect(v.changes.length).toBeGreaterThan(1);
    expect(v.kind).toBe('muddy');
    expect(record(EMPTY_LAB, v, 'Sandbox').findings).toEqual([]);
  });

  it('a flight compared with itself comes out the same', () => {
    expect(compareFlights(base.mission, base.mission).dir).toBe('same');
  });
});
