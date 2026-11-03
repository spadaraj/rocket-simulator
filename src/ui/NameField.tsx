// Rocket name box. Commits when you leave the box or press Enter, so typing doesn't re-fly the rocket on every letter.

import { useEffect, useState } from 'react';

export function NameField({ value, onChange, className }: { value: string; onChange: (name: string) => void; className: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    const name = draft.trim() || 'My rocket';
    if (name !== value) onChange(name);
    else setDraft(value);
  };
  return (
    <input
      className={className}
      value={draft}
      maxLength={30}
      aria-label="Rocket name"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}
