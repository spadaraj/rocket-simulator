# A1-39 Rocket Simulator — Build Plan

Nov 1, 2026 · @Adam Spadaro

## Overview

We're building a browser-based rocket engineering sandbox: build a rocket from real parts, launch it, and see a physically grounded 2D flight with live gauges, charts, and an explanation of what went wrong and how to fix it. Roscoe's A1-39 is the first rocket; real rockets ship as presets alongside it.

Key decisions so far:

- **Audience:** a real engineering sandbox for both of us, with a simple "Roscoe mode" (big buttons, pictures) and a detailed "Engineer mode" (numbers, charts).
- **Modularity:** any part is swappable — two stages instead of three, liquid boosters instead of SRBs, a different engine.
- **Flight phases:** liftoff, max-Q, staging, coasting (with systems checks), orbit, re-entry, landing.
- **Failures:** too heavy to lift off, tumbling, structural breakup, re-entry overheating, out of fuel, engine failure. Each one explains the cause and suggests a fix.
- **Visuals:** 2D animated flight arc, live gauges, charts after the flight. No 3D.
- **Environment:** perfect weather by default.
- **Parts:** a catalog of real engines and boosters, plus free design where the tool calculates the specs.
- **Timeline:** a working first version this weekend, then iterate.

## Platform and tech stack

Recommendation: a static web app built in Claude Code and hosted for free on GitHub Pages or Netlify. It runs in any browser, including the Silk browser on a Fire tablet, and can be added to the tablet's home screen as an app icon (a Progressive Web App).

| Layer | Choice | Why |
| --- | --- | --- |
| Language | TypeScript | Catches unit and type mistakes in physics code early |
| Build | Vite | Fast, simple, outputs static files |
| UI | React | Easy to build two modes over one engine |
| Flight animation | HTML Canvas 2D | Light enough for a Fire tablet |
| Charts | uPlot (or Recharts) | uPlot is very light; Recharts is easier to style |
| Physics tests | Vitest | Runs the validation suite on every change |
| Hosting | GitHub Pages / Netlify | Free, shareable link |

Two design rules matter most:

1. **The physics engine is a separate, UI-free module.** It takes a rocket spec in and gives a flight record out. This keeps it testable, and both modes reuse it.
2. **Simulate first, then play back.** The whole flight is computed in a fraction of a second, then the animation replays it. That makes pause, rewind, speed controls and post-flight charts nearly free, and keeps the tablet from struggling.

&#91;embedded content: app architecture · 7 parts\]

The rocket spec is the hand-off point: the builder writes it, the engine reads it, and the same file can feed the blueprint prompt.

## Physics model

Realism comes from five things done properly: real part data, a real atmosphere, thrust that changes with altitude, drag that changes with speed, and honest mass bookkeeping. Everything else is presentation.

**The world**

- A round Earth, seen side-on in 2D, with gravity weakening with distance (inverse square).
- Earth's rotation gives an eastward head start from the launch site. Default site: Kennedy Space Center, where the Saturn V flew.
- The atmosphere follows the US Standard Atmosphere 1976 tables, which give air density, pressure, temperature and speed of sound by altitude.

**The forces, recomputed every small time step**

- **Thrust.** Liquid engines lose thrust in thick air and gain it in vacuum. Each engine has a sea-level and a vacuum rating, and the sim blends between them using outside air pressure. Solid boosters follow a recorded thrust-over-time curve and can't be throttled or shut off.
- **Drag.** Depends on air density, speed squared, frontal area and a drag coefficient that spikes near the speed of sound.
- **Gravity.** Pulls toward Earth's centre.

```latex
F_{thrust} = F_{vac} - p_{air} \cdot A_{exit}
```

```latex
F_{drag} = \tfrac{1}{2}\,\rho\,v^2\,C_d(M)\,A
```

**Mass and staging**

- Each engine burns propellant at a rate set by its thrust and efficiency (specific impulse, Isp).
- When a stage's tanks are empty, or its staging rule fires, its dry mass drops away and the next stage lights.

**Steering**

- Rise vertically, tip over slightly (the pitch kick), then let gravity bend the path (a gravity turn). Upper stages steer toward a target orbit.
- Engineer mode exposes the pitch-kick timing and angle, since bad steering is a classic real-world failure.

**Design-time check: the rocket equation**

Before launch, the builder shows each stage's speed-change capacity (delta-v) against what the mission needs:

```latex
\Delta v = I_{sp}\, g_0 \ln\frac{m_{full}}{m_{empty}}
```

Approximate textbook budgets: about 9.4 km/s to reach low Earth orbit (including drag and gravity losses), about 3.1 km/s more to head for the Moon, under 1 km/s to enter lunar orbit, and roughly 2 km/s each to land on and lift off from the Moon. These will be checked against sources during the build.

**Numerics**

- A standard RK4 integrator at a fixed step of about 0.05 seconds, with event detection for burnout, staging and impact.
- Recorded each step: position, speed, Mach, altitude, acceleration (g-load), dynamic pressure, mass, propellant left, heating and orbit shape.

**The Moon leg**

The launch to Earth orbit is fully simulated from the start. The trip to the Moon begins as a delta-v ledger with a simple animation. A true 2D Earth–Moon trajectory (with patched conics) comes in a later phase.

## Flight phases

Each phase has its own physics focus and its own checks, so failures can be pinned to a moment in the flight.

| Phase | What the sim models | What it checks |
| --- | --- | --- |
| Liftoff | Thrust vs. weight at sea level; boosters and core lit together | Thrust-to-weight above 1 (real rockets aim for about 1.2 or more) |
| Max-Q | Peak aerodynamic pressure, usually around a minute in | Dynamic pressure vs. each part's structural limit; optional throttle-down through max-Q |
| Staging | Burnout, separation, next ignition; dropped mass leaves the sim | Stage lights successfully; dropped parts clear the rocket |
| Coasting | Unpowered flight; a systems-check pause | Engines, tanks, power, guidance and comms run through a checklist (with optional random faults) |
| Orbit | Upper stage reaches enough sideways speed to keep falling around Earth | Lowest point of the orbit stays above the atmosphere |
| Re-entry | Capsule hits the air at high speed; heating and deceleration | Heat-shield limit and crew g-load limit |
| Landing | Boosters on parachutes to the ocean; core stage relights for a powered landing on legs; capsule on parachutes | Enough propellant held back for landing; touchdown speed within leg or splashdown limits |

Coasting doubles as a teaching moment: in Roscoe mode it's a "mission control" checklist where each system gets a green tick, or a red flag if Chaos Mode injected a fault.

## Failures and feedback

Every failure gets three layers of feedback: what happened, why (with the number that crossed a limit), and how to fix it. Roscoe mode shows the first and third layers in pictures and short words; Engineer mode shows all three with a chart marked at the moment it went wrong.

| Failure | Triggered when | Roscoe mode says | Engineer mode shows | Fix suggestions |
| --- | --- | --- | --- | --- |
| Won't lift off | Thrust-to-weight below 1 at ignition | "Too heavy! The engines can't push it up." | Thrust vs. weight at T+0 | Add boosters, stronger engines, less fuel in upper stages |
| Tumbling | Steering can't overpower the air pushing the nose sideways | "It wobbled and flipped!" | Centre of mass vs. centre of pressure; steering force vs. aerodynamic twist | Bigger fins, heavier nose, move mass forward, gentler pitch kick |
| Breaks apart | Dynamic pressure exceeds a part's limit | "The air pushed too hard and it broke!" | Dynamic-pressure curve vs. structural limit | Throttle down at max-Q, steeper climb, stronger structure |
| Burns up on re-entry | Heating exceeds the heat shield's limit | "Too hot coming home!" | Heating rate and total heat vs. shield rating | Bigger heat shield, shallower re-entry angle |
| Out of fuel | Propellant runs out before the goal | "Ran out of fuel before space!" | Delta-v needed vs. available, per stage | More propellant, more efficient engine, lighter payload, add a stage |
| Engine failure | Random fault in Chaos Mode, or engine pushed past its limits | "An engine stopped working!" | Which engine, when, and whether the rest compensated | Extra engines for spare thrust, engine-out capability |
| Crash landing | Touchdown too fast, or no landing propellant left | "It landed too hard!" | Touchdown speed vs. leg limit; landing propellant reserve | Hold back more fuel, bigger parachutes |

**How fix suggestions are generated**

1. Each failure type has a short list of candidate fixes (the right-hand column).
2. The sim quietly re-runs the flight with each candidate applied. Because a flight takes a fraction of a second, this is cheap.
3. It shows only the fixes that actually worked, ranked by smallest change, with a one-tap "Try this" button.

Explosions in Roscoe mode stay cartoony: a puff, a bang and a sad-face rocket, not anything scary.

## Parts catalog and data

The catalog holds real parts with published specs; free design produces estimated parts from engineering rules of thumb, clearly badged "estimated".

**Part types**

| Type | Key fields |
| --- | --- |
| Liquid engine | Propellant, sea-level and vacuum thrust, sea-level and vacuum Isp, mass, throttle range, restartable, nozzle exit area |
| Solid booster | Thrust-over-time curve, total and propellant mass, burn time |
| Tank | Propellant type, diameter, length, dry mass, propellant capacity |
| Structure | Interstage, adapter panels, fairing: mass, diameter, strength limit |
| Crew / payload | Command, service and lunar modules: mass, heat-shield rating, crew count |
| Aero parts | Fins (area, position), nose cone (shape, length) |
| Recovery | Landing legs (mass, max touchdown speed), parachutes (area) |

**Rocket spec format** (one JSON file per rocket)

```json
{
  "name": "A1-39",
  "launchSite": "KSC",
  "stages": [
    {
      "name": "Core + boosters",
      "parts": ["core-tank-ch4", "engine-raptor x9", "fins x4", "legs x4"],
      "boosters": { "part": "srb-sls-5seg", "count": 4, "separate": "onBurnout" },
      "recovery": "propulsive"
    },
    { "name": "Stage 2", "parts": ["..."] },
    { "name": "Lunar stack", "parts": ["lm-adapter", "lunar-module", "service-module", "command-module", "escape-tower"] }
  ],
  "mission": { "target": "moon", "pitchKick": { "time": 10, "angle": 2 } }
}
```

Part IDs and numbers above are placeholders to show the shape, not decisions.

**First catalog, by propellant**

- Methane / oxygen: SpaceX Raptor, Blue Origin BE-4
- Kerosene / oxygen: Rocketdyne F-1 (Saturn V), SpaceX Merlin, RD-180
- Hydrogen / oxygen: J-2 (Saturn V upper stages), RS-25 (Shuttle, SLS)
- Solid boosters: Space Shuttle SRB, SLS five-segment booster, GEM-63

**Presets**

Saturn V, Falcon 9, Falcon Heavy, Space Shuttle, SLS Block 1, Starship, and the A1-39.

**Free design rules**

- A tank's propellant mass comes from its volume and propellant density; its dry mass from a typical tank-to-propellant ratio.
- A custom engine's mass comes from its thrust and a typical thrust-to-weight for its propellant type; its Isp is capped at realistic values for that propellant, so no magic engines.

**Data sources to use** (each spec gets its source stored alongside it)

- NASA Technical Reports Server: Saturn V post-flight evaluation reports, with event times and measured trajectories
- Manufacturer documents: SpaceX Falcon user's guide, NASA SLS fact sheets
- Reference compilations (Wikipedia, Astronautix) as a starting point, cross-checked against primary sources

Specs for newer engines like Raptor change often and aren't always published, so those entries get a "best public estimate" label.

## The A1-39 as preset #1

The A1-39's layout is set; its numbers are not. The first real engineering session is choosing parts, launching, and fixing what breaks, which is exactly what the simulator is for.

**Locked in (from Roscoe)**

- About Saturn V height (roughly 110 m)
- Four white solid boosters, recovered by parachute
- Gray methane core stage with four fins and landing legs
- Red methane second stage
- Lunar module inside protective adapter panels, then service module, then command module (three crew, one big window), then a pointed escape tower
- Retro-futuristic look

**Decisions for Roscoe**

- [ ] Which methane engine: Raptor or BE-4? (Raptor is smaller, so the core needs more of them)
- [ ] How many engines on the core stage, and how many on the red stage?
- [ ] Which solid boosters: Space Shuttle style or SLS style?
- [ ] How wide is the rocket? (Wider holds more fuel but has more drag)
- [ ] Which stage pushes toward the Moon: the red stage (like Saturn V's third stage) or the service module?
- [ ] Fins on the core stage or on the boosters?

**Auto-size helper**

Once the parts are chosen, a "Make it reach the Moon" button fills each stage with just enough propellant, using the rocket equation. Roscoe can launch his own guess first and see what happens, then compare it with the auto-sized version.

## Roscoe mode and Engineer mode

Both modes run the same physics on the same rocket; a toggle switches views at any time, even mid-flight.

|  | Roscoe mode | Engineer mode |
| --- | --- | --- |
| Building | Tap or drag big part pictures onto the rocket; swap with arrows | Numeric editor for every part; catalog search; free-design fields |
| Words | Short words at about a grade 2 reading level, with a read-aloud button on every message | Full technical labels and units |
| Launch | Big launch button and a 10-second countdown | Same, plus pitch-program and throttle settings |
| During flight | Cartoon dials for speed, height and fuel; stage pictures light up | Numeric gauges: altitude, speed, Mach, g-load, dynamic pressure, propellant per stage |
| Coasting | Mission-control checklist with green ticks | Systems status table and event log |
| After flight | Trophy or failure card with one "Try this fix" button | Charts over time (altitude, speed, acceleration, dynamic pressure, mass), trajectory plot, event timeline, run-vs-run comparison, CSV export |

The read-aloud uses the browser's built-in speech (the Web Speech API), so it works offline and costs nothing. The rocket drawing in the builder uses Roscoe's colours: white boosters, gray core, red second stage.

## Validation against real flights

"As realistic as possible" becomes measurable by flying the real-rocket presets and comparing the sim with what actually happened. This runs as an automated test suite, so every physics change gets re-scored.

**Layer 1: physics sanity tests** (must pass exactly)

- A dropped object in vacuum falls as the textbook says.
- An object in orbit with no thrust stays in the same orbit for many laps (energy is conserved).
- A stage burning in vacuum gains exactly the delta-v the rocket equation predicts.
- The atmosphere model matches the US Standard Atmosphere tables.

**Layer 2: golden flights** (must land within a tolerance band)

| Preset | Reference flight | Compared |
| --- | --- | --- |
| Saturn V | Apollo 11 post-flight evaluation report | Time and altitude of max-Q, staging times, altitude and speed at each staging, orbit reached |
| Falcon 9 | Published launch webcast telemetry | Speed and altitude over time, stage separation, first-stage landing propellant |
| Space Shuttle | NASA mission reports | Booster separation time and altitude, main engine cutoff |

Start with a loose tolerance (within about 10%), tighten it as the model improves, and keep a scorecard per preset.

**Layer 3: plausibility checks for custom designs**

Warnings when a design uses numbers no real hardware has achieved, such as an Isp beyond what its propellant allows, or tanks lighter than real materials permit.

## Mission Mode and the Space Q story

Two ways to play, chosen on a home screen: **🚀 Missions** and **🛠️ Sandbox**. The sandbox is the app as it is now, always open. Missions unlock in order; one star unlocks the next, and two- and three-star goals invite replays. One player; progress is saved on the device.

### The story

Roscoe is the newest astronaut cadet at **Space Q**, his own space company. The A1-39 is Space Q's flagship rocket. Space Q's big dream is to send a crew to Mars and bring them home, and every chapter is a step toward it.

- **Roscoe the cadet** appears in the game as a cartoon character: brown hair, big brown eyes, a big smile, a white spacesuit with blue trim, and a Space Q patch on the chest. He's drawn as a simple vector illustration based on a reference picture, which stays on this computer (`private/`, not committed) because the repo and site are public. He shows up on the home screen, in briefings and debriefs, and celebrating on the trophy wall.
- **Flight Director Did** is the coach and storyteller. He briefs each mission, talks during the flight, and debriefs afterwards. Every line is read aloud and kept short.
- **The Chief Engineer** shows up when a new builder control unlocks, to explain it.
- **The Mission Scientist** shows up in the planet chapters, asking for probes.
- **Two kinds of mission:** *History sims* re-fly real missions in Space Q's training simulator ("Before we fly our own, let's fly Vostok 1"). *Space Q missions* are made-up story missions, and they grow more common further along.
- **Branding:** the Space Q logo (`docs/brand/spaceq-logo.webp`) appears on the home screen, mission patches and briefings. Mission Mode uses Space Q's colours:

  | Colour | Hex | Used for |
  | --- | --- | --- |
  | Cream | about #F6EBCB | Briefing and debrief cards |
  | Ink | about #1F2A22 | Text and outlines |
  | Mars orange | about #E2622B | Buttons and highlights |
  | Rust | about #9E3B22 | Accents |

  The sandbox keeps its blueprint look.
- **Ranks** go up with each chapter: Cadet → Pilot → Commander → Moon Walker → Planet Hunter → Deep Space Explorer → Space Q Legend. Each mission earns a patch for the trophy wall.

### How each mission teaches

- **One new idea per mission,** and at most one new control. Controls appear only once unlocked ("NEW!" glow); the sandbox shows everything.
- **The coach points:** a hand shows what to tap, and the step waits until he does it.
- **Some missions start broken on purpose** (for example, "Too Heavy!" hands over a rocket that can't lift off).
- **Hints get stronger with each try:** a nudge, then a specific tip, then a "Show me" walk-through.
- **Each debrief ends with "🧠 You learned…",** collected in a Skill Book.
- **Early missions stay simple:** Chaos Mode and the detailed numbers stay hidden until the basics are learned.

### Failures that teach (Roscoe's feedback)

Roscoe's feedback: a failure card that says "the air pushed too hard and it broke" doesn't tell him how to fix it. So every failure card, in Missions and in the sandbox, has three parts:

1. **What happened:** a short replay of the moment, with the gauge that went wrong highlighted. For example, the 💨 Air push gauge crossing the red "too strong" line.
2. **Why, in rocket science:** two or three simple sentences and a little diagram. For example: "Air pushes harder the faster you go while the air is thick. Your rocket was going very fast, very low. The push was bigger than the rocket's strength."
3. **How you can fix it:** two or three fixes, each pointing at the exact control Roscoe can change himself. "Show me" makes Flight Director Did highlight the control and say what it does. Fixes are still tested by re-flying, as now. After a fix works, the debrief says why it worked.

Every failure gets this treatment: too heavy, broke apart, tumbled, engine failed, ran out of fuel, fell back, couldn't reach the Moon, burned up, skipped off the air, too many g, and crash landing. Each one also links to its Skill Book page.

**Every fix must be something Roscoe can actually change in his builder.** He has no throttle today, so breakups need new controls:

- **🐢 Ease off in thick air:** the max-Q throttle as a simple on/off toggle.
- **💪 Stronger body:** a structure upgrade that adds weight.

**New flight gauges** (shown once the matching mission unlocks them):

- **💨 Air push:** with a red strength line.
- **🔥 Heat:** for re-entry.
- **🫨 Squish:** for g-force.

### Mission card format

Every mission has the same parts:

- **Briefing:** story lines and a patch.
- **Starting rocket:** a preset, a saved rocket, or a blank one.
- **Fixed payload,** if the mission has one.
- **Goal:** checked automatically from the flight record.
- **Star goals:**
  - ⭐ the goal itself.
  - ⭐⭐ and ⭐⭐⭐: doing it well, such as landing the booster, using a smaller rocket, or flying with Chaos Mode on.
- **Coach lines:** at flight events.
- **Debrief:** "You learned" and the next unlock.

### Mission ladder

| # | Mission | Kind | Teaches | Unlocks |
| --- | --- | --- | --- | --- |
| **Ch. 1** | **Launch School (Cadet)** | | | |
| 1 | Liftoff! | Space Q | Launch, countdown, dials | Speed buttons |
| 2 | Too Heavy! | Space Q | Thrust vs. weight | Build tab, engine count |
| 3 | First Orbit (Vostok 1) | History | Going sideways fast, stages | Stage strip |
| 4 | Fuel for the Job | Space Q | Tanks, the power meter | Tank size, "Make it reach space" |
| 5 | Beep Beep (Sputnik) | History | Launching a satellite | Payload slots, nose cover |
| 6 | Coming Home (Mercury) | History | Heat shields, re-entry, parachutes | Heat shield |
| 7 | Don't Break It | Space Q | Max-Q, fins, tumbling | Fins |
| 8 | Recycle the Booster (Falcon 9) | History | Saving landing fuel | "Land it", booster parachutes |
| 9 | Houston, We Have a Problem | Space Q | Engine failure, mission control | Chaos Mode |
| **Ch. 2** | **Higher and Further (Pilot)** | | | |
| 10 | Visit the Space Station | History | Aiming for a set height | Target height |
| 11 | Weather Watcher | Space Q | Two burns to geostationary orbit | Orbit burns |
| 12 | Space Q's Own Rocket | Space Q | Capstone: build from scratch | Start from scratch, Save |
| **Ch. 3** | **The Moon (Commander → Moon Walker)** | | | |
| 13 | Around the Moon (Artemis II) | History | The trip to the Moon, free return | |
| 14 | Land on the Moon (Apollo 11) | History | The full fuel budget, landers | Lander slot |
| 15 | Get Them Home (Apollo 13) | History | When it breaks, free return saves the crew | |
| 16 | Moon Base Delivery | Space Q | Heavy cargo; landing vs. reaching the Moon | |
| **Ch. 4** | **Inner Planets (Planet Hunter)** | | | |
| 17 | Hello Venus (Mariner 2) | History | Leaving Earth, launch windows | Solar system map |
| 18 | Mars Orbiter | History | Braking into orbit at a planet | |
| 19 | Rover Drop (Perseverance) | History | Thin air: parachute, then rockets | Rover |
| 20 | Space Q Lands on Mars | Space Q | Space Q's own lander: plan the whole trip and touch down | Mars lander |
| 21 | Hot Hot Hot | Space Q | Venus lander: how long can it last? | |
| 22 | Closest to the Sun (MESSENGER) | History | Falling sunward takes braking | |
| **Ch. 5** | **Asteroid Belt and Ceres** | | | |
| 23 | Through the Belt | Space Q | The belt is mostly empty space | |
| 24 | Two Stops (Dawn: Vesta and Ceres) | History | Visiting two places in one trip | |
| 25 | Space Rock Sample | Space Q | Land, grab a sample, come home | |
| **Ch. 6** | **The Giants (Deep Space Explorer)** | | | |
| 26 | Jupiter Probe (Juno) | History | Why deep space needs tiny probes | Probes, kick stages |
| 27 | Slingshot! | Space Q | Borrowing a planet's speed | Gravity assists |
| 28 | Ring Dive (Cassini) | History | Saturn | |
| 29 | Grand Tour (Voyager 2) | History | Chaining slingshots to Uranus and Neptune | |
| **Ch. 7** | **The Edge (Space Q Legend)** | | | |
| 30 | Pluto Flyby (New Horizons) | History | Ten-year trips | |
| 31 | Land on Pluto ⭐ Roscoe's pick | Space Q | Landing with no air, far from the Sun | |
| 32 | Dwarf Planet Tour | Space Q | Eris, Haumea, Makemake | |
| 33 | **Space Q's Dream: Crew to Mars and Back** | Space Q | Everything | |

### New physics for the later chapters

- **Burns in orbit:** extra burns after reaching orbit (geostationary orbit, orbit raising).
- **Solar system scene:** a 2D map of the Sun, the eight planets, the dwarf planets (Ceres, Pluto, Haumea, Makemake, Eris) and the asteroid belt. Orbits are flat; Pluto and Eris keep their stretched shape. Fast-forward handles trips that take years.
- **Transfers:** patched conics (simple one-body orbits stitched together), Hohmann transfers between planets, launch windows, and braking into orbit at the destination.
- **Gravity assists:** slingshots past a planet.
- **Landings by type:** Mars (thin air: parachute, then rockets), Venus (crushing air and heat), and airless bodies like Ceres and Pluto (reusing the Moon-landing budget).
- **New parts:** small probes, kick stages, a rover with sky crane, and a Mars lander.

### Parked for later

- Money and budgets.
- Making your own missions.
- More than one player.

## Roadmap

This weekend's goal: Roscoe presses Launch on a rough A1-39 and watches it fly to orbit, or fail, with a reason. Each later phase adds one layer and stays playable.

**Phase 1: this weekend (MVP)**

- [x] Physics engine: gravity, standard atmosphere, altitude-aware thrust, drag, staging, gravity turn
- [x] Small catalog: 2 methane engines, 2 solid boosters, tanks, fins, crew modules
- [x] A1-39 and Saturn V presets, launch to Earth orbit
- [x] 2D flight animation with playback controls and live gauges
- [x] Failures: won't lift off, out of fuel, breaks apart at max-Q
- [x] Basic Roscoe mode: launch button, cartoon dials, failure card
- [x] Physics sanity tests passing; deployed to a shareable link

**Phase 2: building and swapping**

- [x] Rocket builder with part swapping and stage add/remove
- [x] Delta-v readout per stage and the auto-size helper
- [x] Engineer mode charts and run comparison
- [x] Fix suggestions via automatic what-if re-runs

**Phase 3: the full mission**

- [x] Coasting systems checklist and Chaos Mode faults
- [x] Booster parachute recovery and core-stage powered landing
- [x] Re-entry heating and crew g-loads
- [x] Tumbling failure (centre of mass vs. centre of pressure, steering authority)
- [x] Moon leg as a delta-v ledger with animation

**Phase 4: realism and reach**

- [x] Golden-flight validation for Saturn V, Falcon 9 and Shuttle with a scorecard
- [x] More presets: Falcon Heavy, SLS, Starship
- [x] Free-design parts with plausibility warnings
- [x] True 2D Earth–Moon trajectory
- [x] Install on the Fire tablet home screen as an app

**Phase 5: Mission Mode and the Space Q story**

- [x] 5a: Mission Mode foundations, with Chapters 1–2:
  - **Failures that teach:** what happened, why, and fixes Roscoe can make himself. Applies in the sandbox too.
  - **New controls and gauges:** the Air push gauge and the Ease-off and Stronger-body controls.
  - **Space Q look:** home screen (Missions / Sandbox), Space Q logo and colours, and the cartoon Roscoe.
  - **Story and coaching:** Flight Director Did and the story lines, controls that unlock as he learns, hints that get stronger, and the Skill Book.
  - **The missions:** the mission framework, stars and saved progress; Chapters 1–2, including burns in orbit.
- [x] 5b: Chapter 3, the Moon: four missions, the Moon lander control, one-way cargo landers, the Apollo 13 lifeboat fault, and burn-by-burn Moon failure cards
- [ ] 5c: Solar system map, transfers and launch windows; Chapters 4–5 (Mars landing, asteroid belt, Ceres)
- [ ] 5d: Gravity assists, the outer planets, dwarf planets; Chapters 6–7 and the finale

## Appendix: kickoff prompt for Claude Code

Paste this into a fresh Claude Code session, ideally after exporting this doc as Markdown into the repo as `PLAN.md`.

```markdown
We're building a browser-based 2D rocket flight simulator, described in PLAN.md.
Build Phase 1 only.

Stack: Vite + React + TypeScript, HTML Canvas 2D for the flight view,
uPlot for charts, Vitest for tests. Static build deployable to GitHub Pages.

Architecture rules:
- src/physics/ is a pure TypeScript module with no UI imports. Input: a
  RocketSpec JSON. Output: a FlightRecord (time series + events + outcome).
- Simulate the whole flight first, then animate playback of the record.
- SI units everywhere internally; name variables with units (e.g. thrustN, massKg).

Physics (Phase 1):
- 2D round rotating Earth, inverse-square gravity, launch from KSC.
- US Standard Atmosphere 1976 for density, pressure, temperature, speed of sound.
- Liquid engine thrust = vacuum thrust - ambient pressure x nozzle exit area;
  mass flow from vacuum thrust and vacuum Isp.
- Solid boosters follow a thrust-vs-time table; no throttle or shutdown.
- Drag = 0.5 rho v^2 Cd(Mach) A, with a transonic peak in Cd.
- Staging on burnout; vertical rise, pitch kick, gravity turn.
- RK4 integrator, fixed step ~0.05 s, event detection.
- Failures: thrust-to-weight < 1 at liftoff, propellant exhausted before orbit,
  dynamic pressure above a part's structural limit.

Data: a parts catalog in src/data/parts.json with a source field on every part.
Presets: Saturn V and the A1-39 (layout in PLAN.md; size propellant with the
rocket equation so it reaches orbit). Flag any spec you are unsure of.

UI: Roscoe mode (big launch button, countdown, cartoon dials for speed,
height and fuel, a failure card in short simple words with read-aloud via the
Web Speech API) and a basic Engineer mode with numeric gauges.
Must work on a Fire tablet's Silk browser: touch-friendly, light on CPU.

Tests first: write the physics sanity tests in PLAN.md (vacuum free fall,
stable orbit energy conservation, rocket-equation agreement, atmosphere
table values) and make them pass before building the UI.
```
