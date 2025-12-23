export function stopAsrRuntime(): void {
  if (typeof window === 'undefined') return;
  try {
    const w = window as any;
    const speech = w.__tpSpeech;
    if (speech && typeof speech.stopRecognizer === 'function') {
      speech.stopRecognizer();
    }
  } catch {}
}
