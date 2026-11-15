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
  return <RocketThumb vehicle={vehicle} height={56} />;
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
  const card = (p: Piece, art: ReactNode, title: string, sub?: string) => (
    <button key={JSON.stringify(p)} className={`pb-card ${isPicked(p) ? 'on' : ''}`} onClick={() => pick(p)} aria-pressed={isPicked(p)}>
      <span className="pb-art">{art}</span>
      <b>{title}</b>
      {sub && <small>{sub}</small>}
    </button>
  );
  // Most stacks are drawn top-first, so list stages that way too.
  const myStages = spec.stages.map((_, i) => i).reverse();

  // Each shelf shows a few cards; the rest fold behind a "+ more" card.
  const SHELF = 3;
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const shelf = (key: string, title: string, icon: string, cards: ReactNode[]) => {
    const all = opened[key] || cards.length <= SHELF;
    const shown = all ? cards : cards.slice(0, SHELF - 1);
    return (
      <div className={`pb-shelf pb-${key}`}>
        <div className="pb-shelf-head">
          <span aria-hidden="true">{icon}</span> {title}
        </div>
        <div className="pb-shelf-cards">
          {cards.length === 0 && <p className="pb-empty">None on this rocket</p>}
          {shown}
          {!all && (
            <button className="pb-card pb-more" onClick={() => setOpened({ ...opened, [key]: true })}>
              <span className="pb-art">＋</span>
              <b>{cards.length - shown.length} more</b>
            </button>
          )}
        </div>
      </div>
    );
  };

  const fuelOf = (id: string) => {
    const tank = cat[id];
    return tank?.type === 'tank' ? `${Math.round(tank.propellantCapacityKg / 1000).toLocaleString()} t of fuel` : undefined;
  };
  const slotInfo = (slot: PayloadSlot) => {
    const roscoe = PAYLOAD_SLOTS.find((x) => x.slot === slot)?.roscoe ?? '';
    const [icon, ...rest] = roscoe.split(' ');
    return { icon, label: rest.join(' ') };
  };

  const stageCards = kit.stages.map((s) =>
    card({ kind: 'stage', index: s.index, label: `the ${short(from.name)} ${s.name}` }, <StageThumb rocket={from} index={s.index} />, s.name),
  );
  const engineCards = kit.engines.map((ref) =>
    card({ kind: 'engines', ref, label: `${ref.count ?? 1} × ${name(ref.part)}` }, '🔥', name(ref.part), `× ${ref.count ?? 1}`),
  );
  const tankCards = kit.tanks.map((ref) =>
    card({ kind: 'tank', ref, label: `the ${name(ref.part)}` }, '⛽', name(ref.part), fuelOf(ref.part)),
  );
  const topCards = [
    ...(kit.boosters
      ? [
          <button key="boosters" className="pb-card" onClick={() => takeBoosters(kit.boosters!)}>
            <span className="pb-art">🚀</span>
            <b>{name(kit.boosters.part)}</b>
            <small>× {kit.boosters.count} boosters</small>
          </button>,
        ]
      : []),
    ...kit.top.map((t) => {
      const info = slotInfo(t.slot);
      return (
        <button key={t.slot} className="pb-card" onClick={() => takeTop(t.slot, t.part)}>
          <span className="pb-art">{info.icon}</span>
          <b>{name(t.part)}</b>
          <small>{info.label}</small>
        </button>
      );
    }),
  ];

  return (
    <section className="parts-box" aria-label="Parts Box">
      <button className="pb-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>🧰 Parts Box</span>
        <small>Pick a rocket, then grab a part</small>
        <span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <>
          <div className="pb-body">
            <div className="pb-from">
              <div className="pb-step">
                <span className="pb-num">1</span> From
              </div>
              <div className="pb-rockets" role="tablist" aria-label="Take parts from">
                {rockets.map((r) => (
                  <button
                    key={r.id}
                    role="tab"
                    aria-selected={r.id === from.id}
                    className={`pb-rocket ${r.id === from.id ? 'on' : ''}`}
                    onClick={() => (setFromId(r.id), setPiece(null), setNote(null), setOpened({}))}
                  >
                    <span className="pb-rocket-art">
                      <RocketThumb vehicle={thumbs[r.id]} height={34} />
                    </span>
                    <span>{short(r.name)}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="pb-grab">
              <div className="pb-step">
                <span className="pb-num">2</span> Grab a part
              </div>
              <div className="pb-shelves">
                {shelf('stages', 'Stages', '🧩', stageCards)}
                {shelf('engines', 'Engines', '🔥', engineCards)}
                {shelf('tanks', 'Fuel tanks', '⛽', tankCards)}
                {shelf('top', 'Top and sides', '🚀', topCards)}
              </div>
              <p className="pb-hint">Top and side parts go straight on when you tap them.</p>
            </div>
          </div>

          {piece && (
            <div className="pb-where" role="group" aria-label="Where should it go?">
              <span className="pb-step">
                <span className="pb-num">3</span> Put {piece.label} {piece.kind === 'stage' ? 'where?' : 'on:'}
              </span>
              <div className="pb-where-btns">
                {piece.kind === 'stage' ? (
                  <>
                    <button className="pb-place" onClick={() => placeStage(piece, { at: 'top' })}>
                      ⬆️ On top
                    </button>
                    {myStages.map((i) => (
                      <button key={i} className="pb-place" onClick={() => placeStage(piece, { swap: i })}>
                        🔁 Swap for {stageLabel(i)}
                      </button>
                    ))}
                    <button className="pb-place" onClick={() => placeStage(piece, { at: 'bottom' })}>
                      ⬇️ At the bottom
                    </button>
                  </>
                ) : (
                  myStages.map((i) => (
                    <button key={i} className="pb-place" onClick={() => onStage(piece, i)}>
                      On {stageLabel(i)}
                    </button>
                  ))
                )}
                <button className="pb-cancel" onClick={() => setPiece(null)}>
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
