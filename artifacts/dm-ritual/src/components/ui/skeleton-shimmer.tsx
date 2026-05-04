const STYLE_ID = "dm-shimmer-kf";

function injectStyle() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = `@keyframes dm-shimmer{0%{transform:translateX(-100%)}100%{transform:translateX(200%)}}`;
  document.head.appendChild(s);
}

function ShimmerRow({ width = "100%", height = "2rem" }: { width?: string; height?: string }) {
  injectStyle();
  return (
    <div style={{
      width, height, borderRadius: "0.5rem",
      background: "var(--muted)", overflow: "hidden", position: "relative", flexShrink: 0,
    }}>
      <div style={{
        position: "absolute", inset: 0, width: "50%",
        background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.06),transparent)",
        animation: "dm-shimmer 1.4s ease-in-out infinite",
      }} />
    </div>
  );
}

export function SkeletonRows({ rows = 5, height = "2rem" }: { rows?: number; height?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
      {Array.from({ length: rows }).map((_, i) => (
        <ShimmerRow key={i} height={height} />
      ))}
    </div>
  );
}

export function PageSkeleton({ rows = 7 }: { rows?: number }) {
  return (
    <div style={{ padding: "1.5rem 1rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      <SkeletonRows rows={rows} />
    </div>
  );
}

export function FullPageSkeleton() {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      minHeight: "100dvh", padding: "2rem",
    }}>
      <div style={{ width: "100%", maxWidth: "480px", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
        <SkeletonRows rows={6} />
      </div>
    </div>
  );
}
