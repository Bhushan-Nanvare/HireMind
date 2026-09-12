// Formats MediaRecorder can produce that the API accepts, in order of preference
const RECORDING_FORMATS = [
  { mimeType: "audio/webm;codecs=opus", extension: "webm" },
  { mimeType: "audio/webm", extension: "webm" },
  { mimeType: "audio/ogg;codecs=opus", extension: "ogg" },
  { mimeType: "audio/mp4", extension: "m4a" },
];

/** The first recording format this browser supports, or null if it can't record audio. */
export function pickRecordingFormat(): { mimeType: string; extension: string } | null {
  if (typeof MediaRecorder === "undefined") return null;
  return RECORDING_FORMATS.find((format) => MediaRecorder.isTypeSupported(format.mimeType)) ?? null;
}

/** True when the browser can record an answer from the microphone. */
export function canRecordVoice(): boolean {
  return Boolean(navigator.mediaDevices?.getUserMedia) && pickRecordingFormat() !== null;
}
