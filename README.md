# A1-39 Rocket Simulator

A browser-based 2D rocket engineering sandbox. Pick a rocket, launch it, and watch a physically grounded flight with live gauges. If it fails, the app explains what went wrong and how to fix it. The full design is in [PLAN.md](PLAN.md); Roscoe's blueprint is in [docs/a1-39-blueprint.png](docs/a1-39-blueprint.png).

**Phase 1 (this build):** physics engine, A1-39 and Saturn V presets, launch to Earth orbit, three failure types, Roscoe mode and a basic Engineer mode.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # physics sanity tests + preset flights
npm run build    # static site in dist/
```

Every push to `main` runs the tests and deploys to GitHub Pages (`.github/workflows/deploy.yml`).

## How it's built

- `src/physics/` is a pure TypeScript module with no UI imports. `simulate(spec, catalog)` takes a `RocketSpec` and returns a `FlightRecord` (time series, events, outcome). SI units throughout.
- The whole flight is simulated up front (in about 50–130 ms), then the canvas plays it back. That's why pause, scrubbing and speed controls are free.
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

### Validation so far

| Check | Sim | Apollo 11 |
| --- | --- | --- |
| Liftoff thrust-to-weight | 1.18 | ~1.16 |
| Max-Q | 34.4 kPa at T+83 s, 11.9 km | 35.1 kPa at T+83 s, ~13.5 km |
| Mach 1 | T+70 s, 8.3 km | T+66 s, 7.8 km |
| Parking orbit | 175 × 185 km | ~185 km |

The Layer 2 golden-flight scorecard comes in Phase 4.

## Dev scripts

```bash
npx vite-node scripts/fly.ts a1-39        # flight report for a preset
npx vite-node scripts/sweep.ts saturn-v   # pitch-kick sweep
```
