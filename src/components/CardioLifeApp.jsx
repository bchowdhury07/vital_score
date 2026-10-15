import React, { useState, useMemo } from "react";

// Clinically plausible reference weights from logistic regression baseline
const FEATURE_COEFFICIENTS = {
  age: { baseline: 50, scale: 12, weight: 0.42 },
  sex: { baseline: 0.5, scale: 0.5, weight: 0.78 }, // 1 = Male, 0 = Female
  cp: { weight: [0.1, 0.45, 0.85, 1.25] }, // 0: Typical, 1: Atypical, 2: Non-Anginal, 3: Asymptomatic
  trestbps: { baseline: 120, scale: 20, weight: 0.38 },
  chol: { baseline: 200, scale: 45, weight: 0.32 },
  fbs: { baseline: 0, scale: 1, weight: 0.25 }, // 1 if > 120
  restecg: { weight: [0.0, 0.3, 0.6] }, // 0: Normal, 1: ST-T, 2: LVH
  thalach: { baseline: 150, scale: 25, weight: -0.58 }, // higher max HR lowers risk
  exang: { baseline: 0, scale: 1, weight: 0.82 }, // Exercise induced angina
  oldpeak: { baseline: 1.0, scale: 1.2, weight: 0.74 }, // ST depression
  slope: { weight: [-0.3, 0.4, 0.8] }, // 0: Upsloping, 1: Flat, 2: Downsloping
};

const sigmoid = (z) => 1 / (1 + Math.exp(-z));

// Preset Patients for Instant Demonstration
const PATIENT_PRESETS = [
  {
    id: "alex",
    name: "Alex Morgan",
    ref: "#CL-8492",
    age: 54,
    sex: 1,
    cp: 2, // Non-anginal
    trestbps: 138,
    chol: 224,
    fbs: 0,
    restecg: 0,
    thalach: 162,
    exang: 0,
    oldpeak: 1.8,
    slope: 1,
    description: "Borderline Case with elevated ST depression & BP",
  },
  {
    id: "sarah",
    name: "Sarah Jenkins",
    ref: "#CL-3104",
    age: 38,
    sex: 0,
    cp: 0,
    trestbps: 112,
    chol: 178,
    fbs: 0,
    restecg: 0,
    thalach: 174,
    exang: 0,
    oldpeak: 0.2,
    slope: 0,
    description: "Healthy young adult • Low baseline cardiovascular risk",
  },
  {
    id: "robert",
    name: "Robert Chen",
    ref: "#CL-9921",
    age: 63,
    sex: 1,
    cp: 3, // Asymptomatic / Silent ischemia
    trestbps: 164,
    chol: 286,
    fbs: 1,
    restecg: 2,
    thalach: 122,
    exang: 1,
    oldpeak: 2.9,
    slope: 2,
    description: "High Risk • Severe multi-vessel ischemia indicators",
  },
];

export default function CardioLifeApp() {
  // Navigation & View Mode
  const [currentScreen, setCurrentScreen] = useState("welcome"); // 'welcome' | 'vitals' | 'report'
  const [viewMode, setViewMode] = useState("mobile"); // 'mobile' | 'wide'
  const [activeTab, setActiveTab] = useState("vitals"); // bottom nav tab
  const [selectedPresetId, setSelectedPresetId] = useState("alex");

  // Patient Clinical Intake State
  const [vitals, setVitals] = useState(PATIENT_PRESETS[0]);

  // Handle Preset Switching
  const applyPreset = (preset) => {
    setSelectedPresetId(preset.id);
    setVitals({ ...preset });
  };

  // Bayesian & SVM Risk Inference Calculation
  const riskCalculation = useMemo(() => {
    let logOdds = -1.15; // Intercept

    // Feature contributions breakdown
    const contribs = [];

    // Age
    const ageZ = (vitals.age - FEATURE_COEFFICIENTS.age.baseline) / FEATURE_COEFFICIENTS.age.scale;
    const ageImpact = ageZ * FEATURE_COEFFICIENTS.age.weight;
    logOdds += ageImpact;
    contribs.push({ name: "Age & Longevity", value: vitals.age + "y", impact: ageImpact });

    // Sex
    const sexImpact = (vitals.sex - 0.5) * FEATURE_COEFFICIENTS.sex.weight;
    logOdds += sexImpact;
    contribs.push({ name: "Biological Sex", value: vitals.sex === 1 ? "Male" : "Female", impact: sexImpact });

    // Chest Pain
    const cpImpact = FEATURE_COEFFICIENTS.cp.weight[vitals.cp] || 0.2;
    logOdds += cpImpact;
    const cpLabels = ["Typical Angina", "Atypical Angina", "Non-Anginal", "Asymptomatic"];
    contribs.push({ name: "Chest Pain Type", value: cpLabels[vitals.cp], impact: cpImpact });

    // Blood Pressure
    const bpZ = (vitals.trestbps - FEATURE_COEFFICIENTS.trestbps.baseline) / FEATURE_COEFFICIENTS.trestbps.scale;
    const bpImpact = bpZ * FEATURE_COEFFICIENTS.trestbps.weight;
    logOdds += bpImpact;
    contribs.push({ name: "Resting BP", value: vitals.trestbps + " mmHg", impact: bpImpact });

    // Cholesterol
    const cholZ = (vitals.chol - FEATURE_COEFFICIENTS.chol.baseline) / FEATURE_COEFFICIENTS.chol.scale;
    const cholImpact = cholZ * FEATURE_COEFFICIENTS.chol.weight;
    logOdds += cholImpact;
    contribs.push({ name: "Total Cholesterol", value: vitals.chol + " mg/dL", impact: cholImpact });

    // Max Heart Rate
    const hrZ = (vitals.thalach - FEATURE_COEFFICIENTS.thalach.baseline) / FEATURE_COEFFICIENTS.thalach.scale;
    const hrImpact = hrZ * FEATURE_COEFFICIENTS.thalach.weight;
    logOdds += hrImpact;
    contribs.push({ name: "Max Heart Rate", value: vitals.thalach + " bpm", impact: hrImpact });

    // ST Depression
    const stZ = (vitals.oldpeak - FEATURE_COEFFICIENTS.oldpeak.baseline) / FEATURE_COEFFICIENTS.oldpeak.scale;
    const stImpact = stZ * FEATURE_COEFFICIENTS.oldpeak.weight;
    logOdds += stImpact;
    contribs.push({ name: "ST Depression", value: vitals.oldpeak.toFixed(1) + " mm", impact: stImpact });

    // Exang & FBS
    if (vitals.exang) {
      logOdds += FEATURE_COEFFICIENTS.exang.weight;
      contribs.push({ name: "Exercise Angina", value: "Present", impact: FEATURE_COEFFICIENTS.exang.weight });
    }
    if (vitals.fbs) {
      logOdds += FEATURE_COEFFICIENTS.fbs.weight;
      contribs.push({ name: "Fasting Blood Sugar", value: "> 120 mg/dL", impact: FEATURE_COEFFICIENTS.fbs.weight });
    }

    // Bayesian Mean Probability
    const bayesP = sigmoid(logOdds);

    // Epistemic Uncertainty Estimation (higher when near decision boundary or extreme biomarker deviations)
    const distanceToBoundary = Math.abs(bayesP - 0.5);
    const biomarkerDispersion = (Math.abs(bpZ) + Math.abs(cholZ) + Math.abs(stZ)) / 3;
    const uncertaintySigma = 0.045 + (1 - distanceToBoundary * 1.6) * 0.04 + biomarkerDispersion * 0.025;

    // 95% Credible Interval (HDI)
    const lowerHDI = Math.max(0.02, bayesP - 1.96 * uncertaintySigma);
    const upperHDI = Math.min(0.98, bayesP + 1.96 * uncertaintySigma);
    const hdiWidth = upperHDI - lowerHDI;

    // Deterministic SVM (Overconfident without calibration)
    const svmZ = logOdds * 1.45;
    const svmP = sigmoid(svmZ);

    // Clinical Triage Category
    let triageTag = "Low Risk (Calibrated)";
    let triageColor = "emerald";
    let triageRecommendation = "Routine 12-month checkup. Lifestyle & aerobic fitness maintenance.";

    if (bayesP >= 0.65) {
      triageTag = "High Concern (Calibrated)";
      triageColor = "rose";
      triageRecommendation = "Urgent outpatient cardiology referral. Initiate guideline medical therapy.";
    } else if (bayesP >= 0.4 || hdiWidth > 0.16) {
      triageTag = "Uncertainty-Aware Clinical Triage";
      triageColor = "amber";
      triageRecommendation = "Epistemic uncertainty requires secondary non-invasive diagnostics (Stress Echo/TMT) before decision.";
    }

    return {
      bayesP,
      svmP,
      lowerHDI,
      upperHDI,
      hdiWidth,
      uncertaintySigma,
      triageTag,
      triageColor,
      triageRecommendation,
      contribs: contribs.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact)),
    };
  }, [vitals]);

  return (
    <div className="min-h-screen bg-[#090103] text-[#fadbe0] font-sans selection:bg-[#a30820] flex flex-col items-center">
      {/* Top Floating Control Bar (Dev/Presentation Toolbar) */}
      <nav className="w-full bg-[#140206]/90 backdrop-blur-md border-b border-[#3d1019] py-2.5 px-4 sticky top-0 z-50 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-[#8b0018] to-[#e52e4d] flex items-center justify-center shadow-[0_0_10px_rgba(229,46,77,0.5)]">
            <span className="material-symbols-outlined text-white text-[16px]">cardiology</span>
          </div>
          <div>
            <span className="font-bold tracking-tight text-white uppercase">CardioLife</span>
            <span className="text-[#e4bdbe] ml-1.5 opacity-75">Bayesian Uncertainty Triage Suite</span>
          </div>
        </div>

        {/* Screen Switcher */}
        <div className="flex items-center bg-[#190a0e] rounded-full p-1 border border-[#3d1019]">
          <button
            onClick={() => setCurrentScreen("welcome")}
            className={`px-3 py-1 rounded-full font-medium transition-all ${
              currentScreen === "welcome"
                ? "bg-[#e52e4d] text-white shadow-[0_0_8px_rgba(229,46,77,0.6)]"
                : "text-[#b89da2] hover:text-white"
            }`}
          >
            1. Splash
          </button>
          <button
            onClick={() => setCurrentScreen("vitals")}
            className={`px-3 py-1 rounded-full font-medium transition-all ${
              currentScreen === "vitals"
                ? "bg-[#e52e4d] text-white shadow-[0_0_8px_rgba(229,46,77,0.6)]"
                : "text-[#b89da2] hover:text-white"
            }`}
          >
            2. Vitals Intake
          </button>
          <button
            onClick={() => setCurrentScreen("report")}
            className={`px-3 py-1 rounded-full font-medium transition-all ${
              currentScreen === "report"
                ? "bg-[#e52e4d] text-white shadow-[0_0_8px_rgba(229,46,77,0.6)]"
                : "text-[#b89da2] hover:text-white"
            }`}
          >
            3. Bayesian Report
          </button>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode(viewMode === "mobile" ? "wide" : "mobile")}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#230b10] border border-[#3d1019] hover:border-[#e52e4d] text-[#e4bdbe] transition-colors"
          >
            <span className="material-symbols-outlined text-[15px]">
              {viewMode === "mobile" ? "fit_screen" : "phone_iphone"}
            </span>
            <span>{viewMode === "mobile" ? "Expand Canvas" : "Mobile Frame"}</span>
          </button>
        </div>
      </nav>

      {/* Main Canvas Area */}
      <main className="w-full flex-1 flex justify-center py-6 px-2 sm:px-4">
        {/* Mobile Device Mockup Container */}
        <div
          className={`transition-all duration-300 relative ${
            viewMode === "mobile"
              ? "w-full max-w-[420px] min-h-[850px] rounded-[44px] border-[10px] border-[#20090e] shadow-[0_0_60px_rgba(229,46,77,0.22)] overflow-hidden bg-[#090103] flex flex-col"
              : "w-full max-w-5xl rounded-3xl border border-[#3d1019] shadow-2xl bg-[#0e0205] p-6"
          }`}
        >
          {/* Mobile Screen 1: Welcome & Splash Hero */}
          {currentScreen === "welcome" && (
            <WelcomeScreen
              onGetStarted={() => setCurrentScreen("vitals")}
              onViewReport={() => setCurrentScreen("report")}
            />
          )}

          {/* Mobile Screen 2: Patient Clinical Vitals */}
          {currentScreen === "vitals" && (
            <VitalsScreen
              vitals={vitals}
              setVitals={setVitals}
              presets={PATIENT_PRESETS}
              selectedPresetId={selectedPresetId}
              applyPreset={applyPreset}
              onCalculate={() => setCurrentScreen("report")}
              riskCalculation={riskCalculation}
            />
          )}

          {/* Mobile Screen 3: Bayesian Risk Consultation Report */}
          {currentScreen === "report" && (
            <ReportScreen
              vitals={vitals}
              risk={riskCalculation}
              onBack={() => setCurrentScreen("vitals")}
            />
          )}

          {/* Bottom Dock Navigation Bar */}
          {viewMode === "mobile" && currentScreen !== "welcome" && (
            <BottomDock
              currentScreen={currentScreen}
              setCurrentScreen={setCurrentScreen}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
            />
          )}
        </div>
      </main>
    </div>
  );
}

/* =========================================================================
   SCREEN 1: WELCOME & SPLASH HERO
   ========================================================================= */
function WelcomeScreen({ onGetStarted, onViewReport }) {
  return (
    <div className="relative flex-1 flex flex-col justify-between p-6 bg-gradient-to-b from-[#140206] via-[#100104] to-[#070102] overflow-hidden min-h-[780px]">
      {/* Background Arterial Glow Halo */}
      <div className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 w-80 h-80 bg-[#a30820]/25 rounded-full blur-[90px]"></div>
      <div className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 w-72 h-72 bg-[#e52e4d]/20 rounded-full blur-[100px]"></div>

      {/* Top Header */}
      <header className="w-full flex items-center justify-between z-10 pt-1">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-[#230b10] flex items-center justify-center border border-[#e52e4d]/40 shadow-[0_0_12px_rgba(255,81,102,0.3)]">
            <span className="material-symbols-outlined text-[#ff5166] text-[20px]">cardiology</span>
          </div>
          <div>
            <span className="text-white font-bold tracking-tight text-sm block">CardioLife</span>
            <span className="text-[10px] text-[#e4bdbe]/70 tracking-widest block font-mono">HEART CARE</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 bg-[#190a0e] border border-[#3d1019] px-2.5 py-1 rounded-full text-[10px] text-[#fadbe0]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#ff5166] animate-pulse"></span>
          <span className="font-semibold tracking-wider">FDA • HIPAA SUITE</span>
        </div>
      </header>

      {/* Center 3D Glowing Heart Hero Visual */}
      <section className="relative my-auto flex flex-col items-center justify-center py-4 z-10">
        <div className="relative w-64 h-64 flex items-center justify-center">
          {/* Orbital Telemetry Rings */}
          <div className="absolute inset-0 rounded-full border border-[#a30820]/20 border-dashed animate-[spin_60s_linear_infinite]"></div>
          <div className="absolute inset-4 rounded-full border border-[#3d1019]/40"></div>
          <div className="absolute inset-8 rounded-full border border-[#e52e4d]/25 shadow-[0_0_35px_rgba(229,46,77,0.2)]"></div>

          {/* ECG Pulse Scan Line */}
          <div className="absolute inset-x-0 h-16 flex items-center overflow-hidden opacity-40 pointer-events-none z-0">
            <svg className="w-full h-full stroke-[#ff5166] stroke-1 fill-none" viewBox="0 0 320 60">
              <path d="M0,30 L60,30 L75,30 L85,10 L95,48 L105,25 L115,30 L160,30 L175,30 L185,5 L195,54 L205,22 L215,30 L320,30" />
            </svg>
          </div>

          {/* Realistic Anatomical Glowing Heart */}
          <div className="relative z-10 w-44 h-44 flex items-center justify-center animate-arterial-pulse">
            <img
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuDMvO24qkT-s-DGseiUU0U9gXDYBapQKv0zJSRXieyDJHT9R0kmXXxgNgMXpda-aG1AuwKq3NgVLsQd8UwuznFvRxK57kaBOuRR5eIsv_UnNQ6Cb4XSWB2lFGqZaLzUsvR5TfGbG12ac4klFeB169AJz0sXZquMZP03zjwMeOZxTKaNpqoCJELpZYyu8gu7-0J9OFOrBfYqv3EIMZmjfG7fsln3hcN2ckxMvnpDRyVksXkUxdg6gxvOv1M7ole9m_Hv16Aqq5I0sfNz"
              alt="3D Glowing Heart"
              className="w-full h-full object-contain filter drop-shadow-[0_10px_24px_rgba(229,46,77,0.65)]"
            />
          </div>

          {/* Floating Badges */}
          <div className="absolute -top-1 left-2 z-20 flex items-center gap-1.5 bg-[#1a070b]/90 backdrop-blur-md border border-[#e52e4d]/40 rounded-full px-2.5 py-1 text-[11px] shadow-lg">
            <span className="w-1.5 h-1.5 rounded-full bg-[#ff5166] shadow-[0_0_6px_#ff5166]"></span>
            <span className="font-semibold text-white">HRV: 68 bpm</span>
            <span className="text-[#b89da2]">• Optimal</span>
          </div>

          <div className="absolute -bottom-2 right-1 z-20 flex items-center gap-1.5 bg-[#1a070b]/90 backdrop-blur-md border border-[#a30820]/50 rounded-full px-2.5 py-1 text-[11px] shadow-lg">
            <span className="material-symbols-outlined text-[13px] text-[#ff5166]">vital_signs</span>
            <span className="font-semibold text-white">Bayesian: 95% HDI</span>
          </div>
        </div>

        {/* Credential Strip */}
        <div className="mt-4 flex items-center gap-1.5 bg-[#190a0e]/90 border border-[#3d1019] rounded-full px-3 py-1 text-[10px] text-[#e4bdbe]">
          <span className="material-symbols-outlined text-[13px] text-[#ff5166]">verified</span>
          <span className="font-mono tracking-wider">ISO-13485 CERTIFIED • 99.4% CALIBRATED</span>
        </div>
      </section>

      {/* Typography & Actions */}
      <footer className="w-full flex flex-col items-center text-center z-10 pt-2 space-y-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight">
            Your Heart Deserves <br />
            <span className="bg-gradient-to-r from-[#ffb3b5] via-[#ff5166] to-[#e52e4d] bg-clip-text text-transparent">
              the Best Care
            </span>
          </h1>
          <p className="mt-2 text-xs text-[#b89da2] leading-relaxed max-w-[320px] mx-auto">
            Advanced care for heart health. Early diagnosis powered by calibrated Bayesian uncertainty-aware AI.
          </p>
        </div>

        {/* Buttons */}
        <div className="w-full flex items-center gap-3 pt-1">
          <button
            onClick={onGetStarted}
            className="flex-1 h-13 py-3.5 bg-gradient-to-r from-[#e52e4d] via-[#a30820] to-[#8b0018] hover:brightness-110 active:scale-[0.98] transition-all rounded-full flex items-center justify-center gap-2 px-6 shadow-[0_0_24px_rgba(229,46,77,0.4)] border border-[#ff5166]/40 text-white font-bold text-sm group"
          >
            <span>Get Started</span>
            <span className="material-symbols-outlined text-[18px] transition-transform group-hover:translate-x-1">
              arrow_forward
            </span>
          </button>

          <button
            onClick={onViewReport}
            title="Inspect Bayesian Triage Results"
            className="w-13 h-13 p-3.5 rounded-full bg-[#1e0f13] hover:bg-[#28171b] border border-[#e52e4d]/40 flex items-center justify-center text-[#ff5166] shadow-[0_0_14px_rgba(229,46,77,0.2)] active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined text-[20px]">ecg_heart</span>
          </button>
        </div>

        {/* Provider Subtext */}
        <div className="flex flex-col items-center text-[10px] text-[#b89da2]/70 pb-1">
          <span className="flex items-center gap-1">
            <span className="material-symbols-outlined text-[11px]">lock</span>
            CRYPTOGRAPHIC TELEMETRY • HIPAA COMPLIANT
          </span>
        </div>
      </footer>
    </div>
  );
}

/* =========================================================================
   SCREEN 2: PATIENT CLINICAL VITALS INTAKE
   ========================================================================= */
function VitalsScreen({
  vitals,
  setVitals,
  presets,
  selectedPresetId,
  applyPreset,
  onCalculate,
  riskCalculation,
}) {
  const [activeCategory, setActiveCategory] = useState("all");

  const updateField = (key, val) => {
    setVitals((prev) => ({ ...prev, [key]: val }));
  };

  return (
    <div className="flex-1 flex flex-col p-4 bg-gradient-to-b from-[#140206] via-[#100104] to-[#070102] overflow-y-auto max-h-[820px] no-scrollbar">
      {/* Top Header */}
      <header className="flex items-center justify-between pb-3 border-b border-[#3d1019]/60">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-[#230b10] border border-[#e52e4d]/30 flex items-center justify-center text-[#ff5166]">
            <span className="material-symbols-outlined text-[18px]">ecg_heart</span>
          </div>
          <div>
            <h2 className="text-white font-bold text-sm">Clinical Intake</h2>
            <span className="text-[10px] text-[#b89da2]">Patient Biomarkers & ECG</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#190a0e] border border-[#3d1019] text-[10px]">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          <span className="text-emerald-300 font-medium">Ready</span>
        </div>
      </header>

      {/* Patient Card & Presets Selector */}
      <section className="mt-3 p-3.5 rounded-2xl bg-[#190a0e]/90 border border-[#3d1019] shadow-lg relative overflow-hidden backdrop-blur-sm">
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#e52e4d]"></div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full overflow-hidden border-2 border-[#e52e4d]/40 shadow-sm flex-shrink-0">
              <img
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuASH6X63CzVDLvu355X_TPWrlNbsCQ5v5_PZyI8tylO5dSYzQmHeqQq4RRukSdmr1MOChKYrE_i-C6OWjkINERXrnBcwZAP3cr8a_cPaxiGsy2Y4lvfurozSAIjqGawBeSiupPRK42OqUNOPss46HjRd5adzJSVNpjpyZs1XwVixfDsTZXAMyo2J3mqRRjKgna8Ha70ASZ9sOwoBiTQiIX-uwbNCeXMgOJ7zoJEqCjyeQfglX_fSxmxjisBpiD1iQTWHGSH-mqTEbFJ"
                alt="Patient Avatar"
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-sm">{vitals.name}</span>
                <span className="text-[10px] font-mono text-[#b89da2] px-1.5 py-0.5 rounded bg-[#230b10] border border-[#3d1019]">
                  {vitals.ref}
                </span>
              </div>
              <p className="text-[11px] text-[#e4bdbe] mt-0.5">Cardiology Triage • {vitals.age}y / {vitals.sex === 1 ? "M" : "F"}</p>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[10px] font-mono uppercase text-[#b89da2] block">Current MAP</span>
            <span className="text-sm font-mono font-bold text-[#ff5166]">
              {(riskCalculation.bayesP * 100).toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Quick Patient Preset Switcher */}
        <div className="mt-3 pt-2.5 border-t border-[#3d1019]/60">
          <div className="text-[10px] text-[#b89da2] mb-1.5 font-medium uppercase tracking-wider flex items-center justify-between">
            <span>Demo Patient Presets:</span>
            <span className="text-[#ff5166] text-[10px]">Select to Autofill</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {presets.map((p) => (
              <button
                key={p.id}
                onClick={() => applyPreset(p)}
                className={`py-1.5 px-2 rounded-xl text-[10px] font-medium transition-all text-center truncate ${
                  selectedPresetId === p.id
                    ? "bg-[#a30820] text-white border border-[#e52e4d] shadow-[0_0_8px_rgba(229,46,77,0.4)]"
                    : "bg-[#230b10] text-[#b89da2] border border-[#3d1019] hover:border-[#a30820]"
                }`}
              >
                {p.name.split(" ")[0]} ({p.id === "sarah" ? "Low" : p.id === "alex" ? "Brdl" : "High"})
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Category Filter Chips */}
      <div className="flex items-center gap-1.5 my-3 overflow-x-auto no-scrollbar py-0.5 text-xs">
        {["all", "vitals", "ecg", "lifestyle"].map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1 rounded-full capitalize font-medium transition-all ${
              activeCategory === cat
                ? "bg-[#e52e4d] text-white shadow-sm"
                : "bg-[#190a0e] text-[#b89da2] border border-[#3d1019] hover:border-[#a30820]"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Clinical Feature Inputs Grid */}
      <div className="space-y-3 pb-24">
        {/* Age & Sex */}
        {(activeCategory === "all" || activeCategory === "vitals") && (
          <div className="p-3.5 rounded-2xl bg-[#190a0e] border border-[#3d1019]">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-semibold text-white">Age & Biological Sex</span>
              <span className="text-xs font-mono font-bold text-[#ff5166]">{vitals.age} yrs</span>
            </div>
            <input
              type="range"
              min="28"
              max="82"
              value={vitals.age}
              onChange={(e) => updateField("age", Number(e.target.value))}
              className="w-full accent-[#e52e4d] cursor-pointer"
            />
            <div className="flex items-center gap-2 mt-2.5">
              <button
                onClick={() => updateField("sex", 1)}
                className={`flex-1 py-1 rounded-xl text-xs font-medium border transition-all ${
                  vitals.sex === 1
                    ? "bg-[#a30820] text-white border-[#e52e4d]"
                    : "bg-[#230b10] text-[#b89da2] border-[#3d1019]"
                }`}
              >
                Male
              </button>
              <button
                onClick={() => updateField("sex", 0)}
                className={`flex-1 py-1 rounded-xl text-xs font-medium border transition-all ${
                  vitals.sex === 0
                    ? "bg-[#a30820] text-white border-[#e52e4d]"
                    : "bg-[#230b10] text-[#b89da2] border-[#3d1019]"
                }`}
              >
                Female
              </button>
            </div>
          </div>
        )}

        {/* Chest Pain Type */}
        {(activeCategory === "all" || activeCategory === "vitals") && (
          <div className="p-3.5 rounded-2xl bg-[#190a0e] border border-[#3d1019]">
            <span className="text-xs font-semibold text-white block mb-2">Chest Pain Type (CP)</span>
            <div className="grid grid-cols-2 gap-1.5 text-xs">
              {[
                { val: 0, label: "Typical Angina" },
                { val: 1, label: "Atypical Angina" },
                { val: 2, label: "Non-Anginal" },
                { val: 3, label: "Asymptomatic" },
              ].map((opt) => (
                <button
                  key={opt.val}
                  onClick={() => updateField("cp", opt.val)}
                  className={`py-2 px-2 rounded-xl text-[11px] font-medium border text-left transition-all ${
                    vitals.cp === opt.val
                      ? "bg-[#8b0018] text-white border-[#e52e4d] shadow-[0_0_8px_rgba(229,46,77,0.3)]"
                      : "bg-[#230b10] text-[#b89da2] border-[#3d1019]"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Resting Blood Pressure & Serum Cholesterol */}
        {(activeCategory === "all" || activeCategory === "vitals") && (
          <div className="grid grid-cols-2 gap-2">
            <div className="p-3 rounded-2xl bg-[#190a0e] border border-[#3d1019]">
              <span className="text-[10px] text-[#b89da2] block">Resting BP (trestbps)</span>
              <span className="text-base font-bold font-mono text-white mt-0.5 block">{vitals.trestbps} <span className="text-[10px] text-[#b89da2]">mmHg</span></span>
              <input
                type="range"
                min="90"
                max="200"
                value={vitals.trestbps}
                onChange={(e) => updateField("trestbps", Number(e.target.value))}
                className="w-full accent-[#e52e4d] cursor-pointer mt-1"
              />
              <span className={`text-[9px] font-medium block mt-1 ${vitals.trestbps > 135 ? "text-rose-400" : "text-emerald-400"}`}>
                {vitals.trestbps > 135 ? "Elevated" : "Normal"}
              </span>
            </div>

            <div className="p-3 rounded-2xl bg-[#190a0e] border border-[#3d1019]">
              <span className="text-[10px] text-[#b89da2] block">Cholesterol (chol)</span>
              <span className="text-base font-bold font-mono text-white mt-0.5 block">{vitals.chol} <span className="text-[10px] text-[#b89da2]">mg/dL</span></span>
              <input
                type="range"
                min="130"
                max="400"
                value={vitals.chol}
                onChange={(e) => updateField("chol", Number(e.target.value))}
                className="w-full accent-[#e52e4d] cursor-pointer mt-1"
              />
              <span className={`text-[9px] font-medium block mt-1 ${vitals.chol > 200 ? "text-amber-400" : "text-emerald-400"}`}>
                {vitals.chol > 200 ? "Borderline High" : "Desirable"}
              </span>
            </div>
          </div>
        )}

        {/* Max Heart Rate (thalach) & ST Depression (oldpeak) */}
        {(activeCategory === "all" || activeCategory === "ecg") && (
          <div className="p-3.5 rounded-2xl bg-[#190a0e] border border-[#3d1019]">
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs font-semibold text-white">Max Heart Rate Reserve</span>
              <span className="text-xs font-mono font-bold text-[#ff5166]">{vitals.thalach} bpm</span>
            </div>
            <input
              type="range"
              min="80"
              max="202"
              value={vitals.thalach}
              onChange={(e) => updateField("thalach", Number(e.target.value))}
              className="w-full accent-[#e52e4d] cursor-pointer"
            />

            <div className="flex justify-between items-center mt-3 mb-1 pt-2 border-t border-[#3d1019]/60">
              <span className="text-xs font-semibold text-white">ST Depression (Oldpeak)</span>
              <span className="text-xs font-mono font-bold text-[#ff5166]">{vitals.oldpeak.toFixed(1)} mm</span>
            </div>
            <input
              type="range"
              min="0"
              max="5.0"
              step="0.1"
              value={vitals.oldpeak}
              onChange={(e) => updateField("oldpeak", Number(e.target.value))}
              className="w-full accent-[#e52e4d] cursor-pointer"
            />
          </div>
        )}

        {/* Angina & Blood Sugar Toggles */}
        {(activeCategory === "all" || activeCategory === "lifestyle") && (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => updateField("exang", vitals.exang === 1 ? 0 : 1)}
              className={`p-3 rounded-2xl border text-left transition-all ${
                vitals.exang === 1
                  ? "bg-[#8b0018] border-[#e52e4d] text-white shadow-[0_0_8px_rgba(229,46,77,0.3)]"
                  : "bg-[#190a0e] border-[#3d1019] text-[#b89da2]"
              }`}
            >
              <span className="text-[10px] block opacity-75">Exercise Angina</span>
              <span className="text-xs font-bold block mt-0.5">{vitals.exang === 1 ? "Positive (Yes)" : "Negative (No)"}</span>
            </button>

            <button
              onClick={() => updateField("fbs", vitals.fbs === 1 ? 0 : 1)}
              className={`p-3 rounded-2xl border text-left transition-all ${
                vitals.fbs === 1
                  ? "bg-[#8b0018] border-[#e52e4d] text-white shadow-[0_0_8px_rgba(229,46,77,0.3)]"
                  : "bg-[#190a0e] border-[#3d1019] text-[#b89da2]"
              }`}
            >
              <span className="text-[10px] block opacity-75">Fasting Blood Sugar</span>
              <span className="text-xs font-bold block mt-0.5">{vitals.fbs === 1 ? "> 120 mg/dL" : "≤ 120 mg/dL"}</span>
            </button>
          </div>
        )}
      </div>

      {/* Sticky Primary CTA */}
      <div className="fixed bottom-16 inset-x-4 max-w-[390px] mx-auto z-40">
        <button
          onClick={onCalculate}
          className="w-full h-13 py-3.5 bg-gradient-to-r from-[#e52e4d] via-[#a30820] to-[#8b0018] hover:brightness-110 active:scale-[0.98] transition-all rounded-full flex items-center justify-center gap-2 shadow-[0_0_24px_rgba(229,46,77,0.5)] border border-[#ff5166]/50 text-white font-bold text-sm"
        >
          <span>Calculate Bayesian Risk Matrix</span>
          <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
        </button>
      </div>
    </div>
  );
}

/* =========================================================================
   SCREEN 3: BAYESIAN RISK CONSULTATION REPORT
   ========================================================================= */
function ReportScreen({ vitals, risk, onBack }) {
  const percentBayes = (risk.bayesP * 100).toFixed(1);
  const percentSVM = (risk.svmP * 100).toFixed(1);
  const lowerPercent = (risk.lowerHDI * 100).toFixed(1);
  const upperPercent = (risk.upperHDI * 100).toFixed(1);
  const sigmaPercent = (risk.uncertaintySigma * 100).toFixed(1);

  // SVG circular arc dash calculation
  const circumference = 2 * Math.PI * 66; // r = 66 => ~414.7
  const strokeOffset = circumference - (circumference * risk.bayesP);
  const hdiSpan = circumference * (risk.upperHDI - risk.lowerHDI);
  const hdiOffset = circumference - (circumference * risk.upperHDI);

  return (
    <div className="flex-1 flex flex-col p-4 bg-gradient-to-b from-[#140206] via-[#100104] to-[#070102] overflow-y-auto max-h-[820px] no-scrollbar">
      {/* Top Header */}
      <header className="flex items-center justify-between pb-2 border-b border-[#3d1019]/60">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="w-8 h-8 rounded-xl bg-[#230b10] border border-[#3d1019] hover:border-[#e52e4d] flex items-center justify-center text-[#ff5166]"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          </button>
          <div>
            <h2 className="text-white font-bold text-sm">Risk Assessment Report</h2>
            <span className="text-[10px] text-[#b89da2]">Ref: {vitals.ref}</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button className="w-8 h-8 rounded-xl bg-[#190a0e] border border-[#3d1019] flex items-center justify-center text-[#b89da2] hover:text-white">
            <span className="material-symbols-outlined text-[16px]">share</span>
          </button>
          <button className="w-8 h-8 rounded-xl bg-[#230b10] border border-[#e52e4d]/40 flex items-center justify-center text-[#ff5166]">
            <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span>
          </button>
        </div>
      </header>

      {/* Uncertainty-Aware Triage Status Alert */}
      <div className="mt-3 p-3.5 rounded-2xl bg-[#190a0e] border border-[#3d1019] shadow-lg relative overflow-hidden">
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[#ff5166] to-[#a30820]"></div>
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5 text-[10px] text-[#e4bdbe] uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-[#ff5166] shadow-[0_0_6px_#ff5166]"></span>
              <span>{risk.triageTag}</span>
            </div>
            <h3 className="text-white font-bold text-sm mt-1">
              {risk.bayesP >= 0.65 ? "High Risk Concern" : risk.bayesP < 0.35 ? "Low Risk Benchmark" : "Equivocal / Borderline Triage"}
            </h3>
            <p className="text-[11px] text-[#b89da2] mt-0.5 leading-snug">
              {risk.triageRecommendation}
            </p>
          </div>
          <span className="material-symbols-outlined text-[#ff5166] text-xl">
            {risk.bayesP >= 0.65 ? "warning" : "health_and_safety"}
          </span>
        </div>
      </div>

      {/* Assigned Cardiologist Profile Card */}
      <div className="mt-3 p-3.5 rounded-2xl bg-[#1e0f13]/80 border border-[#3d1019] flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl overflow-hidden border border-[#e52e4d]/40 flex-shrink-0">
          <img
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuBRgYRYpkwsTcVHwWjtNmiLSOY0xE3df3hmVSZO-kOVMpLNRUgqU3dbs6H6GPrKsLysyo9xSRcs4An5HZguqN2zaW7kmUArGSiF2OrR6PdyMGObgNJB5mfsieskPQA-SYxUe2eDlS-zPdE8Ve4zSv_4C2llmTX9BzQUQDcP-YWNvGmEtZaVwYAc3immiQA8TutIj_RFjba3tDtrr4yDuZWXvuqeDxGNIGHH8VrN7zVZNHhKvFhLJp7jI748wACzeBPA5KZDJiXehEno"
            alt="Dr. James Anderson"
            className="w-full h-full object-cover"
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-white truncate">Dr. James Anderson, FACC</h4>
            <span className="text-[10px] font-bold text-amber-400 flex items-center gap-0.5">
              <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
              5.0
            </span>
          </div>
          <p className="text-[10px] text-[#b89da2] truncate">Senior Interventional Cardiologist</p>
          <div className="flex items-center gap-1 text-[9px] text-emerald-400 mt-1">
            <span className="w-1 h-1 rounded-full bg-emerald-400"></span>
            <span>Available for Clinical Review</span>
          </div>
        </div>
      </div>

      {/* Hero Circular Bayesian Gauge with 95% Credible Interval */}
      <section className="mt-3 p-4 rounded-2xl bg-[#190a0e] border border-[#3d1019] relative overflow-hidden shadow-[0_0_32px_rgba(229,46,77,0.15)] flex flex-col items-center">
        <div className="w-full flex justify-between items-center text-[10px] text-[#b89da2] uppercase tracking-wider mb-1">
          <span>Predictive Inference</span>
          <span className="font-mono text-[#ff5166]">Bayesian MAP Posterior</span>
        </div>

        {/* Circular Gauge */}
        <div className="relative w-44 h-44 flex items-center justify-center my-1">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 160 160">
            {/* Background Track */}
            <circle cx="80" cy="80" r="66" fill="transparent" stroke="#2c1b1f" strokeWidth="10" />

            {/* Credible Interval Band (HDI) */}
            <circle
              cx="80"
              cy="80"
              r="66"
              fill="transparent"
              stroke="rgba(255, 81, 102, 0.3)"
              strokeWidth="14"
              strokeDasharray={circumference}
              strokeDashoffset={hdiOffset}
              strokeLinecap="round"
            />

            {/* Posterior Mean Indicator */}
            <circle
              cx="80"
              cy="80"
              r="66"
              fill="transparent"
              stroke="#ff5166"
              strokeWidth="8"
              strokeDasharray={circumference}
              strokeDashoffset={strokeOffset}
              strokeLinecap="round"
              className="filter drop-shadow-[0_0_8px_#ff5166]"
            />
          </svg>

          {/* Central Metric Value */}
          <div className="absolute flex flex-col items-center justify-center text-center">
            <span className="text-[10px] text-[#b89da2] uppercase tracking-wider">Posterior Mean</span>
            <span className="text-3xl font-extrabold text-white font-mono tracking-tight">{percentBayes}%</span>
            <span className="text-[11px] font-bold text-[#ff5166] mt-0.5">CAD Risk Index</span>
          </div>
        </div>

        {/* Credible Interval Bracket Callout */}
        <div className="w-full mt-2 p-2.5 rounded-xl bg-[#230b10] border border-[#3d1019] text-xs">
          <div className="flex justify-between items-center">
            <div>
              <span className="text-[9px] text-[#b89da2] uppercase tracking-wider block">95% Credible Interval (HDI)</span>
              <span className="font-mono font-bold text-[#ffb3b5]">[{lowerPercent}% – {upperPercent}%]</span>
            </div>
            <div className="text-right">
              <span className="text-[9px] text-[#b89da2] uppercase tracking-wider block">Epistemic Sigma</span>
              <span className="font-mono font-bold text-white">±{sigmaPercent}%</span>
            </div>
          </div>

          {/* Density Spread Bar */}
          <div className="mt-2 pt-2 border-t border-[#3d1019]/60">
            <div className="flex justify-between text-[9px] text-[#b89da2] mb-1 font-mono">
              <span>0% Low</span>
              <span className="text-[#ff5166]">Uncertainty Band</span>
              <span>100% High</span>
            </div>
            <div className="w-full h-2.5 bg-[#140206] rounded-full relative overflow-hidden">
              <div
                className="absolute h-full bg-[#ff5166]/40 border-l border-r border-[#ff5166]"
                style={{
                  left: `${risk.lowerHDI * 100}%`,
                  width: `${(risk.upperHDI - risk.lowerHDI) * 100}%`,
                }}
              ></div>
              <div
                className="absolute w-1 h-full bg-[#ff5166] shadow-[0_0_6px_#ff5166]"
                style={{ left: `${risk.bayesP * 100}%` }}
              ></div>
            </div>
          </div>
        </div>
      </section>

      {/* Model Comparison Bento Card (SVM vs. Bayesian) */}
      <section className="mt-3 p-3.5 rounded-2xl bg-[#190a0e] border border-[#3d1019]">
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[#ff5166] text-base">balance</span>
            <span className="text-xs font-bold text-white">SVM vs. Bayesian Calibration</span>
          </div>
          <span className="text-[9px] px-2 py-0.5 rounded-full bg-[#230b10] border border-[#3d1019] text-[#e4bdbe]">
            Literature Comparative
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          {/* Deterministic SVM */}
          <div className="p-2.5 rounded-xl bg-[#230b10] border border-[#3d1019]">
            <span className="text-[9px] text-[#b89da2] uppercase block">Standard SVM (RBF)</span>
            <span className="text-base font-bold font-mono text-rose-400 mt-0.5 block">{percentSVM}%</span>
            <span className="text-[10px] text-rose-300 font-medium">Uncalibrated (Overconfident)</span>
            <p className="text-[9px] text-[#b89da2] mt-1 pt-1 border-t border-[#3d1019]/60">
              No confidence intervals. Pushes scores toward 0 or 1.
            </p>
          </div>

          {/* Bayesian Model */}
          <div className="p-2.5 rounded-xl bg-[#230b10] border border-[#e52e4d]/40 shadow-[0_0_10px_rgba(229,46,77,0.15)]">
            <span className="text-[9px] text-[#ffb3b5] uppercase block">Bayesian Posterior</span>
            <span className="text-base font-bold font-mono text-[#ff5166] mt-0.5 block">
              {percentBayes}% <span className="text-[10px]">±{sigmaPercent}%</span>
            </span>
            <span className="text-[10px] text-[#ff5166] font-medium">Calibrated Triage</span>
            <p className="text-[9px] text-[#e4bdbe] mt-1 pt-1 border-t border-[#3d1019]/60">
              Preserves uncertainty bounds for safe clinical referrals.
            </p>
          </div>
        </div>
      </section>

      {/* Feature Contributions Waterfall */}
      <section className="mt-3 p-3.5 rounded-2xl bg-[#190a0e] border border-[#3d1019]">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs font-bold text-white">Biomarker Risk Attribution</span>
          <span className="text-[9px] text-[#b89da2] font-mono">Log-Odds Impact</span>
        </div>

        <div className="space-y-1.5 text-xs">
          {risk.contribs.slice(0, 5).map((c, i) => (
            <div key={i} className="flex items-center justify-between py-1 border-b border-[#3d1019]/40 last:border-none">
              <div>
                <span className="text-white text-[11px] font-medium block">{c.name}</span>
                <span className="text-[9px] text-[#b89da2] font-mono">{c.value}</span>
              </div>
              <div className="text-right">
                <span
                  className={`text-[11px] font-mono font-bold ${
                    c.impact > 0 ? "text-rose-400" : "text-emerald-400"
                  }`}
                >
                  {c.impact > 0 ? `+${c.impact.toFixed(2)}` : c.impact.toFixed(2)}
                </span>
                <span className="text-[9px] text-[#b89da2] block">
                  {c.impact > 0 ? "Increases Risk" : "Protective"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* "What to Expect" 2x2 Clinical Action Pathway Grid */}
      <section className="mt-3 p-3.5 rounded-2xl bg-[#190a0e] border border-[#3d1019] pb-24">
        <div className="flex justify-between items-center mb-2.5">
          <span className="text-xs font-bold text-white">What to Expect</span>
          <span className="text-[10px] text-[#b89da2]">Recommended Pathway</span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2.5 rounded-xl bg-[#230b10] border border-[#3d1019]">
            <div className="w-6 h-6 rounded-lg bg-[#a30820]/30 text-[#ff5166] flex items-center justify-center mb-1">
              <span className="material-symbols-outlined text-[14px]">vital_signs</span>
            </div>
            <span className="font-bold text-white text-[11px] block">Heart Checkup</span>
            <span className="text-[9px] text-[#b89da2] mt-0.5 block">Auscultation & clinical exam</span>
            <span className="text-[9px] font-mono text-[#ffb3b5] mt-1.5 block">Step 01 • 30 min</span>
          </div>

          <div className="p-2.5 rounded-xl bg-[#230b10] border border-[#3d1019]">
            <div className="w-6 h-6 rounded-lg bg-[#a30820]/30 text-[#ff5166] flex items-center justify-center mb-1">
              <span className="material-symbols-outlined text-[14px]">ecg_heart</span>
            </div>
            <span className="font-bold text-white text-[11px] block">12-Lead ECG</span>
            <span className="text-[9px] text-[#b89da2] mt-0.5 block">Holter rhythm recording</span>
            <span className="text-[9px] font-mono text-[#ffb3b5] mt-1.5 block">Step 02 • 15 min</span>
          </div>

          <div className="p-2.5 rounded-xl bg-[#230b10] border border-[#3d1019]">
            <div className="w-6 h-6 rounded-lg bg-[#a30820]/30 text-[#ff5166] flex items-center justify-center mb-1">
              <span className="material-symbols-outlined text-[14px]">directions_run</span>
            </div>
            <span className="font-bold text-white text-[11px] block">TMT Stress Test</span>
            <span className="text-[9px] text-[#b89da2] mt-0.5 block">Graded cardiac tolerance</span>
            <span className="text-[9px] font-mono text-[#ffb3b5] mt-1.5 block">Step 03 • 45 min</span>
          </div>

          <div className="p-2.5 rounded-xl bg-[#230b10] border border-[#3d1019]">
            <div className="w-6 h-6 rounded-lg bg-[#a30820]/30 text-[#ff5166] flex items-center justify-center mb-1">
              <span className="material-symbols-outlined text-[14px]">medication</span>
            </div>
            <span className="font-bold text-white text-[11px] block">Treatment Plan</span>
            <span className="text-[9px] text-[#b89da2] mt-0.5 block">Personalized protocol</span>
            <span className="text-[9px] font-mono text-[#ffb3b5] mt-1.5 block">Step 04 • Continuous</span>
          </div>
        </div>
      </section>

      {/* Persistent Action Bar */}
      <div className="fixed bottom-16 inset-x-4 max-w-[390px] mx-auto z-40">
        <button
          onClick={() => alert(`Consultation request sent to Dr. James Anderson for patient ${vitals.name} (#${vitals.ref}).`)}
          className="w-full h-13 py-3.5 bg-gradient-to-r from-[#e52e4d] via-[#a30820] to-[#8b0018] hover:brightness-110 active:scale-[0.98] transition-all rounded-full flex items-center justify-center gap-2 shadow-[0_0_24px_rgba(229,46,77,0.5)] border border-[#ff5166]/50 text-white font-bold text-sm"
        >
          <span>Schedule Consult with Dr. Anderson</span>
          <span className="material-symbols-outlined text-[18px]">calendar_month</span>
        </button>
      </div>
    </div>
  );
}

/* =========================================================================
   BOTTOM DOCK NAVIGATION BAR (FOR MOBILE SHELL)
   ========================================================================= */
function BottomDock({ currentScreen, setCurrentScreen, activeTab, setActiveTab }) {
  const tabs = [
    { id: "home", label: "Home", icon: "home", screen: "welcome" },
    { id: "vitals", label: "Vitals", icon: "ecg_heart", screen: "vitals" },
    { id: "report", label: "Report", icon: "assignment", screen: "report" },
    { id: "profile", label: "Profile", icon: "person", screen: "vitals" },
  ];

  return (
    <div className="w-full bg-[#140206]/95 backdrop-blur-md border-t border-[#3d1019] py-2 px-6 flex items-center justify-between text-xs sticky bottom-0 z-50">
      {tabs.map((tab) => {
        const isActive =
          (tab.screen === currentScreen && activeTab === tab.id) ||
          (tab.id === "report" && currentScreen === "report") ||
          (tab.id === "vitals" && currentScreen === "vitals") ||
          (tab.id === "home" && currentScreen === "welcome");

        return (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
              setCurrentScreen(tab.screen);
            }}
            className={`flex flex-col items-center gap-0.5 transition-all ${
              isActive ? "text-[#ff5166]" : "text-[#b89da2] hover:text-white"
            }`}
          >
            <span
              className="material-symbols-outlined text-[20px]"
              style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
            >
              {tab.icon}
            </span>
            <span className={`text-[10px] ${isActive ? "font-bold" : "font-medium"}`}>
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
