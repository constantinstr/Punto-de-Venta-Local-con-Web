# Periféricos — Lector de código de barras e impresión

## 1. Lector de código de barras (USB/Bluetooth, modo teclado)

Los lectores de mostrador típicos (USB o Bluetooth HID) se comportan como un
teclado: tipean el código muy rápido y terminan con `Enter`. La estrategia
**no** es un input dedicado con foco fijo (rompe cualquier flujo donde el
cajero esté tipeando en otro campo) sino un **listener global** que:

1. Escucha `keydown` en `window`, sin importar qué elemento tenga el foco.
2. Mide el intervalo entre teclas: un humano tipea > 60-80ms entre teclas,
   un lector HID tipea prácticamente todos los caracteres en < 30ms. Ese
   delta es la señal que distingue "alguien escribiendo" de "un scan".
3. Acumula caracteres en un buffer hasta ver `Enter` (o timeout de buffer).
4. Si el buffer resultante cumple el patrón esperado (largo mínimo, todo
   dígitos/alfanumérico según tus códigos), dispara `onScan(code)`.
5. Si el foco está en un `<input>`/`<textarea>` que el propio dev marcó como
   "de texto libre" (`data-no-scan`), el hook no intercepta — deja que el
   navegador maneje el evento normalmente.

```tsx
// apps/pos-web/hooks/useBarcodeScanner.ts
import { useEffect, useRef } from "react";

interface UseBarcodeScannerOptions {
  onScan: (code: string) => void;
  minLength?: number;       // largo mínimo para considerar "scan" válido
  maxKeyDelayMs?: number;   // umbral entre teclas para distinguir scanner de tipeo humano
  bufferResetMs?: number;   // si no llega Enter, resetea el buffer
  enabled?: boolean;
}

export function useBarcodeScanner({
  onScan,
  minLength = 6,
  maxKeyDelayMs = 40,
  bufferResetMs = 200,
  enabled = true,
}: UseBarcodeScannerOptions) {
  const bufferRef = useRef("");
  const lastKeyTimeRef = useRef(0);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!enabled) return;

    function resetBuffer() {
      bufferRef.current = "";
    }

    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-no-scan]")) return; // input de texto libre, no interceptar

      const now = performance.now();
      const delta = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      // Tecla aislada / demasiado lenta => no es un scan, reiniciar buffer
      if (delta > maxKeyDelayMs && bufferRef.current.length > 0) {
        resetBuffer();
      }

      if (e.key === "Enter") {
        const code = bufferRef.current;
        resetBuffer();
        if (code.length >= minLength) {
          e.preventDefault();
          onScan(code);
        }
        return;
      }

      // Solo caracteres imprimibles de 1 char (descarta Shift, Tab, flechas, etc.)
      if (e.key.length === 1) {
        bufferRef.current += e.key;
      }

      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = setTimeout(resetBuffer, bufferResetMs);
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      clearTimeout(resetTimerRef.current);
    };
  }, [enabled, minLength, maxKeyDelayMs, bufferResetMs, onScan]);
}
```

Uso en la pantalla de venta:

```tsx
useBarcodeScanner({
  onScan: (code) => addToCartByBarcode(code),
  enabled: !isModalOpen, // no interceptar scans mientras hay un modal bloqueante, p.ej. pago
});
```

**Bluetooth HID** se comporta idéntico a USB a nivel de eventos de teclado —
no requiere código distinto. Si más adelante se necesita un lector que hable
Web Bluetooth GATT (no HID), es una integración aparte vía `navigator.
bluetooth`, fuera del alcance de Fase 1.

## 2. Impresión

Dos necesidades distintas, dos mecanismos:

### 2.1 Ticket térmico (58mm/80mm)

**Decisión de arquitectura**: no usar WebUSB/WebSerial como default. Motivos:
requiere permisos explícitos por sitio+dispositivo en Chrome (mala UX
recurrente en mostrador), y muchas impresoras térmicas fiscales/no fiscales
en Argentina ya vienen con driver Windows que las expone como impresora del
sistema.

**Enfoque recomendado**: HTML/CSS formateado a medida de página térmica +
`window.print()` sobre una ventana/iframe oculto, apuntando a la impresora
térmica configurada como impresora predeterminada del navegador (Chrome
Kiosk printing la puede fijar sin diálogo, ver nota abajo).

```css
/* apps/pos-web/styles/print-ticket.css */
@media print {
  @page {
    size: 80mm auto; /* o 58mm auto según el modelo */
    margin: 0;
  }
  body * { visibility: hidden; }
  #ticket, #ticket * { visibility: visible; }
  #ticket {
    position: absolute;
    top: 0; left: 0;
    width: 80mm;
    font-family: "Courier New", monospace;
    font-size: 11px;
  }
}
```

```tsx
// apps/pos-web/components/Ticket.tsx — se renderiza oculto y se imprime on-demand
export function printTicket() {
  window.print(); // dispara el diálogo, o imprime directo si Chrome corre en modo kiosk
}
```

Para eliminar el diálogo de impresión (requisito real de velocidad en
mostrador), se lanza Chrome con:

```
chrome.exe --kiosk-printing
```

en la PC de caja, apuntando la app en modo kiosco. Esto es configuración de
despliegue, no de código — documentar en el manual de instalación de cada
punto de venta.

**Alternativa para impresión silenciosa multi-SO sin flags de Chrome**: un
**agente de impresión local** (proceso Node pequeño corriendo en la PC de
caja, expone un WebSocket/HTTP en `localhost`) que recibe el ticket ya
formateado y lo manda por ESC/POS crudo a la impresora vía `node-thermal-
printer` o similar. Se evalúa en Fase 2 si `--kiosk-printing` no cubre algún
modelo de impresora. Mantiene el POS 100% web sin instalar nada pesado en el
cliente (el agente es opcional y liviano).

### 2.2 Comprobante A4 (factura fiscal completa)

Generación de PDF en el navegador con `@react-pdf/renderer` o, más simple
para Fase 1, HTML+CSS con `@page { size: A4 }` e impresión vía
`window.print()` igual que el ticket pero con layout completo (logo, datos
fiscales, QR de AFIP, detalle de ítems). Se reutiliza el mismo componente de
datos de la orden, cambiando solo la plantilla de render según
`printFormat: "thermal-58" | "thermal-80" | "a4"`.

```tsx
interface PrintableInvoiceProps {
  order: OrderWithItems;
  invoice: Invoice; // incluye CAE y qrData ya generados por el módulo AFIP
  format: "thermal-58" | "thermal-80" | "a4";
}
```

El QR fiscal (`invoice.qrData`, ver `docs/afip.md`) se renderiza como
`<img src={qrDataUrl} />` generado client-side con una librería liviana
(`qrcode`) a partir de la URL que exige AFIP — no hace falta pedirlo al
backend en cada impresión, se genera una vez al confirmar la venta y se
guarda el string.
