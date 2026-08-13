import { ImageResponse } from "next/og";

export const alt = "Pereira Unida — Ayuda ciudadana en emergencia";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#1c1410",
          color: "#fff8f0",
          fontFamily: "serif",
        }}
      >
        <div style={{ display: "flex", height: 14, width: "100%" }}>
          <div style={{ flex: 1, background: "#f0c94c" }} />
          <div style={{ flex: 1, background: "#c41a1a" }} />
        </div>
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              width: 72,
              height: 48,
              borderRadius: 10,
              overflow: "hidden",
              marginBottom: 28,
              border: "2px solid rgba(255,248,240,0.55)",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
              <div style={{ flex: 1, background: "#f0c94c" }} />
              <div style={{ flex: 1, background: "#c41a1a" }} />
            </div>
          </div>
          <div style={{ fontSize: 72, fontWeight: 600, letterSpacing: -1.5 }}>Pereira Unida</div>
          <div style={{ fontSize: 28, marginTop: 14, opacity: 0.78, fontFamily: "sans-serif" }}>
            Ayuda ciudadana en emergencia
          </div>
        </div>
        <div style={{ display: "flex", height: 14, width: "100%" }}>
          <div style={{ flex: 1, background: "#f0c94c" }} />
          <div style={{ flex: 1, background: "#c41a1a" }} />
        </div>
      </div>
    ),
    { ...size }
  );
}
