# A1-39 Rocket Simulator

A browser-based 2D rocket engineering sandbox. Pick a rocket, launch it, and watch a physically grounded flight with live gauges. If it fails, the app explains what went wrong and how to fix it. The full design is in [PLAN.md](PLAN.md); Roscoe's blueprint is in [docs/a1-39-blueprint.png](docs/a1-39-blueprint.png).

**Done so far:**

- **Phase 1:** physics engine, A1-39 and Saturn V presets, launch to Earth orbit, failure explanations, Roscoe mode and a basic Engineer mode.
- **Phase 2:** rocket builder (swap engines and boosters, resize tanks, add or remove stages) in both modes; "Make it reach the Moon" auto-size; Engineer charts with run comparison and CSV export; fix suggestions that are tested by re-flying the rocket.
- **Phase 3:** the whole mission. Coasting systems checklist with Chaos Mode faults; boosters on parachutes and a powered core-stage landing (with a landing cam); the Moon trip as an animated delta-v ledger; capsule re-entry with heating, g-loads and splashdown; tumbling as a failure (centre of mass vs. centre of pressure vs. engine steering).

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # physics sanity tests + preset flights
npm run build    # static site in dist/
```

Every push to `main` runs the tests and build on GitHub Actions, and deploys to GitHub Pages when the repository variable `DEPLOY_PAGES` is `true`.

## How it's built

- `src/physics/` is a pure TypeScript module with no UI imports. `simulate(spec, catalog)` takes a `RocketSpec` and returns a `FlightRecord` (time series, events, outcome). `flyMission(spec, catalog)` adds everything after that: the pieces falling back (`recovery.ts`), the Moon ledger (`moon.ts`) and re-entry (`reentry.ts`). SI units throughout.
- The whole flight is simulated up front (in about 50–130 ms), then the canvas plays it back. That's why pause, scrubbing and speed controls are free.
- Auto-size and fix suggestions fly the rocket many times (`src/physics/autosize.ts`, `src/physics/fixes.ts`); the app runs them in a Web Worker so the screen never freezes.
- Free-design tanks (`src/physics/design.ts`) get their propellant from volume × propellant density and are badged "estimate".
- `src/data/parts.json` is the parts catalog; every part has a `source` and a `confidence` (`published` or `estimate`). Presets are in `src/data/presets/`.

### Physics (Phase 1)

| Piece | Model |
| --- | --- |
| World | Round Earth in the equatorial plane (2D), inverse-square gravity, launch from KSC with Earth's rotation (408 m/s eastward) |
| Atmosphere | US Standard Atmosphere 1976 (analytic below 86 km, tables to 1000 km) |
| Liquid engines | thrust = F_vac − p·A_exit; mass flow from vacuum thrust and Isp |
| Solid boosters | Thrust curve scaled so the burn uses exactly the loaded propellant |
| Drag | ½ρv²·Cd(Mach)·A, with a transonic peak, using air-relative velocity |
| Steering | Vertical rise, pitch kick, gravity turn; closed-loop guidance to the target orbit once out of the thick air |
| Integration | RK4, 0.05 s step, with exact burnout events and bisection for orbit cutoff and impact |
| Failures | Won't lift off (T/W < 1), out of fuel before orbit, structural breakup (dynamic pressure over the weakest part's limit), crash |

### Physics (Phase 3)

| Piece | Model |
| --- | --- |
| Tumbling | Barrowman centre of pressure (nose, diameter changes, fins) plus Galejs body lift, against the centre of mass from every part and the propellant left in each tank. The air's twist at the flown angle of attack plus a 25 m/s design gust is compared with what the engines can resist by swivelling (each engine's gimbal range); it flips if the twist wins for half a second. Guidance keeps q·α under 1,000 Pa·rad |
| Chaos Mode | One seeded random fault per flight: engines out on a stage (the rest burn longer; a stage with no engines left stages early), a top-stage leak in orbit, or a power/guidance/comms glitch that mission control resets |
| Booster recovery | Ballistic fall with tumbling drag, then three 41 m mains at 5 km: splashdown near 23 m/s, like the Shuttle SRBs |
| Core landing | Propellant held back at staging. Entry burn with all engines whenever the air a little lower would push past 60% of the structural limit; hoverslam landing burn on the fewest engines giving T/W ≥ 2, throttled to stop at the deck. Legs take 6 m/s. No boostback: it lands on a drone ship where it falls |
| Moon leg | Delta-v ledger with Apollo budgets: TLI 3,100 (top stage), LOI 900 and TEI 1,000 (service module), descent 2,000 and ascent 1,850 (lunar module) |
| Re-entry | 2D entry from 121.9 km at 11.0 km/s (Moon) or 7.85 km/s (orbit), L/D 0.3 with the lift rolled to stop climbing, Sutton–Graves heating, three mains at 3 km. Fails on heat-shield rate or total heat, crew g over 12, or skipping back out |

### Validation so far

| Check | Sim | Apollo 11 |
| --- | --- | --- |
| Liftoff thrust-to-weight | 1.18 | ~1.16 |
| Max-Q | 34.4 kPa at T+83 s, 11.9 km | 35.1 kPa at T+83 s, ~13.5 km |
| Mach 1 | T+70 s, 8.3 km | T+66 s, 7.8 km |
| Parking orbit | 175 × 185 km | ~185 km |

Re-entry against Apollo: the sim's safe lunar-return corridor is about −6° to −7.5° (Apollo aimed for −6.5° in a corridor about 2° wide), with 6.6 g at −6.5° (Apollo 11: about 6.5 g) and splashdown at 8.5 m/s (Apollo: about 9 m/s).

The Layer 2 golden-flight scorecard comes in Phase 4.

### Known trade-off: landing the A1-39 core

The A1-39's core burns to about 5 km/s before staging, so landing it needs an entry burn of nearly 4 km/s. Auto-size finds it must hold back about 560 t of fuel, which leaves only about 900 m/s for the Moon (3,100 needed). So the preset throws the core away by default; switch on "Land it" in the builder to see the trade-off. Real reusable boosters stage much slower (Super Heavy at about 1.5 km/s) and put the big job on the upper stage.

## Dev scripts

```bash
npx vite-node scripts/fly.ts a1-39        # flight report for a preset
npx vite-node scripts/sweep.ts saturn-v   # pitch-kick sweep
npx vite-node scripts/whatif.ts a1-39-as-drawn  # auto-size and fix search
npx vite-node scripts/stab.ts             # stability margins for every preset
npx vite-node scripts/recover.ts 300 600  # core landing at several reserves (t)
npx vite-node scripts/trade.ts            # land-the-core vs Moon trade study
npx vite-node scripts/reentry.ts          # re-entry angle sweep
```
