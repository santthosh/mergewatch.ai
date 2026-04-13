import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "MergeWatch — AI-Powered PR Reviews";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          padding: "80px",
          background:
            "linear-gradient(135deg, #0b1020 0%, #111936 50%, #1a2550 100%)",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            fontSize: 36,
            color: "#7dd3fc",
            letterSpacing: "-0.02em",
            marginBottom: 20,
          }}
        >
          mergewatch.ai
        </div>
        <div
          style={{
            fontSize: 84,
            color: "#ffffff",
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: "-0.03em",
            maxWidth: 1000,
          }}
        >
          AI-Powered PR Reviews
        </div>
        <div
          style={{
            fontSize: 32,
            color: "#cbd5e1",
            marginTop: 28,
            maxWidth: 980,
            lineHeight: 1.3,
          }}
        >
          Bring your own model. Run in your cloud. Multi-agent code review for
          GitHub.
        </div>
      </div>
    ),
    size,
  );
}
