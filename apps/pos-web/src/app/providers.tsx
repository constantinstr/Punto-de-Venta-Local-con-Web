"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { SupportWidget } from "@/components/support/SupportWidget";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {/* Único punto de montaje: cubre landing + login/register + /pos +
          (admin)/* de una — el widget mismo se auto-oculta sin sesión. */}
      <SupportWidget />
    </QueryClientProvider>
  );
}
