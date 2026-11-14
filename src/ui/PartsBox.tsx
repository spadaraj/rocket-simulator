// The Parts Box (Sandbox only): pick any rocket, then take a whole stage or a single part
// from it (engines, a fuel tank, boosters, something for the top) and say where it goes.

import { useMemo, useState, type ReactNode } from 'react';
import { catalog } from '../data/catalog';
import { PAYLOAD_SLOTS, type PayloadSlot } from '../physics/edit';
import { importBoosters, importEngines, importStage, importTank, importTop, kitOf, type StagePlace } from '../physics/kitbash';
import type { BoosterRef, PartRef, RocketSpec } from '../physics/types';
import { buildVehicle, resolveCatalog } from '../physics/vehicle';
import { RocketThumb } from './RocketThumb';

type Piece =
  | { kind: 'stage'; index: number; label: string }
  | { kind: 'engines'; ref: PartRef; label: string }
  | { kind: 'tank'; ref: PartRef; label: string };

const short = (name: string) => name.replace(/^(SpaceX|Blue Origin|Rocketdyne|Aerojet) /, '').replace(/\s*\(.*\)$/, '');

/** A picture of just one stage of a rocket. */
function StageThumb({ rocket, index }: { rocket: RocketSpec; index: number }) {
  const vehicle = useMemo(() => {
    const stage = { ...rocket.stages[index] };
    delete stage.boosters;
    return buildVehicle({ ...rocket, stages: [stage], payload: { name: '', parts: [] } }, catalog);
  }, [rocket, index]);
  return <RocketThumb vehicle={vehicle} height={84} />;
}

interface Props {
  spec: RocketSpec;
  setSpec: (s: RocketSpec) => void;
  /** Rockets to take parts from: the real ones and Roscoe's own. */
  rockets: RocketSpec[];
}

export function PartsBox({ spec, setSpec, rockets }: Props) {
  const [open, setOpen] = useState(true);
  const [fromId, setFromId] = useState(rockets[0]?.id);
  const [piece, setPiece] = useState<Piece | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const from = rockets.find((r) => r.id === fromId) ?? rockets[0];
  const kit = useMemo(() => kitOf(from, catalog), [from]);
  const thumbs = useMemo(() => Object.fromEntries(rockets.map((r) => [r.id, buildVehicle(r, catalog)])), [rockets]);
  const cat = resolveCatalog(from, catalog);
  const name = (id: string) => short(cat[id]?.name ?? id);
  const stageLabel = (i: number) => `${i + 1}. ${spec.stages[i].name}`;

  const done = (next: RocketSpec, text: string) => {
    setSpec(next);
    setPiece(null);
    setNote(text);
  };
  const pick = (p: Piece) => {
    setPiece(piece && JSON.stringify(piece) === JSON.stringify(p) ? null : p);
    setNote(null);
  };

  const placeStage = (p: Extract<Piece, { kind: 'stage' }>, place: StagePlace) =>
    done(
      importStage(spec, from, p.index, place),
      'swap' in place ? `Swapped in ${p.label} for stage ${place.swap + 1}.` : `Added ${p.label} ${place.at === 'top' ? 'on top' : 'at the bottom'}.`,
    );
  const onStage = (p: Exclude<Piece, { kind: 'stage' }>, i: number) =>
    done(
      p.kind === 'engines' ? importEngines(spec, catalog, i, from, p.ref) : importTank(spec, catalog, i, from, p.ref),
      `Put ${p.label} on stage ${i + 1}.`,
    );
  const takeBoosters = (b: BoosterRef) => done(importBoosters(spec, b), `Strapped ${b.count} × ${name(b.part)} onto the bottom stage.`);
  const takeTop = (slot: PayloadSlot, part: string) => done(importTop(spec, slot, part), `Put the ${name(part)} on top.`);

  const isPicked = (p: Piece) => !!piece && JSON.stringify(piece) === JSON.stringify(p);
  const card = (p: Piece, body: ReactNode) => (
    <button key={JSON.stringify(p)} className={`pb-card ${isPicked(p) ? 'on' : ''}`} onClick={() => pick(p)} aria-pressed={isPicked(p)}>
      {body}
    </button>
  );
  // Most stacks are drawn top-first, so list stages that way too.
  const myStages = spec.stages.map((_, i) => i).reverse();

  return (
    <section className="parts-box" aria-label="Parts Box">
      <button className="pb-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>🧰 Parts Box</span>
        <small>Take pieces from any rocket!</small>
        <span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <>
          <div className="pb-rockets" role="tablist" aria-label="Take parts from">
            {rockets.map((r) => (
              <button
                key={r.id}
                role="tab"
                aria-selected={r.id === from.id}
                className={`pb-rocket ${r.id === from.id ? 'on' : ''}`}
                onClick={() => (setFromId(r.id), setPiece(null), setNote(null))}
              >
                <RocketThumb vehicle={thumbs[r.id]} height={56} />
                <span>{short(r.name)}</span>
              </button>
            ))}
          </div>

          <div className="pb-group">
            <div className="pb-label">🧩 Whole stages</div>
            <div className="pb-cards">
              {kit.stages.map((s) => {
                const p: Piece = { kind: 'stage', index: s.index, label: `the ${short(from.name)} ${s.name}` };
                return card(
                  p,
                  <>
                    <StageThumb rocket={from} index={s.index} />
                    <b>{s.name}</b>
                  </>,
                );
              })}
            </div>
          </div>

          <div className="pb-group">
            <div className="pb-label">🔥 Engines</div>
            <div className="pb-cards">
              {kit.engines.map((ref) => {
                const label = `${ref.count ?? 1} × ${name(ref.part)}`;
                return card({ kind: 'engines', ref, label }, <b>{label}</b>);
              })}
            </div>
          </div>

          <div className="pb-group">
            <div className="pb-label">⛽ Fuel tanks</div>
            <div className="pb-cards">
              {kit.tanks.map((ref) => {
                const tank = cat[ref.part];
                const label = `the ${name(ref.part)}`;
                const fuel = tank?.type === 'tank' ? `${Math.round(tank.propellantCapacityKg / 1000).toLocaleString()} t of fuel` : '';
                return card({ kind: 'tank', ref, label }, (
                  <>
                    <b>{name(ref.part)}</b>
                    <small>{fuel}</small>
                  </>
                ));
              })}
            </div>
          </div>

          {(kit.boosters || kit.top.length > 0) && (
            <div className="pb-group">
              <div className="pb-label">🚀 Boosters and things on top (tap to add)</div>
              <div className="pb-cards">
                {kit.boosters && (
                  <button className="pb-card" onClick={() => takeBoosters(kit.boosters!)}>
                    <b>
                      {kit.boosters.count} × {name(kit.boosters.part)}
                    </b>
                    <small>on the bottom stage</small>
                  </button>
                )}
                {kit.top.map((t) => (
                  <button key={t.slot} className="pb-card" onClick={() => takeTop(t.slot, t.part)}>
                    <b>{name(t.part)}</b>
                    <small>{PAYLOAD_SLOTS.find((x) => x.slot === t.slot)?.roscoe}</small>
                  </button>
                ))}
              </div>
            </div>
          )}

          {piece && (
            <div className="pb-where" role="group" aria-label="Where should it go?">
              <b>Where should {piece.label} go?</b>
              <div className="pb-where-btns">
                {piece.kind === 'stage' ? (
                  <>
                    <button className="btn" onClick={() => placeStage(piece, { at: 'top' })}>
                      ⬆️ On top
                    </button>
                    {myStages.map((i) => (
                      <button key={i} className="btn" onClick={() => placeStage(piece, { swap: i })}>
                        🔁 Swap for {stageLabel(i)}
                      </button>
                    ))}
                    <button className="btn" onClick={() => placeStage(piece, { at: 'bottom' })}>
                      ⬇️ At the bottom
                    </button>
                  </>
                ) : (
                  myStages.map((i) => (
                    <button key={i} className="btn" onClick={() => onStage(piece, i)}>
                      On {stageLabel(i)}
                    </button>
                  ))
                )}
                <button className="btn ghost" onClick={() => setPiece(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
          {note && <p className="pb-note">✅ {note}</p>}
        </>
      )}
    </section>
  );
}
