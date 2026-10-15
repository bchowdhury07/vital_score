import React from "react";

/**
 * Posterior Probability Distribution (FR-17)
 * SVG Bell Curve illustrating posterior density and shaded 95% Credible Interval (HDI).
 */
export function PosteriorCurve({ p, lower, upper, isDark = true }) {
  const W = 420;
  const H = 130;
  const padB = 26;
  const padT = 12;
  const padSide = 24;

  const xOf = (v) => padSide + v * (W - 2 * padSide);
  const sigma = Math.max(0.03, (upper - lower) / 3.92);
  const pts = [];

  for (let i = 0; i <= 100; i++) {
    const x = i / 100;
    const y = Math.exp(-Math.pow(x - p, 2) / (2 * sigma * sigma));
    pts.push([xOf(x), H - padB - y * (H - padB - padT)]);
  }

  const path =
    `M${padSide} ${H - padB}` +
    pts.map((pt) => ` L${pt[0].toFixed(1)} ${pt[1].toFixed(1)}`).join("") +
    ` L${xOf(1)} ${H - padB} Z`;

  const lowerX = xOf(lower);
  const upperX = xOf(upper);
  const peakX = xOf(p);
  const intervalWidth = Math.max(3, upperX - lowerX);

  const axisColor = isDark ? "rgba(255, 255, 255, 0.25)" : "rgba(0, 0, 0, 0.2)";
  const textColor = isDark ? "#b89da2" : "#64748b";

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        role="img"
        aria-label={`Posterior distribution curve with mean at ${(p * 100).toFixed(1)}% and 95% Credible Interval from ${(lower * 100).toFixed(1)}% to ${(upper * 100).toFixed(1)}%`}
      >
        <defs>
          <linearGradient id="vsPosteriorGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e52e4d" stopOpacity={isDark ? "0.6" : "0.45"} />
            <stop offset="100%" stopColor="#8b0018" stopOpacity="0.05" />
          </linearGradient>
          <linearGradient id="vsIntervalGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e52e4d" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#e52e4d" stopOpacity="0.04" />
          </linearGradient>
        </defs>

        {/* Base axis line */}
        <line x1={padSide} y1={H - padB} x2={W - padSide} y2={H - padB} stroke={axisColor} strokeWidth="1.5" />

        {/* 95% Credible Interval Shaded Region */}
        <rect
          x={lowerX}
          y={padT}
          width={intervalWidth}
          height={H - padB - padT}
          fill="url(#vsIntervalGrad)"
          stroke="#e52e4d"
          strokeWidth="1"
          strokeDasharray="2,2"
          opacity="0.9"
        />

        {/* Distribution Curve Fill & Stroke */}
        <path d={path} fill="url(#vsPosteriorGrad)" stroke="#e52e4d" strokeWidth="2.5" />

        {/* Posterior MAP Peak Indicator */}
        <line x1={peakX} y1={padT} x2={peakX} y2={H - padB} stroke="#e52e4d" strokeWidth="2" strokeDasharray="4,3" />

        {/* Peak Dot */}
        <circle cx={peakX} cy={padT + 4} r="4" fill="#ffffff" stroke="#8b0018" strokeWidth="2" />

        {/* Axis Ticks and Labels */}
        <text x={padSide} y={H - 6} fontSize="10" fill={textColor} fontWeight="600" textAnchor="start">
          0%
        </text>
        <text x={xOf(0.5)} y={H - 6} fontSize="10" fill={textColor} fontWeight="600" textAnchor="middle">
          50%
        </text>
        <text x={W - padSide} y={H - 6} fontSize="10" fill={textColor} fontWeight="600" textAnchor="end">
          100%
        </text>

        {/* Credible bounds annotations */}
        <text x={lowerX} y={H - padB - 4} fontSize="9" fill="#e52e4d" fontWeight="700" textAnchor="middle">
          {(lower * 100).toFixed(0)}%
        </text>
        <text x={upperX} y={H - padB - 4} fontSize="9" fill="#e52e4d" fontWeight="700" textAnchor="middle">
          {(upper * 100).toFixed(0)}%
        </text>
        <text x={peakX} y={padT - 2} fontSize="9" fill="#e52e4d" fontWeight="800" textAnchor="middle">
          MAP {(p * 100).toFixed(1)}%
        </text>
      </svg>
    </div>
  );
}

/**
 * Feature Contribution Bar (FR-18)
 * Shows directional impact (increasing risk vs protective) of each feature.
 */
export function ContributionBar({ label, value, impact, maxAbs = 1.0, isDark = true }) {
  const normImpact = Math.min(1, Math.max(-1, impact / (maxAbs || 1)));
  const pctWidth = Math.min(48, Math.abs(normImpact) * 48);
  const isRiskIncreasing = impact >= 0;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "11px", margin: "6px 0" }}>
      <div style={{ width: "110px", fontWeight: "700", color: isDark ? "#ffffff" : "#111827", textAlign: "left", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {label}
        {value && <span style={{ display: "block", fontSize: "10px", fontWeight: "500", color: isDark ? "#b89da2" : "#64748b" }}>{value}</span>}
      </div>

      {/* Track centered at 50% */}
      <div
        style={{
          flex: 1,
          height: "18px",
          backgroundColor: isDark ? "#1e060d" : "#f1f5f9",
          borderRadius: "6px",
          position: "relative",
          display: "flex",
          alignItems: "center",
          border: `1px solid ${isDark ? "rgba(229, 46, 77, 0.2)" : "#e2e8f0"}`,
          overflow: "hidden",
        }}
      >
        {/* Center line (zero impact) */}
        <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: "1px", backgroundColor: isDark ? "rgba(255, 255, 255, 0.3)" : "rgba(0, 0, 0, 0.2)", zIndex: 2 }} />

        {/* Bar */}
        {isRiskIncreasing ? (
          <div
            style={{
              position: "absolute",
              left: "50%",
              width: `${pctWidth}%`,
              height: "10px",
              borderRadius: "0 4px 4px 0",
              background: "linear-gradient(90deg, #8b0018 0%, #e52e4d 100%)",
              transition: "width 0.4s ease-out",
            }}
          />
        ) : (
          <div
            style={{
              position: "absolute",
              right: "50%",
              width: `${pctWidth}%`,
              height: "10px",
              borderRadius: "4px 0 0 4px",
              background: "linear-gradient(270deg, #059669 0%, #10b981 100%)",
              transition: "width 0.4s ease-out",
            }}
          />
        )}
      </div>

      <div style={{ width: "45px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: "700", color: isRiskIncreasing ? "#e52e4d" : "#10b981" }}>
        {impact >= 0 ? `+${impact.toFixed(2)}` : impact.toFixed(2)}
      </div>
    </div>
  );
}

/**
 * Circular Patient Risk Hero Ring (FR-11, FR-12)
 */
export function PatientRiskHeroRing({ riskPct, isConfident, isDark = true }) {
  const radius = 64;
  const circumference = 2 * Math.PI * radius; // ~402
  const offset = circumference - (riskPct / 100) * circumference;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
      <div style={{ position: "relative", width: "160px", height: "160px", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg viewBox="0 0 160 160" width="160" height="160" style={{ transform: "rotate(-90deg)" }}>
          <defs>
            <linearGradient id="vsRingGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="50%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#e52e4d" />
            </linearGradient>
          </defs>
          <circle
            cx="80"
            cy="80"
            r={radius}
            fill="transparent"
            stroke={isDark ? "#25050e" : "#f1f5f9"}
            strokeWidth="12"
          />
          <circle
            cx="80"
            cy="80"
            r={radius}
            fill="transparent"
            stroke="url(#vsRingGrad)"
            strokeWidth="12"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.8s ease-out" }}
          />
        </svg>

        <div style={{ position: "absolute", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          <span style={{ fontSize: "32px", fontWeight: "900", color: isDark ? "#ffffff" : "#111827", fontFamily: "var(--font-mono)" }}>
            {riskPct}%
          </span>
          <span style={{ fontSize: "10px", fontWeight: "800", color: "#e52e4d", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Estimated Risk
          </span>
        </div>
      </div>

      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          padding: "5px 12px",
          borderRadius: "999px",
          fontSize: "11px",
          fontWeight: "800",
          backgroundColor: isConfident
            ? isDark ? "rgba(16, 185, 129, 0.15)" : "#ecfdf5"
            : isDark ? "rgba(245, 158, 11, 0.15)" : "#fffbeb",
          color: isConfident ? "#10b981" : "#f59e0b",
          border: `1px solid ${isConfident ? "rgba(16, 185, 129, 0.3)" : "rgba(245, 158, 11, 0.3)"}`,
        }}
      >
        <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: isConfident ? "#10b981" : "#f59e0b" }} />
        <span>{isConfident ? "Confident Estimate (Low Uncertainty)" : "Uncertain — Follow-up Recommended"}</span>
      </div>
    </div>
  );
}
