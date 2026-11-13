// The Web Speech API isn't in TypeScript's DOM library, so the parts used here are declared locally.
interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionResult {
  readonly length: number;
  readonly isFinal: boolean;
  readonly [index: number]: RecognitionAlternative | undefined;
}
interface RecognitionResultList {
  readonly length: number;
  readonly [index: number]: RecognitionResult | undefined;
}
interface RecognitionEvent {
  readonly resultIndex: number;
  readonly results: RecognitionResultList;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type RecognitionConstructor = new () => Recognition;

function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** True when the browser can read questions aloud. */
export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** True when the browser can transcribe speech as it's spoken. Chrome and Edge only today. */
export function canRecognise(): boolean {
  return recognitionConstructor() !== null;
}

/** Reads text aloud, resolving when it finishes. Resolves immediately where speech isn't supported. */
export function speak(text: string): Promise<void> {
  if (!canSpeak()) return Promise.resolve();
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    // Resolve either way: a voice that fails to load must not strand the interview
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  });
}

export function stopSpeaking(): void {
  if (canSpeak()) window.speechSynthesis.cancel();
}

export interface Dictation {
  start(): void;
  stop(): void;
}

/**
 * Live transcription. `onTranscript` fires with everything recognised so far plus the words still
 * being revised; `onResult` fires on every update so the caller can time pauses.
 */
export function createDictation(handlers: {
  onTranscript: (settled: string, pending: string) => void;
  onResult: () => void;
  onError: (message: string) => void;
}): Dictation | null {
  const Ctor = recognitionConstructor();
  if (!Ctor) return null;

  const recognition = new Ctor();
  recognition.lang = navigator.language || "en-US";
  recognition.continuous = true;
  recognition.interimResults = true;

  let settled = "";
  let wanted = false;

  recognition.onresult = (event) => {
    let pending = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const text = result?.[0]?.transcript ?? "";
      if (!text) continue;
      if (result?.isFinal) settled += (settled ? " " : "") + text.trim();
      else pending += text;
    }
    handlers.onResult();
    handlers.onTranscript(settled, pending.trim());
  };

  recognition.onerror = (event) => {
    // Silence between sentences is normal; anything else is worth surfacing
    if (event.error === "no-speech" || event.error === "aborted") return;
    handlers.onError(
      event.error === "not-allowed"
        ? "Microphone access was blocked. Allow it in your browser, or switch to typing."
        : "Speech recognition stopped unexpectedly. You can keep going or switch to typing."
    );
  };

  // Chrome ends the session after a pause even when continuous; restart until the caller stops it
  recognition.onend = () => {
    if (wanted) {
      try {
        recognition.start();
      } catch {
        // Already restarting; the next onend will try again
      }
    }
  };

  return {
    start() {
      wanted = true;
      try {
        recognition.start();
      } catch {
        // start() throws if it is already running, which is harmless here
      }
    },
    stop() {
      wanted = false;
      recognition.stop();
    },
  };
}
