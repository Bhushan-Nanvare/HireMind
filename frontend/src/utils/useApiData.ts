import { useCallback, useEffect, useState, type DependencyList } from "react";
import { errorMessage } from "./errors";

/**
 * Loads a page's data. `loading` is true only until the first result arrives; `reload()` refetches in the
 * background (keeping the current data on screen) and `setData` applies local updates after a change.
 */
export function useApiData<T>(load: () => Promise<T>, deps: DependencyList, errorFallback = "Couldn't load this page.") {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    load().then(
      (result) => {
        if (cancelled) return;
        setData(result);
        setError("");
      },
      (err) => {
        if (!cancelled) setError(errorMessage(err, errorFallback));
      }
    );
    return () => {
      cancelled = true;
    };
    // Callers list what `load` depends on in `deps`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  return { data, error, loading: data === null && !error, reload, setData };
}
