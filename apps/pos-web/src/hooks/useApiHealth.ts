import { useQuery } from "@tanstack/react-query";

interface HealthResponse {
  status: "ok";
  db: boolean;
  redis: boolean;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export function useApiHealth() {
  return useQuery<HealthResponse>({
    queryKey: ["health"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/health`);
      if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
      return res.json();
    },
    retry: 1,
    refetchInterval: 15_000,
  });
}
