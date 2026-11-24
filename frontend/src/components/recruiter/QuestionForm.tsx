import { useState, type FormEvent } from "react";
import type { QuestionInput } from "../../api/mcqApi";
import { buttonPrimary, buttonSecondary, inputClass, labelClass } from "../common/styles";
import { ErrorMessage } from "../common/ui";
import { errorMessage } from "../../utils/errors";

const MAX_OPTIONS = 6;

export default function QuestionForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: { text: string; options: string[]; correct: number[]; topic: string | null };
  submitLabel: string;
  onSubmit: (question: QuestionInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const [text, setText] = useState(initial?.text ?? "");
  const [options, setOptions] = useState(initial?.options ?? ["", "", "", ""]);
  const [correct, setCorrect] = useState<number[]>(initial?.correct ?? []);
  const [topic, setTopic] = useState(initial?.topic ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function setOption(index: number, value: string) {
    setOptions(options.map((option, position) => (position === index ? value : option)));
  }

  function removeOption(index: number) {
    setOptions(options.filter((_, position) => position !== index));
    setCorrect(correct.filter((value) => value !== index).map((value) => (value > index ? value - 1 : value)));
  }

  function toggleCorrect(index: number) {
    setCorrect(correct.includes(index) ? correct.filter((value) => value !== index) : [...correct, index]);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const cleaned = options.map((option) => option.trim());
    if (cleaned.some((option) => option === "")) return setError("Fill in every option, or remove the empty ones.");
    if (correct.length === 0) return setError("Tick at least one correct answer.");

    setSaving(true);
    setError("");
    try {
      await onSubmit({
        text: text.trim(),
        options: cleaned,
        correct: [...correct].sort((a, b) => a - b),
        ...(topic.trim() && { topic: topic.trim() }),
      });
      if (!initial) {
        setText("");
        setOptions(["", "", "", ""]);
        setCorrect([]);
        setTopic("");
      }
    } catch (err) {
      setError(errorMessage(err, "Couldn't save this question."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="question-text" className={labelClass}>
          Question
        </label>
        <textarea
          id="question-text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={3}
          maxLength={1000}
          className={inputClass}
          required
        />
      </div>

      <fieldset>
        <legend className={labelClass}>Options — tick every correct one</legend>
        <div className="space-y-2">
          {options.map((option, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={correct.includes(index)}
                onChange={() => toggleCorrect(index)}
                aria-label={`Option ${index + 1} is correct`}
                className="h-4 w-4"
              />
              <input
                value={option}
                onChange={(event) => setOption(index, event.target.value)}
                aria-label={`Option ${index + 1}`}
                maxLength={300}
                className={inputClass}
              />
              {options.length > 2 && (
                <button type="button" onClick={() => removeOption(index)} className={buttonSecondary} aria-label={`Remove option ${index + 1}`}>
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
        {options.length < MAX_OPTIONS && (
          <button type="button" onClick={() => setOptions([...options, ""])} className={`${buttonSecondary} mt-2`}>
            Add option
          </button>
        )}
      </fieldset>

      <div>
        <label htmlFor="question-topic" className={labelClass}>
          Topic (optional)
        </label>
        <input
          id="question-topic"
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          maxLength={60}
          className={inputClass}
        />
      </div>

      <ErrorMessage message={error} />
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className={buttonPrimary}>
          {saving ? "Saving…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={saving} className={buttonSecondary}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
