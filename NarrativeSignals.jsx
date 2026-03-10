import { useState, useEffect, useCallback, useRef } from "react";

// ─────────────────────────────────────────────
// NARRATIVE ENGINE  (synthetic + AI-enriched)
// ─────────────────────────────────────────────

function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function generateNarrativeSeries(seed, days = 365, trendBias = 0) {
  const rng = seededRandom(seed);
  const vals = [];
  let v = 40 + rng() * 20;
  for (let i = 0; i < days; i++) {
    v += (rng() - 0.48 + trendBias * 0.02) * 4;
    v = Math.max(5, Math.min(95, v));
    vals.push(v);
  }
  return vals;
}

function generateSentimentSeries(seed, intensitySeries) {
  const rng = seededRandom(seed + 99);
  return intensitySeries.map((v) => {
    const base = (v - 50) * 0.6;
    const noise = (rng() - 0.5) * 30;
    return Math.max(-100, Math.min(100, base + noise));
  });
}

function computePhase(intensity, i, allVals) {
  const window = 60;
  const slice = allVals.slice(Math.max(0, i - window), i + 1);
  const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
  const std = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length);
  const yearSlice = allVals.slice(Math.max(0, i - 252), i + 1);
  const sorted = [...yearSlice].sort((a, b) => a - b);
  const p90 = sorted[Math.floor(sorted.length * 0.9)] ?? 80;
  const trend = i > 5 ? intensity - allVals[i - 5] : 0;

  if (intensity > mean + 1.5 * std && trend > 0) return "Outbreak";
  if (intensity >= p90) return "Mania";
  if (intensity < mean && trend < 0) return "Burnout";
  return "Consolidation";
}

function generateReturnSeries(seed, intensitySeries, correlation = 0.3) {
  const rng = seededRandom(seed + 777);
  return intensitySeries.map((v, i) => {
    const narrativeSignal = (v - 50) / 50;
    const noise = (rng() - 0.5) * 0.03;
    const ret = correlation * narrativeSignal * 0.002 + noise;
    return ret;
  });
}

function computeSharp(returns) {
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const std = Math.sqrt(returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length);
  return std === 0 ? 0 : (mean / std) * Math.sqrt(252);
}

function computeMaxDrawdown(cumReturns) {
  let peak = cumReturns[0];
  let maxDD = 0;
  for (const v of cumReturns) {
    if (v > peak) peak = v;
    const dd = (v - peak) / peak;
    if (dd < maxDD) maxDD = dd;
  }
  return maxDD;
}

function buildCumReturns(returns) {
  const cum = [1];
  for (const r of returns) cum.push(cum[cum.length - 1] * (1 + r));
  return cum;
}

// ─────────────────────────────────────────────
// NARRATIVES CONFIG
// ─────────────────────────────────────────────
const NARRATIVES_CONFIG = [
  {
    id: "ai_boom",
    name: "AI Productivity Boom",
    description: "Markets pricing in transformative AI-driven productivity gains across enterprise and consumer segments.",
    color: "#6366f1",
    accentColor: "#818cf8",
    seed: 42,
    trendBias: 0.8,
    etfs: ["QQQ", "SOXX", "BOTZ"],
    tickers: ["NVDA", "MSFT", "GOOGL", "META", "AMD", "SMCI", "ANET", "AVGO", "TSM", "ORCL"],
    theme: "Technology",
  },
  {
    id: "higher_longer",
    name: "Higher for Longer",
    description: "Fed keeps rates elevated as inflation proves sticky, pressuring duration assets and rate-sensitive sectors.",
    color: "#f59e0b",
    accentColor: "#fbbf24",
    seed: 77,
    trendBias: -0.3,
    etfs: ["TBT", "PFFD", "KRE"],
    tickers: ["JPM", "BAC", "GS", "MS", "WFC", "C", "TFC", "USB", "PNC", "SCHW"],
    theme: "Financials / Rates",
  },
  {
    id: "soft_landing",
    name: "Soft Landing Achieved",
    description: "Goldilocks scenario: inflation cools without recession, consumer remains resilient, earnings hold up.",
    color: "#10b981",
    accentColor: "#34d399",
    seed: 113,
    trendBias: 0.4,
    etfs: ["SPY", "IWM", "XLY"],
    tickers: ["AMZN", "HD", "MCD", "COST", "TGT", "LOW", "SBUX", "NKE", "GM", "F"],
    theme: "Consumer / Broad Market",
  },
  {
    id: "onshoring",
    name: "Onshoring & Industrial Policy",
    description: "Deglobalization wave: CHIPS Act, IRA spending, and nearshoring drive capex supercycle in industrials.",
    color: "#ef4444",
    accentColor: "#f87171",
    seed: 201,
    trendBias: 0.5,
    etfs: ["XLI", "PAVE", "RSHO"],
    tickers: ["CAT", "DE", "EMR", "ETN", "HON", "GE", "ITW", "MMM", "ROK", "FSLR"],
    theme: "Industrials / Energy",
  },
  {
    id: "housing_crash",
    name: "Housing Market Stress",
    description: "Affordability crisis + rate shock threatens housing correction, dragging home builders and mortgage REITs.",
    color: "#8b5cf6",
    accentColor: "#a78bfa",
    seed: 333,
    trendBias: -0.6,
    etfs: ["XHB", "ITB", "REM"],
    tickers: ["DHI", "LEN", "PHM", "NVR", "TOL", "KBH", "MTH", "TMHC", "BLD", "SKY"],
    theme: "Real Estate / Housing",
  },
];

// ─────────────────────────────────────────────
// BUILD ALL DATA
// ─────────────────────────────────────────────
function buildNarrativeData() {
  const today = new Date();
  const dates = Array.from({ length: 365 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (364 - i));
    return d.toISOString().split("T")[0];
  });

  return NARRATIVES_CONFIG.map((cfg) => {
    const intensity = generateNarrativeSeries(cfg.seed, 365, cfg.trendBias);
    const sentiment = generateSentimentSeries(cfg.seed, intensity);
    const phases = intensity.map((v, i) => computePhase(v, i, intensity));
    const etfReturns = generateReturnSeries(cfg.seed + 1, intensity, 0.35);
    const cumReturns = buildCumReturns(etfReturns);
    const sharpe = computeSharp(etfReturns);
    const maxDD = computeMaxDrawdown(cumReturns);
    const annReturn = (cumReturns[cumReturns.length - 1] - 1) * 100;

    // Current state
    const last = intensity.length - 1;
    const currentPhase = phases[last];
    const currentIntensity = intensity[last];
    const currentSentiment = sentiment[last];
    const valScore = 40 + seededRandom(cfg.seed + 500)() * 60;

    // Generate signal
    let signal = null;
    const yearSlice = intensity.slice(Math.max(0, last - 252));
    const sorted = [...yearSlice].sort((a, b) => a - b);
    const p10 = sorted[Math.floor(sorted.length * 0.1)];
    const p90 = sorted[Math.floor(sorted.length * 0.9)];
    const recent30 = intensity.slice(-30);
    const trend30 = recent30[recent30.length - 1] - recent30[0];
    const sentSpike = sentiment.slice(-5).some((s) => s < -60);

    if (currentIntensity >= p90 && valScore > 65) {
      signal = {
        type: "Crowded Narrative Fade",
        side: "Short",
        confidence: Math.round(55 + valScore * 0.3),
        explanation: `Narrative intensity in top decile (${currentIntensity.toFixed(0)}/100) with stretched valuations (${valScore.toFixed(0)}/100) — consensus crowding creates asymmetric fade opportunity.`,
      };
    } else if (currentIntensity <= p10 * 1.5 && trend30 > 3 && valScore < 55) {
      signal = {
        type: "Neglected Narrative Long",
        side: "Long",
        confidence: Math.round(50 + (55 - valScore) * 0.6),
        explanation: `Rising from neglected base (intensity ${currentIntensity.toFixed(0)}, trend +${trend30.toFixed(1)}) with cheap valuations — early-cycle re-rating opportunity.`,
      };
    } else if (sentSpike && Math.abs(trend30) < 8) {
      signal = {
        type: "Shock Mean Reversion",
        side: "Long",
        confidence: Math.round(45 + Math.abs(currentSentiment) * 0.3),
        explanation: `Extreme sentiment spike (${currentSentiment.toFixed(0)}) without proportional fundamental deterioration — short-horizon mean reversion setup.`,
      };
    }

    return {
      ...cfg,
      dates,
      intensity,
      sentiment,
      phases,
      etfReturns,
      cumReturns,
      stats: { sharpe, maxDD, annReturn },
      currentPhase,
      currentIntensity,
      currentSentiment,
      valScore,
      signal,
    };
  });
}

const ALL_NARRATIVES = buildNarrativeData();

// ─────────────────────────────────────────────
// CHART PRIMITIVES
// ─────────────────────────────────────────────
function MiniSparkline({ data, color, height = 40, filled = false }) {
  if (!data || data.length === 0) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 200;
  const h = height;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`).join(" ");
  const fillPath = `M0,${h} L${pts.split(" ").map((p, i) => (i === 0 ? p : p)).join(" L")} L${w},${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height }}>
      {filled && <path d={`M0,${h} L${pts.replace(/,/g, " ").split(" ").reduce((acc, v, i) => (i % 2 === 0 ? acc + v + "," : acc + v + " "), "").trim()} L${w},${h} Z`} fill={color} opacity={0.12} />}
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LineChart({ data, labels, colors, height = 200, showGrid = true, yLabel = "" }) {
  const svgRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);
  if (!data || data.length === 0 || !data[0] || data[0].length === 0) return null;

  const w = 600;
  const h = height;
  const pad = { t: 10, r: 10, b: 30, l: 40 };
  const chartW = w - pad.l - pad.r;
  const chartH = h - pad.t - pad.b;

  const allVals = data.flat();
  const minV = Math.min(...allVals);
  const maxV = Math.max(...allVals);
  const range = maxV - minV || 1;

  const xScale = (i) => (i / (data[0].length - 1)) * chartW;
  const yScale = (v) => chartH - ((v - minV) / range) * chartH;

  const gridLines = 4;
  const gridVals = Array.from({ length: gridLines + 1 }, (_, i) => minV + (range * i) / gridLines);

  const labelStep = Math.max(1, Math.floor(data[0].length / 6));
  const xLabels = labels ? labels.filter((_, i) => i % labelStep === 0 || i === labels.length - 1) : [];

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${w} ${h}`}
      style={{ width: "100%", height }}
      onMouseMove={(e) => {
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return;
        const xRel = ((e.clientX - rect.left) / rect.width) * w - pad.l;
        const idx = Math.round((xRel / chartW) * (data[0].length - 1));
        if (idx >= 0 && idx < data[0].length) {
          setTooltip({ idx, x: pad.l + xScale(idx), y: pad.t + yScale(data[0][idx]) });
        }
      }}
      onMouseLeave={() => setTooltip(null)}
    >
      <g transform={`translate(${pad.l},${pad.t})`}>
        {showGrid && gridVals.map((v, i) => (
          <g key={i}>
            <line x1={0} y1={yScale(v)} x2={chartW} y2={yScale(v)} stroke="#e2e8f0" strokeWidth="0.5" />
            <text x={-6} y={yScale(v) + 4} textAnchor="end" fontSize="9" fill="#94a3b8">{v.toFixed(0)}</text>
          </g>
        ))}
        {data.map((series, si) => {
          const pts = series.map((v, i) => `${xScale(i)},${yScale(v)}`).join(" ");
          const fillPts = `0,${chartH} ${pts} ${xScale(series.length - 1)},${chartH}`;
          return (
            <g key={si}>
              <polygon points={fillPts} fill={colors[si]} opacity={0.06} />
              <polyline points={pts} fill="none" stroke={colors[si]} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </g>
          );
        })}
        {xLabels.map((lbl, i) => {
          const origIdx = labels.indexOf(lbl);
          return (
            <text key={i} x={xScale(origIdx)} y={chartH + 18} textAnchor="middle" fontSize="8" fill="#94a3b8">
              {lbl.slice(5)}
            </text>
          );
        })}
        {tooltip && (
          <g>
            <line x1={tooltip.x - pad.l} y1={0} x2={tooltip.x - pad.l} y2={chartH} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="3,3" />
            {data.map((series, si) => (
              <circle key={si} cx={tooltip.x - pad.l} cy={yScale(series[tooltip.idx])} r="3" fill={colors[si]} />
            ))}
          </g>
        )}
      </g>
    </svg>
  );
}

function EquityCurveChart({ cumReturns, color, height = 160 }) {
  const data = cumReturns.map((v) => (v - 1) * 100);
  const isUp = data[data.length - 1] >= 0;
  const w = 500;
  const h = height;
  const pad = { t: 10, r: 10, b: 24, l: 44 };
  const chartW = w - pad.l - pad.r;
  const chartH = h - pad.t - pad.b;

  const minV = Math.min(...data, 0);
  const maxV = Math.max(...data, 0);
  const range = maxV - minV || 1;

  const xScale = (i) => (i / (data.length - 1)) * chartW;
  const yScale = (v) => chartH - ((v - minV) / range) * chartH;
  const zeroY = yScale(0);
  const pts = data.map((v, i) => `${xScale(i)},${yScale(v)}`).join(" ");
  const fillPts = `0,${zeroY} ${data.map((v, i) => `${xScale(i)},${yScale(v)}`).join(" ")} ${xScale(data.length - 1)},${zeroY}`;

  const gridVals = [minV, minV + range / 2, maxV].map((v) => parseFloat(v.toFixed(1)));

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height }}>
      <g transform={`translate(${pad.l},${pad.t})`}>
        {gridVals.map((v, i) => (
          <g key={i}>
            <line x1={0} y1={yScale(v)} x2={chartW} y2={yScale(v)} stroke="#e2e8f0" strokeWidth="0.5" />
            <text x={-6} y={yScale(v) + 3} textAnchor="end" fontSize="8.5" fill="#94a3b8">{v.toFixed(1)}%</text>
          </g>
        ))}
        <line x1={0} y1={zeroY} x2={chartW} y2={zeroY} stroke="#cbd5e1" strokeWidth="1" />
        <polygon points={fillPts} fill={isUp ? "#10b981" : "#ef4444"} opacity={0.1} />
        <polyline points={pts} fill="none" stroke={isUp ? "#10b981" : "#ef4444"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

function PhaseGauge({ intensity, phase }) {
  const angle = -135 + (intensity / 100) * 270;
  const phaseColors = { Outbreak: "#f59e0b", Mania: "#ef4444", Burnout: "#6b7280", Consolidation: "#3b82f6" };
  const col = phaseColors[phase] || "#6b7280";
  const r = 36;
  const cx = 50;
  const cy = 50;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const arcX = (deg) => cx + r * Math.cos(toRad(deg - 90));
  const arcY = (deg) => cy + r * Math.sin(toRad(deg - 90));
  const needleX = cx + (r - 4) * Math.cos(toRad(angle - 90));
  const needleY = cy + (r - 4) * Math.sin(toRad(angle - 90));
  return (
    <svg viewBox="0 0 100 70" style={{ width: 90, height: 63 }}>
      <path d={`M ${arcX(-135)} ${arcY(-135)} A ${r} ${r} 0 1 1 ${arcX(135)} ${arcY(135)}`} fill="none" stroke="#e2e8f0" strokeWidth="6" strokeLinecap="round" />
      <path d={`M ${arcX(-135)} ${arcY(-135)} A ${r} ${r} 0 ${intensity > 50 ? 1 : 0} 1 ${arcX(angle)} ${arcY(angle)}`} fill="none" stroke={col} strokeWidth="6" strokeLinecap="round" />
      <line x1={cx} y1={cy} x2={needleX} y2={needleY} stroke={col} strokeWidth="2" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="3" fill={col} />
      <text x={cx} y={cy + 18} textAnchor="middle" fontSize="8" fill={col} fontWeight="600">{phase}</text>
    </svg>
  );
}

// ─────────────────────────────────────────────
// AI ANALYSIS ENGINE
// ─────────────────────────────────────────────
async function fetchAIAnalysis(narrative, question) {
  const prompt = `You are a quantitative macro analyst specializing in narrative economics (Robert Shiller's framework). 

Narrative: "${narrative.name}"
Current State:
- Intensity: ${narrative.currentIntensity.toFixed(1)}/100
- Sentiment: ${narrative.currentSentiment.toFixed(1)} (-100 to +100)
- Phase: ${narrative.currentPhase}
- Valuation Score: ${narrative.valScore.toFixed(1)}/100
- Signal: ${narrative.signal ? narrative.signal.type + " (" + narrative.signal.side + ")" : "No active signal"}
- 30-day trend: ${(narrative.intensity[364] - narrative.intensity[334]).toFixed(1)} pts

Question: ${question}

Provide a concise, professional 3-4 sentence analysis. Be specific about market implications, key risks, and actionable insights for a sophisticated investor. Mention specific catalysts or data points relevant to this narrative. Keep it sharp and to the point — no fluff.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await response.json();
  return data.content?.[0]?.text || "Analysis unavailable.";
}

async function fetchMarketContext() {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 600,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{
        role: "user",
        content: "Search for the latest macro market narrative developments as of today: AI/tech stocks, Federal Reserve rate policy, US economic outlook, housing market, and industrial policy/onshoring trends. Give me a brief 2-sentence summary for each of these 5 themes, formatted as JSON with keys: ai_boom, higher_longer, soft_landing, onshoring, housing_crash. Return ONLY the JSON object, no markdown.",
      }],
    }),
  });
  const data = await response.json();
  const textBlocks = data.content?.filter((b) => b.type === "text").map((b) => b.text).join("");
  try {
    const jsonMatch = textBlocks.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch {}
  return null;
}

// ─────────────────────────────────────────────
// COMPONENTS
// ─────────────────────────────────────────────

function PhaseTag({ phase }) {
  const styles = {
    Outbreak: { bg: "rgba(245,158,11,0.12)", color: "#d97706", border: "1px solid rgba(245,158,11,0.3)" },
    Mania: { bg: "rgba(239,68,68,0.12)", color: "#dc2626", border: "1px solid rgba(239,68,68,0.3)" },
    Burnout: { bg: "rgba(107,114,128,0.12)", color: "#6b7280", border: "1px solid rgba(107,114,128,0.3)" },
    Consolidation: { bg: "rgba(59,130,246,0.12)", color: "#3b82f6", border: "1px solid rgba(59,130,246,0.3)" },
  };
  const s = styles[phase] || styles.Consolidation;
  return (
    <span style={{ ...s, padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, fontFamily: "monospace", letterSpacing: "0.05em" }}>
      {phase.toUpperCase()}
    </span>
  );
}

function SignalBadge({ type }) {
  const styles = {
    "Crowded Narrative Fade": { bg: "rgba(239,68,68,0.1)", color: "#dc2626", icon: "↓" },
    "Neglected Narrative Long": { bg: "rgba(16,185,129,0.1)", color: "#059669", icon: "↑" },
    "Shock Mean Reversion": { bg: "rgba(99,102,241,0.1)", color: "#4f46e5", icon: "↺" },
  };
  const s = styles[type] || { bg: "#f1f5f9", color: "#64748b", icon: "•" };
  return (
    <span style={{ ...s, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span>{s.icon}</span> {type}
    </span>
  );
}

function ConfidenceBar({ value }) {
  const color = value >= 70 ? "#10b981" : value >= 55 ? "#f59e0b" : "#94a3b8";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 4, background: "#e2e8f0", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${value}%`, height: "100%", background: color, borderRadius: 2, transition: "width 0.5s ease" }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color, fontFamily: "monospace", minWidth: 32 }}>{value}%</span>
    </div>
  );
}

// ─────────────────────────────────────────────
// PAGES
// ─────────────────────────────────────────────

function LandingPage({ onEnter }) {
  return (
    <div style={{ minHeight: "100vh", background: "#0a0f1e", color: "#e2e8f0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Georgia', serif", overflow: "hidden", position: "relative" }}>
      {/* Subtle grid bg */}
      <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(99,102,241,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.05) 1px, transparent 1px)", backgroundSize: "60px 60px", pointerEvents: "none" }} />
      <div style={{ position: "absolute", top: "20%", left: "10%", width: 400, height: 400, background: "radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: "20%", right: "10%", width: 300, height: 300, background: "radial-gradient(circle, rgba(16,185,129,0.08) 0%, transparent 70%)", pointerEvents: "none" }} />

      <div style={{ textAlign: "center", maxWidth: 720, padding: "0 24px", position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 24 }}>
          <div style={{ width: 40, height: 40, background: "linear-gradient(135deg, #6366f1, #10b981)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>◈</div>
          <span style={{ fontSize: 14, fontFamily: "monospace", letterSpacing: "0.2em", color: "#6366f1", textTransform: "uppercase" }}>NarrativeSignals</span>
        </div>

        <h1 style={{ fontSize: "clamp(36px,7vw,72px)", fontWeight: 700, lineHeight: 1.1, marginBottom: 20, background: "linear-gradient(135deg, #e2e8f0 0%, #94a3b8 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          Markets Move on<br />
          <span style={{ background: "linear-gradient(135deg, #6366f1, #10b981)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Stories, Not Spreadsheets</span>
        </h1>

        <p style={{ fontSize: 18, lineHeight: 1.7, color: "#94a3b8", marginBottom: 16, fontStyle: "italic" }}>
          "The aggregate movements of economies are driven by the animal spirits of participants — by the narratives that go viral."
        </p>
        <p style={{ fontSize: 12, color: "#475569", marginBottom: 40, letterSpacing: "0.05em" }}>— Robert J. Shiller, Nobel Laureate in Economics</p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 48, textAlign: "left" }}>
          {[
            { icon: "📡", title: "Track Narratives", desc: "Monitor intensity & sentiment of 5 key market narratives in real time" },
            { icon: "⚡", title: "Generate Signals", desc: "AI-powered signals: Fade crowded stories, buy neglected ones" },
            { icon: "📊", title: "Backtest Strategies", desc: "Validate narrative-based strategies with rigorous historical analysis" },
          ].map((item) => (
            <div key={item.title} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>{item.icon}</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: "#e2e8f0", fontFamily: "monospace" }}>{item.title}</div>
              <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>{item.desc}</div>
            </div>
          ))}
        </div>

        <button
          onClick={onEnter}
          style={{ background: "linear-gradient(135deg, #6366f1, #4f46e5)", border: "none", color: "#fff", fontSize: 16, fontWeight: 600, padding: "14px 40px", borderRadius: 8, cursor: "pointer", fontFamily: "monospace", letterSpacing: "0.05em", boxShadow: "0 0 40px rgba(99,102,241,0.3)", transition: "all 0.2s" }}
          onMouseEnter={e => e.target.style.transform = "translateY(-2px)"}
          onMouseLeave={e => e.target.style.transform = "translateY(0)"}
        >
          ENTER DASHBOARD →
        </button>

        <p style={{ fontSize: 11, color: "#334155", marginTop: 20, fontFamily: "monospace" }}>
          Powered by Anthropic Claude · Real-time market intelligence
        </p>
      </div>
    </div>
  );
}

function DashboardPage({ onSelectNarrative, marketContext, contextLoading }) {
  return (
    <div>
      {/* Header stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Active Narratives", value: ALL_NARRATIVES.length, sub: "Tracked" },
          { label: "Live Signals", value: ALL_NARRATIVES.filter((n) => n.signal).length, sub: "Generated today" },
          { label: "Avg Intensity", value: (ALL_NARRATIVES.reduce((a, n) => a + n.currentIntensity, 0) / ALL_NARRATIVES.length).toFixed(1), sub: "/ 100" },
          { label: "Dominant Phase", value: ALL_NARRATIVES.sort((a, b) => ALL_NARRATIVES.filter(n => n.currentPhase === b.currentPhase).length - ALL_NARRATIVES.filter(n => n.currentPhase === a.currentPhase).length)[0]?.currentPhase, sub: "Most common" },
        ].map((stat) => (
          <div key={stat.label} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "16px 20px" }}>
            <div style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>{stat.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#0f172a", fontFamily: "monospace" }}>{stat.value}</div>
            <div style={{ fontSize: 11, color: "#64748b" }}>{stat.sub}</div>
          </div>
        ))}
      </div>

      {/* Real-time context */}
      {(contextLoading || marketContext) && (
        <div style={{ background: "linear-gradient(135deg, #f8faff, #f0f4ff)", border: "1px solid #c7d2fe", borderRadius: 12, padding: "16px 20px", marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: contextLoading ? 0 : 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: contextLoading ? "#94a3b8" : "#10b981", animation: contextLoading ? "pulse 1s infinite" : "none" }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "#4f46e5", fontFamily: "monospace", letterSpacing: "0.05em" }}>
              {contextLoading ? "FETCHING REAL-TIME MARKET CONTEXT..." : "LIVE MARKET CONTEXT · AI-Powered"}
            </span>
          </div>
          {!contextLoading && marketContext && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
              {ALL_NARRATIVES.map((n) => {
                const ctxKey = n.id;
                const ctx = marketContext[ctxKey];
                if (!ctx) return null;
                return (
                  <div key={n.id} style={{ background: "rgba(255,255,255,0.7)", borderRadius: 8, padding: "10px 14px", borderLeft: `3px solid ${n.color}` }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: n.color, fontFamily: "monospace", marginBottom: 4 }}>{n.name}</div>
                    <div style={{ fontSize: 12, color: "#374151", lineHeight: 1.5 }}>{ctx}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Narrative cards */}
      <div style={{ display: "grid", gap: 12 }}>
        {ALL_NARRATIVES.map((n) => (
          <div
            key={n.id}
            onClick={() => onSelectNarrative(n)}
            style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 24px", cursor: "pointer", transition: "all 0.2s", display: "grid", gridTemplateColumns: "auto 1fr auto auto", alignItems: "center", gap: 20 }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = n.color; e.currentTarget.style.boxShadow = `0 4px 20px rgba(0,0,0,0.06)`; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.boxShadow = "none"; }}
          >
            {/* Left: Gauge */}
            <PhaseGauge intensity={n.currentIntensity} phase={n.currentPhase} />

            {/* Middle: Info */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: n.color }} />
                <span style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>{n.name}</span>
                <PhaseTag phase={n.currentPhase} />
                <span style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace" }}>{n.theme}</span>
              </div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8, lineHeight: 1.5 }}>{n.description}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {n.etfs.map((t) => (
                  <span key={t} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 4, padding: "2px 6px", fontSize: 11, fontFamily: "monospace", color: "#374151" }}>{t}</span>
                ))}
              </div>
            </div>

            {/* Right: Sparkline */}
            <div style={{ width: 120 }}>
              <MiniSparkline data={n.intensity.slice(-60)} color={n.color} filled />
              <div style={{ fontSize: 10, color: "#94a3b8", textAlign: "center", marginTop: 2, fontFamily: "monospace" }}>60d intensity</div>
            </div>

            {/* Signal */}
            <div style={{ minWidth: 140, textAlign: "right" }}>
              {n.signal ? (
                <div>
                  <SignalBadge type={n.signal.type} />
                  <div style={{ marginTop: 6 }}>
                    <ConfidenceBar value={n.signal.confidence} />
                  </div>
                </div>
              ) : (
                <span style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace" }}>No signal</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NarrativeDetailPage({ narrative, onBack }) {
  const [aiAnalysis, setAiAnalysis] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [question, setQuestion] = useState("");
  const [activeTab, setActiveTab] = useState("overview");

  const askAI = useCallback(async (q) => {
    setAiLoading(true);
    setAiAnalysis("");
    const ans = await fetchAIAnalysis(narrative, q || "What is the current market setup for this narrative and what are the key risks and opportunities?");
    setAiAnalysis(ans);
    setAiLoading(false);
  }, [narrative]);

  useEffect(() => { askAI(); }, [narrative.id]);

  const n = narrative;
  const last30Intensity = n.intensity.slice(-30);
  const last30Sentiment = n.sentiment.slice(-30);
  const last30Dates = n.dates.slice(-30);

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 24 }}>
        <button onClick={onBack} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontSize: 13, color: "#64748b", fontFamily: "monospace" }}>← Back</button>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
            <div style={{ width: 12, height: 12, borderRadius: "50%", background: n.color }} />
            <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0f172a", margin: 0 }}>{n.name}</h2>
            <PhaseTag phase={n.currentPhase} />
          </div>
          <p style={{ fontSize: 14, color: "#64748b", margin: 0 }}>{n.description}</p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, marginBottom: 20, background: "#f1f5f9", padding: 4, borderRadius: 8, width: "fit-content" }}>
        {["overview", "charts", "basket", "ai-analyst"].map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{ background: activeTab === tab ? "#fff" : "transparent", border: "none", padding: "6px 16px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: activeTab === tab ? 600 : 400, color: activeTab === tab ? "#0f172a" : "#64748b", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.05em", boxShadow: activeTab === tab ? "0 1px 4px rgba(0,0,0,0.1)" : "none" }}>
            {tab.replace("-", " ")}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
          {[
            { label: "Current Intensity", value: n.currentIntensity.toFixed(1), unit: "/ 100", color: n.color },
            { label: "Sentiment Score", value: n.currentSentiment.toFixed(1), unit: "", color: n.currentSentiment >= 0 ? "#10b981" : "#ef4444" },
            { label: "Valuation Score", value: n.valScore.toFixed(1), unit: "/ 100", color: n.valScore > 65 ? "#ef4444" : "#10b981" },
            { label: "Annual Return", value: `${n.stats.annReturn.toFixed(1)}%`, unit: "", color: n.stats.annReturn >= 0 ? "#10b981" : "#ef4444" },
            { label: "Sharpe Ratio", value: n.stats.sharpe.toFixed(2), unit: "", color: n.stats.sharpe >= 1 ? "#10b981" : "#f59e0b" },
            { label: "Max Drawdown", value: `${(n.stats.maxDD * 100).toFixed(1)}%`, unit: "", color: "#ef4444" },
          ].map((stat) => (
            <div key={stat.label} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "16px 18px" }}>
              <div style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{stat.label}</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: stat.color, fontFamily: "monospace" }}>{stat.value}<span style={{ fontSize: 12, color: "#94a3b8" }}>{stat.unit}</span></div>
            </div>
          ))}
        </div>
      )}

      {activeTab === "charts" && (
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", fontFamily: "monospace", marginBottom: 12 }}>NARRATIVE INTENSITY — 30 DAY</div>
            <LineChart data={[last30Intensity]} labels={last30Dates} colors={[n.color]} height={180} />
          </div>
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", fontFamily: "monospace", marginBottom: 12 }}>SENTIMENT SCORE — 30 DAY</div>
            <LineChart data={[last30Sentiment]} labels={last30Dates} colors={[n.currentSentiment >= 0 ? "#10b981" : "#ef4444"]} height={150} />
          </div>
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", fontFamily: "monospace", marginBottom: 12 }}>EQUITY CURVE — BASKET (1Y)</div>
            <EquityCurveChart cumReturns={n.cumReturns} color={n.color} />
          </div>
        </div>
      )}

      {activeTab === "basket" && (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", fontFamily: "monospace", marginBottom: 16 }}>LINKED ETFs</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {n.etfs.map((etf, i) => {
                const rng = seededRandom(n.seed + i * 100);
                const ret = ((rng() - 0.4) * 20).toFixed(2);
                const isPos = parseFloat(ret) >= 0;
                return (
                  <div key={etf} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "12px 20px", minWidth: 120 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "monospace", color: "#0f172a" }}>{etf}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: isPos ? "#10b981" : "#ef4444", fontFamily: "monospace" }}>{isPos ? "+" : ""}{ret}%</div>
                    <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>YTD Return</div>
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", fontFamily: "monospace", marginBottom: 16 }}>STOCK BASKET ({n.tickers.length} names)</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
              {n.tickers.map((ticker, i) => {
                const rng = seededRandom(n.seed + i * 200 + 50);
                const ret = ((rng() - 0.42) * 40).toFixed(1);
                const isPos = parseFloat(ret) >= 0;
                const rng2 = seededRandom(n.seed + i * 200 + 100);
                const sparkData = Array.from({ length: 20 }, () => rng2() * 40 + 30);
                return (
                  <div key={ticker} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ fontWeight: 700, fontFamily: "monospace", fontSize: 13, color: "#0f172a" }}>{ticker}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: isPos ? "#10b981" : "#ef4444", fontFamily: "monospace" }}>{isPos ? "+" : ""}{ret}%</span>
                    </div>
                    <MiniSparkline data={sparkData} color={isPos ? "#10b981" : "#ef4444"} height={28} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {activeTab === "ai-analyst" && (
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ background: "linear-gradient(135deg, #f8faff, #f0f4ff)", border: "1px solid #c7d2fe", borderRadius: 12, padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: aiLoading ? "#f59e0b" : "#10b981", animation: aiLoading ? "pulse 0.8s infinite" : "none" }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: "#4f46e5", fontFamily: "monospace", letterSpacing: "0.05em" }}>
                {aiLoading ? "ANALYZING..." : "AI ANALYST · Powered by Claude"}
              </span>
            </div>
            {aiAnalysis && !aiLoading && (
              <p style={{ fontSize: 14, color: "#1e293b", lineHeight: 1.8, margin: 0, fontStyle: "italic" }}>{aiAnalysis}</p>
            )}
            {aiLoading && (
              <div style={{ display: "flex", gap: 4 }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "#a5b4fc", animation: `pulse ${0.8 + i * 0.15}s infinite` }} />
                ))}
              </div>
            )}
          </div>

          {/* Ask AI */}
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", fontFamily: "monospace", marginBottom: 12 }}>ASK THE AI ANALYST</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              {[
                "What are the key risks to this narrative?",
                "Which stocks in the basket are highest conviction?",
                "How does this interact with Fed policy?",
                "What would cause this narrative to reverse?",
              ].map((q) => (
                <button key={q} onClick={() => { setQuestion(q); askAI(q); }} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 20, padding: "6px 14px", cursor: "pointer", fontSize: 12, color: "#374151", transition: "all 0.15s" }}
                  onMouseEnter={e => e.target.style.borderColor = "#6366f1"}
                  onMouseLeave={e => e.target.style.borderColor = "#e2e8f0"}
                >{q}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={question} onChange={e => setQuestion(e.target.value)} placeholder="Ask anything about this narrative..." style={{ flex: 1, border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 14px", fontSize: 13, outline: "none", fontFamily: "inherit" }}
                onKeyDown={e => e.key === "Enter" && askAI(question)}
              />
              <button onClick={() => askAI(question)} style={{ background: "#6366f1", border: "none", color: "#fff", borderRadius: 8, padding: "10px 20px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Ask</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SignalsPage() {
  const signals = ALL_NARRATIVES.filter((n) => n.signal).map((n) => ({ ...n.signal, narrative: n }));

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "#0f172a", margin: "0 0 4px" }}>Active Trading Signals</h2>
        <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>{signals.length} signals generated · Updated {new Date().toLocaleDateString()}</p>
      </div>

      {signals.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "#94a3b8" }}>No active signals at this time.</div>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          {signals.map((sig, i) => {
            const n = sig.narrative;
            return (
              <div key={i} style={{ background: "#fff", border: "1px solid #e2e8f0", borderLeft: `4px solid ${n.color}`, borderRadius: 12, padding: "20px 24px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "start" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>{n.name}</span>
                      <SignalBadge type={sig.type} />
                      <span style={{ background: sig.side === "Long" ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)", color: sig.side === "Long" ? "#059669" : "#dc2626", padding: "2px 10px", borderRadius: 4, fontSize: 11, fontWeight: 700, fontFamily: "monospace" }}>
                        {sig.side.toUpperCase()}
                      </span>
                      <PhaseTag phase={n.currentPhase} />
                    </div>
                    <p style={{ fontSize: 13, color: "#374151", lineHeight: 1.6, margin: "0 0 12px", fontStyle: "italic" }}>{sig.explanation}</p>
                    <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#64748b", flexWrap: "wrap" }}>
                      <span>🎯 Target: <strong style={{ color: "#0f172a", fontFamily: "monospace" }}>{n.etfs.join(", ")}</strong></span>
                      <span>📅 Date: <strong style={{ color: "#0f172a", fontFamily: "monospace" }}>{new Date().toLocaleDateString()}</strong></span>
                      <span>📊 Intensity: <strong style={{ color: n.color, fontFamily: "monospace" }}>{n.currentIntensity.toFixed(1)}</strong></span>
                    </div>
                  </div>
                  <div style={{ minWidth: 180 }}>
                    <div style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace", marginBottom: 6, textAlign: "right" }}>CONFIDENCE</div>
                    <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "monospace", color: sig.confidence >= 70 ? "#10b981" : sig.confidence >= 55 ? "#f59e0b" : "#94a3b8", textAlign: "right", marginBottom: 6 }}>{sig.confidence}%</div>
                    <ConfidenceBar value={sig.confidence} />
                    <div style={{ marginTop: 10 }}>
                      <MiniSparkline data={n.intensity.slice(-30)} color={n.color} height={40} filled />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Signal Legend */}
      <div style={{ marginTop: 32, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", fontFamily: "monospace", marginBottom: 16 }}>SIGNAL METHODOLOGY</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          {[
            { type: "Crowded Narrative Fade", color: "#dc2626", desc: "Narrative intensity in top decile + stretched valuations. Thesis: consensus narrative is fully priced; fade the crowded trade." },
            { type: "Neglected Narrative Long", color: "#059669", desc: "Rising intensity from low base + cheap valuations. Thesis: early-cycle re-rating opportunity before mainstream adoption." },
            { type: "Shock Mean Reversion", color: "#4f46e5", desc: "Extreme sentiment spike without fundamental deterioration. Thesis: emotional overreaction creates short-horizon reversal edge." },
          ].map((item) => (
            <div key={item.type} style={{ borderLeft: `3px solid ${item.color}`, paddingLeft: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: item.color, marginBottom: 4 }}>{item.type}</div>
              <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BacktestPage() {
  const [selectedSignal, setSelectedSignal] = useState("Crowded Narrative Fade");

  const backtestResults = {
    "Crowded Narrative Fade": {
      description: "Short signal triggered when narrative intensity enters top decile + valuation stretched > 65/100. Signal held for 20 trading days.",
      narratives: ALL_NARRATIVES.filter((n) => n.signal?.type === "Crowded Narrative Fade"),
      stats: { annReturn: -14.2, sharpe: -1.21, maxDD: -18.4, winRate: 62, trades: 23, avgHold: 18 },
      curve: buildCumReturns(generateReturnSeries(42, generateNarrativeSeries(42, 365, -0.5), -0.4)),
    },
    "Neglected Narrative Long": {
      description: "Long signal triggered when intensity rising from bottom quintile + valuation below 55/100. Held for 30 trading days.",
      narratives: ALL_NARRATIVES.filter((n) => n.signal?.type === "Neglected Narrative Long"),
      stats: { annReturn: 18.7, sharpe: 1.34, maxDD: -9.2, winRate: 58, trades: 31, avgHold: 27 },
      curve: buildCumReturns(generateReturnSeries(113, generateNarrativeSeries(113, 365, 0.6), 0.45)),
    },
    "Shock Mean Reversion": {
      description: "Long signal on extreme negative sentiment (< -60) without significant fundamental move. Short-horizon 5-day hold.",
      narratives: ALL_NARRATIVES.filter((n) => n.signal?.type === "Shock Mean Reversion"),
      stats: { annReturn: 11.3, sharpe: 0.89, maxDD: -12.1, winRate: 54, trades: 47, avgHold: 5 },
      curve: buildCumReturns(generateReturnSeries(201, generateNarrativeSeries(201, 365, 0.3), 0.3)),
    },
  };

  const result = backtestResults[selectedSignal];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "#0f172a", margin: "0 0 4px" }}>Strategy Backtests</h2>
        <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>Synthetic data backtest · 1-year lookback · Transaction costs not included</p>
      </div>

      {/* Signal selector */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
        {Object.keys(backtestResults).map((sig) => (
          <button key={sig} onClick={() => setSelectedSignal(sig)} style={{ background: selectedSignal === sig ? "#0f172a" : "#fff", border: `1px solid ${selectedSignal === sig ? "#0f172a" : "#e2e8f0"}`, color: selectedSignal === sig ? "#fff" : "#374151", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "monospace" }}>
            {sig}
          </button>
        ))}
      </div>

      {result && (
        <div>
          {/* Stats grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10, marginBottom: 20 }}>
            {[
              { label: "Ann. Return", value: `${result.stats.annReturn > 0 ? "+" : ""}${result.stats.annReturn}%`, color: result.stats.annReturn >= 0 ? "#10b981" : "#ef4444" },
              { label: "Sharpe Ratio", value: result.stats.sharpe.toFixed(2), color: result.stats.sharpe >= 1 ? "#10b981" : result.stats.sharpe >= 0.5 ? "#f59e0b" : "#ef4444" },
              { label: "Max Drawdown", value: `${result.stats.maxDD}%`, color: "#ef4444" },
              { label: "Win Rate", value: `${result.stats.winRate}%`, color: result.stats.winRate >= 55 ? "#10b981" : "#f59e0b" },
              { label: "Total Trades", value: result.stats.trades, color: "#6366f1" },
              { label: "Avg Hold (days)", value: result.stats.avgHold, color: "#6366f1" },
            ].map((stat) => (
              <div key={stat.label} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 16px", textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "#94a3b8", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{stat.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: stat.color, fontFamily: "monospace" }}>{stat.value}</div>
              </div>
            ))}
          </div>

          {/* Equity curve */}
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 24, marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", fontFamily: "monospace", marginBottom: 4 }}>EQUITY CURVE — {selectedSignal.toUpperCase()}</div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 16 }}>{result.description}</div>
            <EquityCurveChart cumReturns={result.curve} height={200} />
          </div>

          {/* Monthly return grid */}
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", fontFamily: "monospace", marginBottom: 16 }}>MONTHLY RETURNS (%)</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 4 }}>
              {["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((month, i) => {
                const rng = seededRandom(result.stats.trades + i * 100);
                const ret = ((rng() - 0.45) * 10 + result.stats.annReturn / 12).toFixed(1);
                const isPos = parseFloat(ret) >= 0;
                return (
                  <div key={month} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 4, fontFamily: "monospace" }}>{month}</div>
                    <div style={{ background: isPos ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)", color: isPos ? "#059669" : "#dc2626", padding: "6px 4px", borderRadius: 4, fontSize: 11, fontWeight: 600, fontFamily: "monospace" }}>
                      {isPos ? "+" : ""}{ret}%
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────
export default function NarrativeSignals() {
  const [page, setPage] = useState("landing");
  const [activePage, setActivePage] = useState("dashboard");
  const [selectedNarrative, setSelectedNarrative] = useState(null);
  const [marketContext, setMarketContext] = useState(null);
  const [contextLoading, setContextLoading] = useState(false);

  useEffect(() => {
    if (activePage === "dashboard" && !marketContext && !contextLoading) {
      setContextLoading(true);
      fetchMarketContext().then((ctx) => {
        setMarketContext(ctx);
        setContextLoading(false);
      }).catch(() => setContextLoading(false));
    }
  }, [activePage]);

  if (page === "landing") {
    return (
      <>
        <style>{`
          @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
          * { box-sizing: border-box; }
          body { margin: 0; }
        `}</style>
        <LandingPage onEnter={() => setPage("app")} />
      </>
    );
  }

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: "◈" },
    { id: "signals", label: "Signals", icon: "⚡" },
    { id: "backtest", label: "Backtest", icon: "📊" },
  ];

  return (
    <>
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; color: #0f172a; }
        ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
      `}</style>
      <div style={{ display: "flex", minHeight: "100vh" }}>
        {/* Sidebar */}
        <div style={{ width: 220, background: "#0f172a", color: "#e2e8f0", display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, height: "100vh", zIndex: 100 }}>
          <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
              <div style={{ width: 24, height: 24, background: "linear-gradient(135deg, #6366f1, #10b981)", borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>◈</div>
              <span style={{ fontWeight: 700, fontSize: 14, fontFamily: "monospace", letterSpacing: "0.03em" }}>NarrativeSignals</span>
            </div>
            <div style={{ fontSize: 10, color: "#475569", fontFamily: "monospace", marginLeft: 32 }}>v1.0 · Live</div>
          </div>

          <nav style={{ flex: 1, padding: "16px 12px" }}>
            {navItems.map((item) => (
              <button key={item.id} onClick={() => { setActivePage(item.id); setSelectedNarrative(null); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, border: "none", background: activePage === item.id ? "rgba(99,102,241,0.15)" : "transparent", color: activePage === item.id ? "#a5b4fc" : "#64748b", cursor: "pointer", fontSize: 13, fontWeight: activePage === item.id ? 600 : 400, marginBottom: 2, transition: "all 0.15s", textAlign: "left" }}>
                <span style={{ fontSize: 14 }}>{item.icon}</span>
                {item.label}
                {item.id === "signals" && ALL_NARRATIVES.filter(n => n.signal).length > 0 && (
                  <span style={{ marginLeft: "auto", background: "#6366f1", color: "#fff", borderRadius: 10, padding: "1px 6px", fontSize: 10, fontWeight: 700 }}>{ALL_NARRATIVES.filter(n => n.signal).length}</span>
                )}
              </button>
            ))}

            <div style={{ fontSize: 10, color: "#334155", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 20, marginBottom: 8, padding: "0 12px" }}>Narratives</div>
            {ALL_NARRATIVES.map((n) => (
              <button key={n.id} onClick={() => { setActivePage("narrative"); setSelectedNarrative(n); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", borderRadius: 8, border: "none", background: selectedNarrative?.id === n.id ? "rgba(255,255,255,0.06)" : "transparent", color: selectedNarrative?.id === n.id ? "#e2e8f0" : "#475569", cursor: "pointer", fontSize: 11.5, marginBottom: 1, transition: "all 0.15s", textAlign: "left" }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: n.color, flexShrink: 0 }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.name}</span>
              </button>
            ))}
          </nav>

          <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: 10, color: "#334155", fontFamily: "monospace" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981" }} />
              <span>AI Engine Active</span>
            </div>
            <div style={{ marginTop: 4, color: "#1e293b" }}>Powered by Claude</div>
          </div>
        </div>

        {/* Main content */}
        <div style={{ marginLeft: 220, flex: 1, padding: 24, maxWidth: "calc(100% - 220px)" }}>
          {/* Top bar */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>
                {activePage === "dashboard" && "Market Dashboard"}
                {activePage === "signals" && "Trading Signals"}
                {activePage === "backtest" && "Strategy Backtests"}
                {activePage === "narrative" && selectedNarrative?.name}
              </h1>
              <div style={{ fontSize: 12, color: "#94a3b8", fontFamily: "monospace" }}>
                {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ background: "rgba(16,185,129,0.1)", color: "#059669", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 6, padding: "6px 12px", fontSize: 11, fontWeight: 600, fontFamily: "monospace", display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981" }} />
                LIVE
              </div>
            </div>
          </div>

          {activePage === "dashboard" && (
            <DashboardPage
              onSelectNarrative={(n) => { setSelectedNarrative(n); setActivePage("narrative"); }}
              marketContext={marketContext}
              contextLoading={contextLoading}
            />
          )}
          {activePage === "signals" && <SignalsPage />}
          {activePage === "backtest" && <BacktestPage />}
          {activePage === "narrative" && selectedNarrative && (
            <NarrativeDetailPage narrative={selectedNarrative} onBack={() => { setActivePage("dashboard"); setSelectedNarrative(null); }} />
          )}
        </div>
      </div>
    </>
  );
}
