interface PresenceDotProps {
  online: boolean;
  size?: "sm" | "md";
  className?: string;
}

/**
 * Telegram-style presence indicator.
 * Online: glowing green dot with subtle pulse.
 * Offline: muted gray dot, no glow.
 * No text label — visual only.
 */
export function PresenceDot({ online, size = "sm", className = "" }: PresenceDotProps) {
  const sizeCls = size === "sm" ? "size-2.5" : "size-3";
  if (online) {
    return (
      <span
        className={`inline-block rounded-full bg-success ${sizeCls} ${className}`}
        style={{
          boxShadow: "0 0 6px 1px color-mix(in oklab, var(--success) 70%, transparent)",
          animation: "pulse-glow 1.6s ease-in-out infinite",
        }}
        aria-label="Online"
      />
    );
  }
  return (
    <span
      className={`inline-block rounded-full bg-muted-foreground/40 ${sizeCls} ${className}`}
      aria-label="Offline"
    />
  );
}
