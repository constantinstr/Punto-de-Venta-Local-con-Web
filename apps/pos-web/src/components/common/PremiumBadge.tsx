"use client";

// Píldora "Premium" — mismo formato que las de src/components/settings/
// IntegrationCard.tsx y WooBadge() en (admin)/catalog/page.tsx, pero con los
// tokens de acento (bg-accent-muted/text-accent) en vez de un color fijo:
// esto marca una FUNCIÓN del plan pago, no un estado de sincronización.
export function PremiumBadge({ title }: { title?: string }) {
  return (
    <span
      title={title}
      className="rounded bg-accent-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent"
    >
      Premium
    </span>
  );
}
