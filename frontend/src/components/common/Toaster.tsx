import { useToastStore } from "../../store/toastStore";

export default function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.kind === "error" ? "alert" : "status"}
          className={`flex items-start gap-3 rounded-md border px-4 py-3 text-sm shadow-md ${
            t.kind === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-slate-200 bg-white text-slate-800"
          }`}
        >
          <span className="flex-1">{t.message}</span>
          <button onClick={() => dismiss(t.id)} className="text-slate-400 hover:text-slate-700" aria-label="Dismiss">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
