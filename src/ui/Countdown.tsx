import { useEffect, useRef, useState } from 'react';
import { beep, callOut, engineRoar } from './sound';

/** Seconds before liftoff when the engines light and start to rumble. */
const IGNITION_S = 3;

export function Countdown({ from, onDone, voice }: { from: number; onDone: () => void; voice: boolean }) {
  const [n, setN] = useState(from);
  const done = useRef(onDone);
  done.current = onDone;
  const ignited = useRef(false);

  const finish = () => {
    if (!ignited.current) {
      ignited.current = true;
      engineRoar(0.4, 8);
    }
    done.current();
  };

  useEffect(() => {
    if (n <= 0) {
      beep(true);
      if (voice) callOut('Liftoff! We have liftoff!');
      finish();
      return;
    }
    beep();
    if (voice) {
      if (n === from) callOut(`T minus ${n}`);
      else if (n <= 5) callOut(String(n));
    }
    if (n === IGNITION_S && !ignited.current) {
      ignited.current = true;
      engineRoar(IGNITION_S, 9);
    }
    const id = window.setTimeout(() => setN(n - 1), 1000);
    return () => window.clearTimeout(id);
  }, [n, voice]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="countdown" role="status" aria-live="assertive">
      {n <= IGNITION_S && <div className="countdown-note">🔥 Ignition!</div>}
      <div className="countdown-number" key={n}>
        {n}
      </div>
      <button className="btn ghost" onClick={finish}>
        Skip
      </button>
    </div>
  );
}
