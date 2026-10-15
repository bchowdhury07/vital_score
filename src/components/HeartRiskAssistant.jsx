import React, { useState, useEffect, useRef } from "react";

/**
 * Triage-Aware Heart Risk Assistant
 * ----------------------------------
 * Academic demo component comparing an SVM and a Bayesian Logistic Regression
 * model for heart disease risk classification, with uncertainty-aware triage.
 *
 * IMPORTANT — read before wiring up a real backend:
 * `computeRisk()` below is an illustrative, hand-written scoring formula
 * (clinically-plausible direction per feature, not a trained model). It is
 * the ONE function you need to replace with a real API call once your
 * FastAPI backend is ready — everything else (both views, the ring, the
 * posterior curve, the contribution chart, the triage logic) already
 * consumes the same { p, svmP, lower, upper, width, contribs } shape, so
 * swapping the data source should not require touching the JSX below.
 *
 * This component keeps all state in React (useState) rather than
 * localStorage, so it's safe to drop into any React project as-is. If you
 * want the theme/name to persist across reloads in your own app, wrap the
 * two setters (setTheme / setName) with your own localStorage calls.
 */

const FEATURE_META = [
  { key: "age", label: "Age", weight: (f) => 0.045 * (f.age - 50) },
  { key: "sex", label: "Sex", weight: (f) => 0.9 * f.sex },
  { key: "cp", label: "Chest Pain", weight: (f) => 0.55 * (f.cp === 3 ? 1 : f.cp === 1 ? 0.4 : 0.1) },
  { key: "trestbps", label: "Resting BP", weight: (f) => 0.018 * (f.trestbps - 120) },
  { key: "chol", label: "Cholesterol", weight: (f) => 0.009 * (f.chol - 200) },
  { key: "fbs", label: "Blood Sugar", weight: (f) => 0.4 * f.fbs },
  { key: "thalach", label: "Max HR", weight: (f) => -0.022 * (f.thalach - 150) },
  { key: "exang", label: "Angina", weight: (f) => 0.75 * f.exang },
  { key: "oldpeak", label: "ST Depress.", weight: (f) => 0.35 * f.oldpeak },
];

const sigmoid = (x) => 1 / (1 + Math.exp(-x));

function computeIllustrativeRisk(f) {
  const contribs = FEATURE_META.map((m) => ({ label: m.label, v: m.weight(f) }));
  const z = -6.2 + contribs.reduce((s, c) => s + c.v, 0);
  const p = sigmoid(z);
  const svmP = sigmoid(z * 1.25);
  const width = 0.1 + 0.42 * (1 - 4 * Math.pow(p - 0.5, 2));
  const lower = Math.max(0, p - width / 2);
  const upper = Math.min(1, p + width / 2);
  return { p, svmP, lower, upper, width, contribs };
}

async function computeRisk(f) {
  try {
    const res = await fetch("http://localhost:8000/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(f),
    });
    if (!res.ok) throw new Error("Backend not available");
    return { data: await res.json(), isIllustrative: false };
  } catch (err) {
    console.warn("Backend not available. Using illustrative scoring pending backend integration.");
    return { data: computeIllustrativeRisk(f), isIllustrative: true };
  }
}

const DEFAULT_FORM = {
  age: 54, sex: 1, cp: 3, trestbps: 130, chol: 240,
  fbs: 0, thalach: 150, exang: 0, oldpeak: 1.0,
};

/* ---------- small animated-number hook ---------- */
function useCountUp(target, active, duration = 900) {
  const [value, setValue] = useState(0);
  const frameRef = useRef(null);
  useEffect(() => {
    if (!active) return;
    const start = performance.now();
    function step(t) {
      const prog = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - prog, 3);
      setValue(Math.round(target * eased));
      if (prog < 1) frameRef.current = requestAnimationFrame(step);
    }
    frameRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target, active, duration]);
  return value;
}

/* ---------- posterior curve, as real SVG elements ---------- */
function PosteriorCurve({ p, lower, upper }) {
  const W = 400, H = 110, padB = 22, padT = 8;
  const xOf = (v) => 20 + v * (W - 40);
  const sigma = Math.max(0.03, (upper - lower) / 3.92);
  const pts = [];
  for (let i = 0; i <= 100; i++) {
    const x = i / 100;
    const y = Math.exp(-Math.pow(x - p, 2) / (2 * sigma * sigma));
    pts.push([xOf(x), H - padB - y * (H - padB - padT)]);
  }
  const path =
    `M20 ${H - padB}` +
    pts.map((pt) => ` L${pt[0].toFixed(1)} ${pt[1].toFixed(1)}`).join("") +
    ` L${xOf(1)} ${H - padB} Z`;
  const lowerX = xOf(lower), upperX = xOf(upper), peakX = xOf(p);

  return (
    <svg className="hra-curve" viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block", color: "var(--hra-text-mid)" }}>
      <defs>
        <linearGradient id="hraCurveGrad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#A80B29" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#A80B29" stopOpacity="0.06" />
        </linearGradient>
      </defs>
      <line x1="20" y1={H - padB} x2={W - 20} y2={H - padB} stroke="currentColor" strokeOpacity="0.25" />
      <rect x={lowerX} y={padT} width={Math.max(2, upperX - lowerX)} height={H - padB - padT} fill="#A80B29" opacity="0.08" />
      <path d={path} fill="url(#hraCurveGrad)" stroke="#A80B29" strokeWidth="2" />
      <line x1={peakX} y1={padT} x2={peakX} y2={H - padB} stroke="#A80B29" strokeWidth="1.5" strokeDasharray="3,3" />
      <text x="20" y={H - 6} fontSize="10" fill="currentColor" opacity="0.55">0%</text>
      <text x={W - 34} y={H - 6} fontSize="10" fill="currentColor" opacity="0.55">100%</text>
    </svg>
  );
}

function ContributionBar({ label, v, maxAbs }) {
  const pct = Math.min(50, (Math.abs(v) / maxAbs) * 50);
  const isUp = v >= 0;
  return (
    <div className="hra-contrib-row">
      <span className="hra-flabel">{label}</span>
      <div className="hra-contrib-track">
        <div className="hra-contrib-mid" />
        <div
          className={`hra-contrib-bar ${isUp ? "up" : "down"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function HeartRiskAssistant() {
  const [theme, setTheme] = useState("light");
  const [view, setView] = useState("patient");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [name, setName] = useState("");
  const [form, setForm] = useState(DEFAULT_FORM);
  const [result, setResult] = useState(null);
  const [isIllustrative, setIsIllustrative] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      setTheme("dark");
    }
  }, []);

  const hasResult = result !== null;
  const animatedRisk = useCountUp(result ? Math.round(result.p * 100) : 0, hasResult);

  function updateField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    const { data, isIllustrative: isIll } = await computeRisk(form);
    setResult(data);
    setIsIllustrative(isIll);
    setSubmitting(false);
  }

  function resetAll() {
    setResult(null);
    setForm(DEFAULT_FORM);
    setDrawerOpen(false);
    setIsIllustrative(false);
  }

  const pct = hasResult ? Math.round(result.p * 100) : 0;
  const svmPct = hasResult ? Math.round(result.svmP * 100) : 0;
  const lowerPct = hasResult ? Math.round(result.lower * 100) : 0;
  const upperPct = hasResult ? Math.round(result.upper * 100) : 0;
  const needsReview = hasResult && result.width > 0.3;
  const circumference = 452;
  const ringOffset = hasResult ? circumference - (animatedRisk / 100) * circumference : circumference;
  const maxAbsContrib = hasResult ? Math.max(0.4, ...result.contribs.map((c) => Math.abs(c.v))) : 0.4;

  const checklist = hasResult
    ? [
        needsReview
          ? "Book a follow-up with a clinician to review this result"
          : "Share this result at your next routine check-up",
        "Keep track of blood pressure and cholesterol over time",
        form.exang === 1
          ? "Mention exercise-induced chest discomfort to your doctor"
          : "Continue regular light-to-moderate exercise",
      ]
    : [];

  return (
    <div className="hra-root" data-theme={theme}>
      <style>{CSS}</style>

      <div className="hra-blob hra-blob1" />
      <div className="hra-blob hra-blob2" />

      {drawerOpen && <div className="hra-overlay show" onClick={() => setDrawerOpen(false)} />}
      <aside className={`hra-drawer ${drawerOpen ? "show" : ""}`} aria-hidden={!drawerOpen}>
        <h3>
          Settings
          <span className="hra-close-x" onClick={() => setDrawerOpen(false)}>✕</span>
        </h3>

        <div className="hra-drawer-section">
          <div className="hra-dlabel">Appearance</div>
          <div className="hra-theme-toggle-row">
            <button className={theme === "light" ? "active" : ""} onClick={() => setTheme("light")}>☀ Light</button>
            <button className={theme === "dark" ? "active" : ""} onClick={() => setTheme("dark")}>☾ Dark</button>
          </div>
        </div>

        <div className="hra-drawer-section">
          <div className="hra-dlabel">Your Name</div>
          <input
            type="text"
            className="hra-name-input"
            placeholder="e.g. Alex"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="hra-drawer-section">
          <div className="hra-dlabel">Data</div>
          <button className="hra-reset-btn" onClick={resetAll}>Clear saved assessment</button>
        </div>

        <div className="hra-drawer-section">
          <div className="hra-dlabel">About</div>
          <p className="hra-about-text">
            Triage-Aware Heart Risk Assistant — an academic demo comparing SVM and Bayesian
            Logistic Regression for heart disease risk classification, with uncertainty-aware
            triage. Not a validated clinical tool.
          </p>
        </div>
      </aside>

      <div className="hra-wrap">
        <header>
          <svg className="hra-logo" viewBox="0 0 48 48" fill="none" aria-hidden="true">
            <path d="M24 40c-1-.6-16-9.6-16-21.3C8 12.2 12.6 8 18 8c2.7 0 5.3 1.3 6.9 3.4C26.6 9.3 29.2 8 31.9 8c5.4 0 10 4.2 10 10.7C41.9 30.4 26.9 39.4 25.9 40c-.6.4-1.3.4-1.9 0Z" fill="#A80B29" />
            <path d="M11 24h5l2.4-5.5L22 29l3-9 2.3 4h8" stroke="#FFE4E8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
          <div>
            <h1>Triage-Aware Heart Risk Assistant</h1>
            <p className="hra-subtitle">Heart disease risk classification — SVM vs. Bayesian Logistic Regression</p>
          </div>
          <div className="hra-header-actions">
            <button className="hra-icon-btn" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Toggle theme">
              {theme === "dark" ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8Z" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" /></svg>
              )}
            </button>
            <button className="hra-avatar-btn" onClick={() => setDrawerOpen(true)} aria-label="Profile and settings">
              {(name.trim()[0] || "U").toUpperCase()}
            </button>
          </div>
        </header>

        <div className="hra-badge-row">
          <span className="hra-pill">SVM Classifier</span>
          <span className="hra-pill">Bayesian Logistic Regression</span>
          <span className="hra-pill">Uncertainty-Aware Triage</span>
        </div>

        <div className="hra-switcher" role="tablist" aria-label="View selector">
          <button role="tab" aria-pressed={view === "patient"} onClick={() => setView("patient")}>Patient View</button>
          <button role="tab" aria-pressed={view === "clinician"} onClick={() => setView("clinician")}>Clinician View</button>
          <div className="hra-indicator" style={{ transform: view === "clinician" ? "translateX(100%)" : "none" }} />
        </div>

        <form className="hra-glass-card" onSubmit={handleSubmit}>
          <h2>Patient Clinical Parameters</h2>
          <div className="hra-grid">
            <div className="hra-field">
              <label>Age (years)</label>
              <input type="number" min={18} max={100} value={form.age} onChange={(e) => updateField("age", +e.target.value)} required />
            </div>
            <div className="hra-field">
              <label>Sex</label>
              <select value={form.sex} onChange={(e) => updateField("sex", +e.target.value)}>
                <option value={1}>Male</option>
                <option value={0}>Female</option>
              </select>
            </div>
            <div className="hra-field">
              <label>Chest Pain Type</label>
              <select value={form.cp} onChange={(e) => updateField("cp", +e.target.value)}>
                <option value={0}>Typical angina</option>
                <option value={1}>Atypical angina</option>
                <option value={2}>Non-anginal pain</option>
                <option value={3}>Asymptomatic</option>
              </select>
            </div>
            <div className="hra-field">
              <label>Resting BP (mm Hg)</label>
              <input type="number" min={80} max={220} value={form.trestbps} onChange={(e) => updateField("trestbps", +e.target.value)} required />
            </div>
            <div className="hra-field">
              <label>Cholesterol (mg/dl)</label>
              <input type="number" min={100} max={600} value={form.chol} onChange={(e) => updateField("chol", +e.target.value)} required />
            </div>
            <div className="hra-field">
              <label>Fasting Blood Sugar &gt;120</label>
              <select value={form.fbs} onChange={(e) => updateField("fbs", +e.target.value)}>
                <option value={0}>No</option>
                <option value={1}>Yes</option>
              </select>
            </div>
            <div className="hra-field">
              <label>Max Heart Rate Achieved</label>
              <input type="number" min={60} max={220} value={form.thalach} onChange={(e) => updateField("thalach", +e.target.value)} required />
            </div>
            <div className="hra-field">
              <label>Exercise-Induced Angina</label>
              <select value={form.exang} onChange={(e) => updateField("exang", +e.target.value)}>
                <option value={0}>No</option>
                <option value={1}>Yes</option>
              </select>
            </div>
            <div className="hra-field">
              <label>ST Depression (oldpeak)</label>
              <input type="number" min={0} max={6} step={0.1} value={form.oldpeak} onChange={(e) => updateField("oldpeak", +e.target.value)} required />
              <div className="hra-hint">Exercise relative to rest</div>
            </div>
          </div>
          <button type="submit" className="hra-submit-btn" disabled={submitting}>
            {submitting ? "Assessing…" : "Assess Risk"}
          </button>
        </form>

        {hasResult && view === "patient" && (
          <section className="hra-glass-card hra-results show" aria-live="polite">
            {isIllustrative && (
              <div style={{ backgroundColor: "rgba(184, 134, 11, 0.16)", color: "var(--hra-warn)", padding: "10px", borderRadius: "8px", marginBottom: "16px", fontSize: "13px", fontWeight: "600", textAlign: "center", border: "1px solid var(--hra-warn)" }}>
                ⚠️ Backend not reachable. Scoring shown below is illustrative pending backend integration.
              </div>
            )}
            <div className="hra-p-hero">
              <div className="hra-ring-wrap">
                <svg viewBox="0 0 170 170" width="170" height="170" style={{ transform: "rotate(-90deg)" }}>
                  <defs>
                    <linearGradient id="hraRingGrad" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#1F7A4D" />
                      <stop offset="50%" stopColor="#B8860B" />
                      <stop offset="100%" stopColor="#A80B29" />
                    </linearGradient>
                  </defs>
                  <circle className="hra-ring-bg" cx="85" cy="85" r="72" />
                  <circle
                    className="hra-ring-fill"
                    cx="85" cy="85" r="72"
                    stroke="url(#hraRingGrad)"
                    strokeDasharray={circumference}
                    strokeDashoffset={ringOffset}
                  />
                </svg>
                <div className="hra-ring-num">
                  <span className="n">{animatedRisk}</span>
                  <span className="l">% estimated risk</span>
                </div>
              </div>
              <span className={`hra-conf-badge ${needsReview ? "review" : "confident"}`}>
                <span className="dot" />
                <span>{needsReview ? "Uncertain — recommend follow-up" : "Confident estimate"}</span>
              </span>
            </div>
            <p className="hra-plain-msg">
              {needsReview
                ? `Your result suggests ${pct}% estimated risk, but the model isn't highly confident here (range ${lowerPct}–${upperPct}%). This is exactly the kind of result worth discussing with a doctor rather than relying on the number alone.`
                : `Your result suggests ${pct}% estimated risk, and the model is fairly confident in this estimate (narrow range: ${lowerPct}–${upperPct}%). As always, discuss any heart-health concerns with a qualified clinician.`}
            </p>
            <ul className="hra-checklist">
              {checklist.map((t, i) => (
                <li key={i}><span className="ico">✓</span>{t}</li>
              ))}
            </ul>
          </section>
        )}

        {hasResult && view === "clinician" && (
          <section className="hra-results show" aria-live="polite">
            {isIllustrative && (
              <div style={{ backgroundColor: "rgba(184, 134, 11, 0.16)", color: "var(--hra-warn)", padding: "10px", borderRadius: "8px", marginBottom: "16px", fontSize: "13px", fontWeight: "600", textAlign: "center", border: "1px solid var(--hra-warn)" }}>
                ⚠️ Backend not reachable. Scoring shown below is illustrative pending backend integration.
              </div>
            )}
            <div className="hra-glass-card" style={{ marginBottom: 14 }}>
              <h2>Model Output Dashboard</h2>
              <div className="hra-clin-dash">
                <div className="hra-mini-stat">
                  <div className="lbl">SVM Estimate</div>
                  <div className="val">{svmPct}%</div>
                  <div className="sub">RBF kernel, Platt-scaled</div>
                </div>
                <div className="hra-mini-stat">
                  <div className="lbl">Bayesian Estimate</div>
                  <div className="val">{pct}%</div>
                  <div className="sub">Posterior mean</div>
                </div>
                <div className="hra-mini-stat">
                  <div className="lbl">Credible Interval</div>
                  <div className="val" style={{ fontSize: 15 }}>{lowerPct}–{upperPct}%</div>
                  <div className="sub">95% CI width</div>
                </div>
              </div>
            </div>

            <div className="hra-curve-wrap">
              <div className="ctitle">Posterior Probability Distribution</div>
              <PosteriorCurve p={result.p} lower={result.lower} upper={result.upper} />
            </div>

            <div className="hra-contrib-wrap">
              <div className="ctitle">Feature Contribution to Risk Score</div>
              {result.contribs.map((c) => (
                <ContributionBar key={c.label} label={c.label} v={c.v} maxAbs={maxAbsContrib} />
              ))}
            </div>

            <div className="hra-config-grid">
              <div className="hra-config-card">
                <div className="ctitle">SVM Configuration</div>
                <div className="crow"><span>Kernel</span><b>RBF</b></div>
                <div className="crow"><span>C (regularization)</span><b>1.0</b></div>
                <div className="crow"><span>Gamma</span><b>scale</b></div>
                <div className="crow"><span>Confidence method</span><b>Platt scaling</b></div>
              </div>
              <div className="hra-config-card">
                <div className="ctitle">Bayesian LR Configuration</div>
                <div className="crow"><span>Inference</span><b>MCMC (NUTS)</b></div>
                <div className="crow"><span>Chains</span><b>4</b></div>
                <div className="crow"><span>Draws / chain</span><b>2000</b></div>
                <div className="crow"><span>Prior</span><b>Normal(0, 2)</b></div>
              </div>
            </div>

            <div className="hra-triage-note">
              <span>▲</span>
              <span>
                <strong>{needsReview ? "Flagged for review" : "High-confidence case"}</strong>
                <br />
                {needsReview
                  ? `Credible interval width (${Math.round(result.width * 100)}pp) exceeds the calibration threshold — this case sits near the decision boundary, which historically correlates with higher error rates. Recommend manual review.`
                  : `Credible interval width (${Math.round(result.width * 100)}pp) is within the confident range — this estimate sits away from the decision boundary.`}
              </span>
            </div>
          </section>
        )}

        {!hasResult && (
          <p style={{ textAlign: "center", color: "var(--hra-text-muted)", fontSize: 13.5 }}>
            Fill in the form and tap Assess Risk to see your result.
          </p>
        )}

        <p className="hra-disclaimer">
          Academic project demo — results are computed with illustrative scoring logic for
          coursework purposes and are <strong>not</strong> a validated clinical tool. Model
          configuration values shown are reference settings, not measured training results.
          Not for real diagnostic use.
        </p>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  All styling lives in this one template string so the component stays  */
/*  a true single-file drop-in — no Tailwind config or external CSS file   */
/*  required. Safe to split into a .css file in your own project if you   */
/*  prefer; class names are namespaced with "hra-" to avoid collisions.    */
/* ---------------------------------------------------------------------- */
const CSS = `
.hra-root{
  --hra-maroon:#87001A; --hra-maroon-mid:#A80B29; --hra-accent:#C24258;
  --hra-bg1:#FFE4E8; --hra-bg2:#FFD1DA; --hra-bg3:#FFC0CC;
  --hra-glass:rgba(255,255,255,.55); --hra-glass-strong:rgba(255,255,255,.72);
  --hra-glass-border:rgba(255,255,255,.65);
  --hra-card2:rgba(255,241,243,.65);
  --hra-text:#4A0012; --hra-text-mid:#7A2234; --hra-text-muted:#A9697A;
  --hra-good:#1F7A4D; --hra-warn:#B8860B; --hra-bad:#A80B29;
  --hra-shadow:0 10px 34px -14px rgba(135,0,26,.35);
  --hra-radius:20px; --hra-mono:ui-monospace,monospace;
  position:relative; overflow-x:hidden; min-height:100%;
  background:linear-gradient(160deg,var(--hra-bg1),var(--hra-bg2) 55%,var(--hra-bg3));
  color:var(--hra-text); font-family:'Inter',system-ui,-apple-system,sans-serif;
  transition:background .4s ease, color .3s ease;
}
.hra-root[data-theme="dark"]{
  --hra-bg1:#1A0609; --hra-bg2:#260A12; --hra-bg3:#30101A;
  --hra-glass:rgba(42,11,18,.55); --hra-glass-strong:rgba(42,11,18,.75);
  --hra-glass-border:rgba(255,227,232,.12);
  --hra-card2:rgba(51,14,23,.6);
  --hra-text:#FFE3E8; --hra-text-mid:#E8A8B4; --hra-text-muted:#B9808E;
  --hra-shadow:0 10px 34px -14px rgba(0,0,0,.6);
}
.hra-root *{box-sizing:border-box;}
.hra-blob{position:fixed;border-radius:50%;filter:blur(60px);opacity:.5;z-index:0;pointer-events:none;}
.hra-blob1{width:340px;height:340px;background:var(--hra-maroon-mid);top:-120px;right:-100px;animation:hraFloat1 16s ease-in-out infinite;}
.hra-blob2{width:280px;height:280px;background:var(--hra-accent);bottom:-100px;left:-80px;animation:hraFloat2 20s ease-in-out infinite;}
@keyframes hraFloat1{0%,100%{transform:translate(0,0) scale(1);}50%{transform:translate(-30px,40px) scale(1.1);}}
@keyframes hraFloat2{0%,100%{transform:translate(0,0) scale(1);}50%{transform:translate(40px,-30px) scale(1.08);}}

.hra-wrap{max-width:960px;margin:0 auto;padding:24px 18px 60px;position:relative;z-index:1;}
.hra-root header{display:flex;align-items:center;gap:14px;margin-bottom:4px;}
.hra-logo{width:44px;height:44px;flex:0 0 auto;animation:hraBeat 2.4s ease-in-out infinite;}
@keyframes hraBeat{0%,100%{transform:scale(1);}15%{transform:scale(1.12);}30%{transform:scale(1);}45%{transform:scale(1.08);}60%{transform:scale(1);}}
.hra-root h1{font-weight:800;font-size:clamp(19px,4vw,26px);margin:0;color:var(--hra-maroon-mid);letter-spacing:-.01em;}
.hra-root[data-theme="dark"] h1{color:#FF8FA3;}
.hra-subtitle{color:var(--hra-text-muted);font-size:13.5px;margin:2px 0 0;}
.hra-header-actions{margin-left:auto;display:flex;align-items:center;gap:8px;}

.hra-icon-btn{width:42px;height:42px;border-radius:50%;border:1px solid var(--hra-glass-border);background:var(--hra-glass);backdrop-filter:blur(14px);display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--hra-maroon-mid);transition:transform .2s ease;box-shadow:var(--hra-shadow);}
.hra-icon-btn:hover{transform:translateY(-2px);}
.hra-icon-btn svg{width:19px;height:19px;}
.hra-avatar-btn{width:42px;height:42px;border-radius:50%;border:1px solid var(--hra-glass-border);cursor:pointer;background:linear-gradient(135deg,var(--hra-maroon),var(--hra-maroon-mid));color:#fff;font-weight:700;font-size:15px;display:flex;align-items:center;justify-content:center;box-shadow:var(--hra-shadow);transition:transform .2s ease;}
.hra-avatar-btn:hover{transform:translateY(-2px);}

.hra-badge-row{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0 20px;}
.hra-pill{font-size:11.5px;font-weight:600;color:var(--hra-maroon-mid);background:var(--hra-card2);border:1px solid var(--hra-glass-border);padding:5px 12px;border-radius:999px;backdrop-filter:blur(8px);}

.hra-switcher{display:flex;background:var(--hra-glass);backdrop-filter:blur(16px);border:1px solid var(--hra-glass-border);border-radius:999px;padding:4px;position:relative;margin-bottom:22px;max-width:380px;box-shadow:var(--hra-shadow);}
.hra-switcher button{flex:1;position:relative;z-index:1;border:0;background:transparent;cursor:pointer;font-weight:700;font-size:13.5px;color:var(--hra-text-mid);padding:11px 10px;border-radius:999px;transition:color .3s ease;min-height:44px;}
.hra-switcher button[aria-pressed="true"]{color:#fff;}
.hra-indicator{position:absolute;top:4px;bottom:4px;left:4px;width:calc(50% - 4px);background:linear-gradient(135deg,var(--hra-maroon),var(--hra-maroon-mid));border-radius:999px;transition:transform .32s cubic-bezier(.4,0,.2,1);box-shadow:0 4px 14px -4px rgba(168,11,41,.6);}

.hra-glass-card{background:var(--hra-glass);backdrop-filter:blur(18px);border:1px solid var(--hra-glass-border);border-radius:var(--hra-radius);box-shadow:var(--hra-shadow);padding:24px;margin-bottom:18px;}
.hra-glass-card h2{font-weight:700;font-size:15px;margin:0 0 16px;color:var(--hra-maroon-mid);}

.hra-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;}
@media (max-width:540px){.hra-grid{grid-template-columns:1fr;}}
.hra-field label{display:block;font-size:12px;font-weight:600;color:var(--hra-text-mid);margin-bottom:6px;}
.hra-field select,.hra-field input{width:100%;min-height:44px;padding:10px 12px;border-radius:10px;border:1.5px solid var(--hra-glass-border);background:var(--hra-card2);color:var(--hra-text);font-family:inherit;font-size:14.5px;}
.hra-field select:focus,.hra-field input:focus{outline:none;border-color:var(--hra-maroon-mid);box-shadow:0 0 0 3px rgba(168,11,41,.18);}
.hra-hint{font-size:10.5px;color:var(--hra-text-muted);margin-top:4px;}

.hra-submit-btn{width:100%;min-height:48px;margin-top:20px;border:0;border-radius:12px;cursor:pointer;background:linear-gradient(135deg,var(--hra-maroon),var(--hra-maroon-mid));color:#fff;font-weight:700;font-size:15px;box-shadow:0 10px 24px -8px rgba(168,11,41,.55);transition:transform .15s ease;}
.hra-submit-btn:active{transform:scale(.98);}
.hra-submit-btn:disabled{opacity:.65;cursor:not-allowed;}

.hra-results.show{animation:hraFadeIn .35s ease;}
@keyframes hraFadeIn{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:none;}}

.hra-p-hero{display:flex;flex-direction:column;align-items:center;text-align:center;padding:10px 6px 4px;}
.hra-ring-wrap{position:relative;width:170px;height:170px;margin-bottom:14px;}
.hra-ring-bg{fill:none;stroke:var(--hra-card2);stroke-width:12;}
.hra-ring-fill{fill:none;stroke-width:12;stroke-linecap:round;transition:stroke-dashoffset 1s cubic-bezier(.16,1,.3,1);}
.hra-ring-num{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;}
.hra-ring-num .n{font-weight:800;font-size:34px;color:var(--hra-maroon-mid);}
.hra-ring-num .l{font-size:11px;color:var(--hra-text-muted);font-weight:600;}
.hra-conf-badge{display:inline-flex;align-items:center;gap:7px;font-weight:700;font-size:13px;padding:7px 15px;border-radius:999px;margin-bottom:16px;}
.hra-conf-badge.confident{background:rgba(31,122,77,.14);color:var(--hra-good);}
.hra-conf-badge.review{background:rgba(184,134,11,.16);color:var(--hra-warn);}
.hra-conf-badge .dot{width:8px;height:8px;border-radius:50%;background:currentColor;animation:hraPulse 1.6s ease-in-out infinite;}
@keyframes hraPulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:.4;transform:scale(1.4);}}
.hra-plain-msg{background:var(--hra-card2);border-radius:14px;padding:16px 18px;font-size:14.5px;line-height:1.6;color:var(--hra-text);text-align:left;margin-bottom:14px;}
.hra-checklist{text-align:left;list-style:none;margin:0;padding:0;}
.hra-checklist li{display:flex;gap:10px;align-items:flex-start;font-size:13.5px;color:var(--hra-text-mid);padding:8px 0;border-top:1px solid var(--hra-glass-border);}
.hra-checklist li:first-child{border-top:none;}
.hra-checklist .ico{flex:0 0 auto;width:20px;height:20px;border-radius:50%;background:var(--hra-card2);display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--hra-maroon-mid);}

.hra-clin-dash{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:14px;}
@media (max-width:680px){.hra-clin-dash{grid-template-columns:1fr 1fr;}}
@media (max-width:420px){.hra-clin-dash{grid-template-columns:1fr;}}
.hra-mini-stat{background:var(--hra-card2);border:1px solid var(--hra-glass-border);border-radius:12px;padding:13px 14px;}
.hra-mini-stat .lbl{font-size:10.5px;font-weight:700;color:var(--hra-text-muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:5px;}
.hra-mini-stat .val{font-family:var(--hra-mono);font-weight:700;font-size:19px;color:var(--hra-maroon-mid);}
.hra-mini-stat .sub{font-size:10.5px;color:var(--hra-text-muted);margin-top:3px;}

.hra-curve-wrap,.hra-contrib-wrap{background:var(--hra-card2);border:1px solid var(--hra-glass-border);border-radius:14px;padding:16px;margin-bottom:14px;}
.hra-curve-wrap .ctitle,.hra-contrib-wrap .ctitle,.hra-config-card .ctitle{font-weight:700;font-size:12.5px;color:var(--hra-maroon-mid);margin-bottom:10px;text-transform:uppercase;letter-spacing:.03em;}

.hra-contrib-row{display:flex;align-items:center;gap:10px;margin-bottom:9px;font-size:12.5px;}
.hra-flabel{width:92px;flex:0 0 auto;color:var(--hra-text-mid);font-weight:600;}
.hra-contrib-track{flex:1;height:8px;background:rgba(0,0,0,.06);border-radius:999px;position:relative;overflow:hidden;}
.hra-root[data-theme="dark"] .hra-contrib-track{background:rgba(255,255,255,.08);}
.hra-contrib-bar{position:absolute;top:0;bottom:0;border-radius:999px;transition:width .7s cubic-bezier(.16,1,.3,1);}
.hra-contrib-bar.up{left:50%;background:var(--hra-bad);}
.hra-contrib-bar.down{right:50%;background:var(--hra-good);}
.hra-contrib-mid{position:absolute;left:50%;top:0;bottom:0;width:1px;background:rgba(0,0,0,.15);}

.hra-config-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;}
@media (max-width:560px){.hra-config-grid{grid-template-columns:1fr;}}
.hra-config-card{background:var(--hra-card2);border:1px solid var(--hra-glass-border);border-radius:14px;padding:15px 16px;}
.hra-config-card .crow{display:flex;justify-content:space-between;font-size:12.5px;color:var(--hra-text-mid);padding:3px 0;}
.hra-config-card .crow b{color:var(--hra-text);font-family:var(--hra-mono);}

.hra-triage-note{display:flex;gap:10px;align-items:flex-start;background:var(--hra-card2);border:1px solid var(--hra-glass-border);border-radius:14px;padding:14px 16px;font-size:13px;color:var(--hra-text-mid);line-height:1.55;}
.hra-triage-note strong{color:var(--hra-maroon-mid);}

.hra-disclaimer{font-size:11px;color:var(--hra-text-muted);text-align:center;line-height:1.6;margin-top:26px;padding-top:16px;border-top:1px solid var(--hra-glass-border);}

.hra-overlay{position:fixed;inset:0;background:rgba(20,2,5,.4);backdrop-filter:blur(2px);opacity:0;pointer-events:none;transition:opacity .25s ease;z-index:10;}
.hra-overlay.show{opacity:1;pointer-events:auto;}
.hra-drawer{position:fixed;top:0;right:0;bottom:0;width:320px;max-width:88vw;z-index:11;background:var(--hra-glass-strong);backdrop-filter:blur(24px);border-left:1px solid var(--hra-glass-border);box-shadow:-20px 0 50px -20px rgba(0,0,0,.4);transform:translateX(100%);transition:transform .32s cubic-bezier(.16,1,.3,1);padding:22px 20px;overflow-y:auto;color:var(--hra-text);}
.hra-drawer.show{transform:translateX(0);}
.hra-drawer h3{font-size:17px;color:var(--hra-maroon-mid);margin:0 0 18px;display:flex;justify-content:space-between;align-items:center;}
.hra-close-x{cursor:pointer;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--hra-card2);border:1px solid var(--hra-glass-border);}
.hra-drawer-section{margin-bottom:22px;}
.hra-dlabel{font-size:11px;font-weight:700;color:var(--hra-text-muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:10px;}
.hra-theme-toggle-row{display:flex;background:var(--hra-card2);border-radius:12px;padding:4px;gap:4px;}
.hra-theme-toggle-row button{flex:1;border:0;background:transparent;padding:10px 8px;border-radius:9px;cursor:pointer;font-weight:600;font-size:12.5px;color:var(--hra-text-mid);min-height:44px;}
.hra-theme-toggle-row button.active{background:linear-gradient(135deg,var(--hra-maroon),var(--hra-maroon-mid));color:#fff;}
.hra-name-input{width:100%;min-height:44px;padding:10px 12px;border-radius:10px;border:1.5px solid var(--hra-glass-border);background:var(--hra-card2);color:var(--hra-text);font-family:inherit;font-size:14px;}
.hra-reset-btn{width:100%;min-height:44px;border-radius:10px;border:1.5px solid var(--hra-glass-border);background:transparent;color:var(--hra-bad);font-weight:600;font-size:13px;cursor:pointer;margin-top:4px;}
.hra-about-text{font-size:12px;color:var(--hra-text-muted);line-height:1.6;}
`;
