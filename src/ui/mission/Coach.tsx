// Flight Director Did as a coach: a speech bubble, and a pulsing ring around whatever he
// wants Roscoe to tap. A step moves on when its condition comes true, when the thing it
// points at is tapped, or when Roscoe taps OK.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CoachContext, CoachStep } from '../../missions/types';
import { canSpeak, speak } from '../speech';
import { Did } from './Characters';

function useTargetRect(target?: string) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const scrolled = useRef<string | undefined>(undefined);
  useLayoutEffect(() => {
    if (!target) {
      setRect(null);
      return;
    }
    const find = () => document.querySelector<HTMLElement>(`[data-coach="${target}"]`);
    const update = () => {
      const el = find();
      if (el && scrolled.current !== target) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        scrolled.current = target;
      }
      const r = el?.getBoundingClientRect();
      setRect(r && r.width > 0 ? r : null);
    };
    update();
    const id = window.setInterval(update, 250);
    return () => window.clearInterval(id);
  }, [target]);
  return rect;
}

function Spotlight({ target }: { target?: string }) {
  const rect = useTargetRect(target);
  if (!rect) return null;
  const pad = 8;
  return (
    <div
      className="coach-ring"
      style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }}
      aria-hidden="true"
    >
      <span className="coach-hand">👆</span>
    </div>
  );
}

interface Props {
  steps: CoachStep[];
  ctx: CoachContext;
  /** "Show me" from a failure card: point at one control and explain it. */
  showMe?: { target: string; say: string } | null;
  onShowMeDone: () => void;
  /** A line Did says during the flight. */
  line?: string | null;
}

export function Coach({ steps, ctx, showMe, onShowMeDone, line }: Props) {
  const [i, setI] = useState(0);
  const step = steps[i];

  // Start over when the steps change (a new mission).
  useEffect(() => setI(0), [steps]);

  // Move on when the step's condition comes true.
  useEffect(() => {
    if (step?.until && step.until(ctx)) setI((n) => n + 1);
  }, [step, ctx]);

  // Or when the thing it points at is tapped.
  useEffect(() => {
    if (!step?.point || step.until) return;
    const onTap = (e: Event) => {
      const el = (e.target as HTMLElement).closest(`[data-coach="${step.point}"]`);
      if (el) setI((n) => n + 1);
    };
    document.addEventListener('click', onTap, true);
    return () => document.removeEventListener('click', onTap, true);
  }, [step]);

  // Show me: tapping the control (or OK) finishes it.
  useEffect(() => {
    if (!showMe) return;
    const onTap = (e: Event) => {
      if ((e.target as HTMLElement).closest(`[data-coach="${showMe.target}"]`)) onShowMeDone();
    };
    document.addEventListener('click', onTap, true);
    return () => document.removeEventListener('click', onTap, true);
  }, [showMe, onShowMeDone]);

  const say = showMe?.say ?? step?.say ?? line ?? null;
  useEffect(() => {
    if (say && canSpeak) speak(say);
  }, [say]);

  if (!say) return null;
  const target = showMe?.target ?? step?.point;
  const needsOk = showMe || (step && (step.ok || (!step.point && !step.until)));
  return (
    <>
      <Spotlight target={target} />
      <div className={`coach ${line && !step && !showMe ? 'transient' : ''}`} role="status" aria-live="polite">
        <Did size={64} />
        <div className="coach-bubble">
          <b>Flight Director Did</b>
          <p>{say}</p>
          {needsOk && (
            <button className="btn small" onClick={() => (showMe ? onShowMeDone() : setI((n) => n + 1))}>
              OK 👍
            </button>
          )}
        </div>
      </div>
    </>
  );
}
