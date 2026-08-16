import { useEffect, useState } from "react";

// navigator.onLine solo refleja si el sistema operativo tiene una interfaz
// de red activa — no si internet realmente funciona (puede dar true con
// wifi conectado pero sin salida real). Es la señal estándar del browser
// igual, y suficiente para el caso de uso: avisar "modo degradado" y
// bloquear el cobro cuando el navegador YA sabe que no hay conexión, no
// detectar cada microcorte exacto.
export function useNetworkStatus(): boolean {
  const [isOnline, setIsOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine,
  );

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return isOnline;
}
