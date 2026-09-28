import { useCallback, useState } from "react";

export const useApi = <T,>() => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<T | null>(null);

  const execute = useCallback(async (fn: () => Promise<T>) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fn();
      setData(result);
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Something went wrong";
      setError(message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, data, execute };
};
