import { useEffect, useRef, useState } from "react";
import { buttonPrimary, buttonSecondary, inputClass } from "../common/styles";
import { ErrorMessage } from "../common/ui";
import { createDictation, speak, stopSpeaking, type Dictation } from "../../utils/speech";
import { pickRecordingFormat } from "../../utils/voice";

export interface VoiceMetrics {
  /** Silence between the question finishing and the first recognised word */
  latencyMs?: number;
  speakingMs?: number;
  wordCount?: number;
  longPauses?: number;
  edited?: boolean;
}

export interface ConversationalPayload {
  answerText: string;
  rawTranscript: string;
  metrics: VoiceMetrics;
  recording: Blob | null;
  fileName: string;
}

/** A gap this long between recognised phrases reads as a pause for thought rather than a breath. */
const LONG_PAUSE_MS = 2500;

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

type Phase = "speaking" | "listening" | "review";

export default function ConversationalAnswer({
  questionText,
  submitting,
  onSubmit,
  onBlockedPaste,
}: {
  questionText: string;
  submitting: boolean;
  onSubmit: (payload: ConversationalPayload) => void | Promise<void>;
  onBlockedPaste: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("speaking");
  const [settled, setSettled] = useState("");
  const [pending, setPending] = useState("");
  const [edited, setEdited] = useState<string | null>(null);
  const [error, setError] = useState("");

  const dictation = useRef<Dictation | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const format = useRef(pickRecordingFormat());

  const questionEndedAt = useRef(0);
  const firstResultAt = useRef(0);
  const lastResultAt = useRef(0);
  const longPauses = useRef(0);

  // Read the question aloud, then start listening. Runs once: the parent remounts this per question.
  useEffect(() => {
    let cancelled = false;

    function stopEverything() {
      stopSpeaking();
      dictation.current?.stop();
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((track) => track.stop());
    }

    async function begin() {
      await speak(questionText);
      if (cancelled) return;
      questionEndedAt.current = Date.now();

      // Best effort: the transcript is the answer, the recording is only evidence for the recruiter
      const chosen = format.current;
      if (chosen) {
        try {
          const media = await navigator.mediaDevices.getUserMedia({ audio: true });
          if (cancelled) {
            media.getTracks().forEach((track) => track.stop());
            return;
          }
          stream.current = media;
          const created = new MediaRecorder(media, { mimeType: chosen.mimeType });
          created.ondataavailable = (event) => {
            if (event.data.size > 0) chunks.current.push(event.data);
          };
          created.start();
          recorder.current = created;
        } catch {
          // No microphone for recording; recognition may still work on its own
        }
      }

      const started = createDictation({
        onTranscript: (nextSettled, nextPending) => {
          setSettled(nextSettled);
          setPending(nextPending);
        },
        onResult: () => {
          const now = Date.now();
          if (firstResultAt.current === 0) firstResultAt.current = now;
          else if (now - lastResultAt.current > LONG_PAUSE_MS) longPauses.current += 1;
          lastResultAt.current = now;
        },
        onError: setError,
      });
      dictation.current = started;
      started?.start();
      if (!cancelled) setPhase("listening");
    }

    void begin();
    return () => {
      cancelled = true;
      stopEverything();
    };
  }, [questionText]);

  function finishSpeaking() {
    dictation.current?.stop();
    if (recorder.current?.state === "recording") recorder.current.stop();
    stream.current?.getTracks().forEach((track) => track.stop());
    setPhase("review");
  }

  function resumeSpeaking() {
    setEdited(null);
    setPhase("listening");
    dictation.current?.start();
  }

  const transcript = `${settled}${pending ? ` ${pending}` : ""}`.trim();
  const answerText = edited ?? transcript;

  async function handleSubmit() {
    const recording = chunks.current.length
      ? new Blob(chunks.current, { type: format.current?.mimeType ?? "audio/webm" })
      : null;

    const metrics: VoiceMetrics = {
      wordCount: countWords(answerText),
      longPauses: longPauses.current,
      edited: answerText !== transcript,
    };
    if (firstResultAt.current && questionEndedAt.current) {
      metrics.latencyMs = Math.max(0, firstResultAt.current - questionEndedAt.current);
    }
    if (firstResultAt.current && lastResultAt.current) {
      metrics.speakingMs = Math.max(0, lastResultAt.current - firstResultAt.current);
    }

    await onSubmit({
      answerText,
      rawTranscript: transcript,
      metrics,
      recording,
      fileName: `answer.${format.current?.extension ?? "webm"}`,
    });
  }

  if (phase === "speaking") {
    return (
      <div className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-600">
        <span className="inline-flex items-center gap-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-slate-900" aria-hidden="true" />
          Reading the question aloud…
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {phase === "listening" ? (
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <p className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" aria-hidden="true" />
            Listening — just talk, and press Done when you've finished
          </p>
          <p className="mt-3 min-h-[5rem] whitespace-pre-wrap text-sm leading-relaxed text-slate-900" aria-live="polite">
            {settled}
            {pending && <span className="text-slate-400"> {pending}</span>}
            {!transcript && <span className="text-slate-400">Your words will appear here as you speak.</span>}
          </p>
          <button type="button" onClick={finishSpeaking} className={`${buttonSecondary} mt-3`}>
            Done speaking
          </button>
        </div>
      ) : (
        <>
          <label htmlFor="answer" className="block text-xs text-slate-500">
            Fix anything that was misheard, then submit. Large rewrites are flagged for the recruiter.
          </label>
          <textarea
            id="answer"
            value={answerText}
            onChange={(event) => setEdited(event.target.value)}
            onPaste={(event) => {
              event.preventDefault();
              onBlockedPaste();
            }}
            rows={7}
            maxLength={5000}
            className={inputClass}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button type="button" onClick={resumeSpeaking} disabled={submitting} className={buttonSecondary}>
              Speak more
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !answerText.trim()}
              className={buttonPrimary}
            >
              {submitting ? "Scoring your answer…" : "Submit answer"}
            </button>
          </div>
        </>
      )}

      <ErrorMessage message={error} />
    </div>
  );
}
