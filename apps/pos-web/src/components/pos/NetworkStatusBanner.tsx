"use client";

import { useNetworkStatus } from "@/hooks/useNetworkStatus";

export function NetworkStatusBanner() {
  const isOnline = useNetworkStatus();

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        isOnline
          ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
          : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
      }`}
      title={isOnline ? "Conectado al servidor" : "Sin conexión — no se pueden registrar cobros hasta reconectar"}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${isOnline ? "bg-green-600" : "bg-red-600"}`} />
      {isOnline ? "En línea" : "Sin conexión · modo degradado"}
    </span>
  );
}
