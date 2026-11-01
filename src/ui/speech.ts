// Read-aloud via the browser's built-in Web Speech API (offline, free).
// Silk on Fire tablets may not ship it, so callers hide the button when unsupported.

export const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;

export function speak(text: string) {
  if (!canSpeak) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.9;
  u.pitch = 1.1;
  window.speechSynthesis.speak(u);
}
