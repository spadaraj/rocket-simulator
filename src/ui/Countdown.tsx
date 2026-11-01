import { useEffect, useRef, useState } from 'react';
import { speak } from './speech';

export function Countdown({ from, onDone, voice }: { from: number; onDone: () => void; voice: boolean }) {
  const [n, setN] = useState(from);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (n <= 0) {
      done.current();
      return;
    }
    if (voice && n <= 5) speak(String(n));
    const id = window.setTimeout(() => setN(n - 1), 1000);
    return () => window.clearTimeout(id);
  }, [n, voice]);
  return (
    <div className="countdown" role="status" aria-live="assertive">
      <div className="countdown-number" key={n}>
        {n}
      </div>
      <button className="btn ghost" onClick={() => done.current()}>
        Skip
      </button>
    </div>
  );
}
