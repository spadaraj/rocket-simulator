// Client side of the search worker, with an inline fallback for browsers without module workers.

import { catalog } from '../data/catalog';
import { autoSize, type AutoSizeResult } from '../physics/autosize';
import { findFixes, type FixResult } from '../physics/fixes';
import type { ControlId } from '../physics/controls';
import { planFixes, type Plan } from '../physics/plan';
import type { Fault, MissionFailureType, RocketSpec } from '../physics/types';

export type WorkerRequest =
  | { id: number; kind: 'autosize'; spec: RocketSpec }
  | {
      id: number;
      kind: 'fixes';
      spec: RocketSpec;
      failureType: MissionFailureType;
      detail: Record<string, number | string>;
      faults: Fault[];
      limit?: number;
    }
  | { id: number; kind: 'plan'; spec: RocketSpec; faults: Fault[]; allowed?: ControlId[] };

type Pending = (result: unknown) => void;
/** Omit that distributes over the union. */
type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never;

let worker: Worker | null | undefined;
let nextId = 1;
const pending = new Map<number, Pending>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL('./simWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; result: unknown }>) => {
      pending.get(e.data.id)?.(e.data.result);
      pending.delete(e.data.id);
    };
    worker.onerror = () => {
      worker = null;
    };
  } catch {
    worker = null;
  }
  return worker;
}

function run<T>(req: WithoutId<WorkerRequest>, inline: () => T): Promise<T> {
  const w = getWorker();
  if (!w) return new Promise((resolve) => setTimeout(() => resolve(inline()), 30));
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve as Pending);
    w.postMessage({ ...req, id });
  });
}

export function autoSizeAsync(spec: RocketSpec): Promise<AutoSizeResult> {
  return run({ kind: 'autosize', spec }, () => autoSize(spec, catalog));
}

export function findFixesAsync(
  spec: RocketSpec,
  failureType: MissionFailureType,
  detail: Record<string, number | string>,
  faults: Fault[],
  limit = 3,
): Promise<{ fixes: FixResult[]; tested: number }> {
  return run({ kind: 'fixes', spec, failureType, detail, faults, limit }, () => findFixes(spec, catalog, failureType, limit, detail, faults));
}

/** Every change it takes to make this rocket fly, using only the allowed controls. */
export function planFixesAsync(spec: RocketSpec, faults: Fault[], allowed?: ControlId[]): Promise<Plan> {
  return run({ kind: 'plan', spec, faults, allowed }, () => planFixes(spec, catalog, faults, allowed));
}
