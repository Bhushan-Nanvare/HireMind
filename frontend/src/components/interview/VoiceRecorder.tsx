import { useEffect, useRef, useState } from "react";
import { pickRecordingFormat } from "../../utils/voice";
import { buttonPrimary, buttonSecondary } from "../common/styles";

const MAX_SECONDS = 180;

type Phase = "idle" | "recording" | "recorded";

interface Recording {
  blob: Blob;
  url: string;
  fileName: string;
}

/** Records a spoken answer, lets the candidate listen back, then hands the recording to `onSubmit`. */
export default function VoiceRecorder({
  submitting,
  onSubmit,
}: {
  submitting: boolean;
  onSubmit: (recording: Blob, fileName: string) => Promise<void>;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const [recording, setRecording] = useState<Recording | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const previewUrlRef = useRef<string | null>(null);

  function releaseMicrophone() {
    window.clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  function discardRecording() {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setRecording(null);
  }

  function stopRecording() {
    window.clearInterval(timerRef.current);
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  async function startRecording() {
    setError("");
    discardRecording();

    const format = pickRecordingFormat();
    if (!format) {
      setError("This browser can't record audio. Please type your answer instead.");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Microphone access was blocked. Allow it in your browser's site settings, or type your answer instead.");
      return;
    }
    streamRef.current = stream;

    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream, { mimeType: format.mimeType });
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = () => {
      releaseMicrophone();
      const blob = new Blob(chunks, { type: format.mimeType });
      const url = URL.createObjectURL(blob);
      previewUrlRef.current = url;
      setRecording({ blob, url, fileName: `answer.${format.extension}` });
      setPhase("recorded");
    };
    recorderRef.current = recorder;
    recorder.start();

    setSeconds(0);
    setPhase("recording");
    const startedAt = Date.now();
    timerRef.current = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      setSeconds(elapsed);
      if (elapsed >= MAX_SECONDS) stopRecording();
    }, 250);
  }

  // Release the microphone and the preview if the candidate leaves mid-recording
  useEffect(() => {
    return () => {
      const recorder = recorderRef.current;
      if (recorder?.state === "recording") {
        recorder.onstop = null;
        recorder.stop();
      }
      window.clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className="space-y-3">
      {phase === "idle" && (
        <div className="rounded-md border border-dashed border-slate-300 bg-white p-5 text-center">
          <p className="text-sm text-slate-600">Record your answer, up to 3 minutes. You can listen to it before submitting.</p>
          <button type="button" onClick={startRecording} className={`${buttonPrimary} mt-3`}>
            Start recording
          </button>
        </div>
      )}

      {phase === "recording" && (
        <div className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 p-4">
          <span className="flex items-center gap-2 text-sm font-medium text-red-700">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-600" aria-hidden />
            Recording {clock}
          </span>
          <button type="button" onClick={stopRecording} className={buttonSecondary}>
            Stop
          </button>
        </div>
      )}

      {phase === "recorded" && recording && (
        <div className="space-y-3 rounded-md border border-slate-200 bg-white p-4">
          <audio controls src={recording.url} className="w-full" />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onSubmit(recording.blob, recording.fileName)}
              disabled={submitting}
              className={buttonPrimary}
            >
              {submitting ? "Transcribing and scoring…" : "Submit recording"}
            </button>
            <button type="button" onClick={startRecording} disabled={submitting} className={buttonSecondary}>
              Record again
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
