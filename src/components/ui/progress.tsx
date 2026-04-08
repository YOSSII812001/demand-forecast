"use client";

export function ProgressBar({
  value = 0,
  message,
}: {
  value: number;
  message?: string | null;
}) {
  const clamped = Math.min(Math.max(value, 0), 100);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{message || "処理中..."}</span>
        <span className="font-semibold text-copper">{clamped}%</span>
      </div>
      <div className="w-full bg-border rounded-full h-2.5 overflow-hidden">
        <div
          style={{ width: `${clamped}%` }}
          className="bg-copper h-full rounded-full transition-all duration-500 ease-out"
        />
      </div>
    </div>
  );
}
