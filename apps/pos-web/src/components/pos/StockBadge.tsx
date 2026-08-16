export function StockBadge({
  quantity,
  isUnlimited,
  lowThreshold = 5,
}: {
  quantity: number;
  isUnlimited: boolean;
  lowThreshold?: number;
}) {
  if (isUnlimited) {
    return (
      <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
        Sin límite
      </span>
    );
  }
  if (quantity <= 0) {
    return (
      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
        Sin stock
      </span>
    );
  }
  if (quantity <= lowThreshold) {
    return (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">
        {quantity} u.
      </span>
    );
  }
  return (
    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700 dark:bg-green-950 dark:text-green-300">
      {quantity} u.
    </span>
  );
}
