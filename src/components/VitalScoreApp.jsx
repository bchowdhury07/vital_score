import React, { useState, useMemo, useEffect } from "react";
import {
  HeartIcon,
  PulseIcon,
  StethoscopeIcon,
  BellIcon,
  ArrowRightIcon,
  ArrowLeftIcon,
  ChevronRightIcon,
  ShieldCheckIcon,
  ActivityIcon,
  UserIcon,
  DocumentReportIcon,
  LockIcon,
  SettingsIcon,
  DownloadIcon,
  PrintIcon,
  TrashIcon,
  DatabaseIcon,
  PlusIcon,
  LogOutIcon,
  SunIcon,
  MoonIcon,
  FileTextIcon,
} from "./Icons.jsx";
import {
  loadPatientsFromStorage,
  savePatientsToStorage,
  createEmptyPatient,
  getBenchmarkSamplePatient,
  clearPatientsStorage,
} from "../utils/patientDatabase.js";
import {
  FIELD_META,
  validateVitals,
  isVitalsValid,
  CALIBRATED_TRIAGE_SIGMA_THRESHOLD,
  buildTriageFlag,
  callPredictAPI,
  fetchModelInfo,
  mapApiResponseToInference,
  computeCalibratedIllustrativeInference,
} from "../utils/clinicalUtils.js";
import {
  PosteriorCurve,
  ContributionBar,
  PatientRiskHeroRing,
} from "./RiskVisuals.jsx";

export default function VitalScoreApp() {
  // Theme state (Dark Mode / Light Mode)
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("vitalscore_theme_mode") || "dark";
  });

  // Clinician Authentication State ("Logging First")
  const [authSession, setAuthSession] = useState(() => {
    try {
      const stored = localStorage.getItem("vitalscore_clinician_auth_session");
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.error(e);
    }
    return null; // Not logged in by default
  });

  // Active navigation tab
  // Strict 4 Clinical Navigation Options
  const [activeNav, setActiveNav] = useState("clinical-assessment");

  // Mobile drawer state
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Settings Modal state (Kept completely separate)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState("general"); // 'general' | 'clinic' | 'bayesian' | 'database'

  // Institutional Settings
  const [clinicConfig, setClinicConfig] = useState(() => {
    try {
      const saved = localStorage.getItem("vitalscore_clinic_config");
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return {
      facilityName: "St. Jude Heart Institute",
      department: "Cardiology & Interventional Hemodynamics",
      defaultDoctor: "Dr. James Anderson, MD, FACC",
      credibleThreshold: 0.95,
      epistemicThreshold: 0.08,
    };
  });

  // Multi-Patient Database State (No forced prefilled mockup data)
  const [patients, setPatients] = useState(() => loadPatientsFromStorage());
  const [activePatientId, setActivePatientId] = useState(() => {
    const loaded = loadPatientsFromStorage();
    return loaded[0]?.id || null;
  });

  // Feedback Notification Toast
  const [saveToast, setSaveToast] = useState("");

  const showToast = (msg) => {
    setSaveToast(msg);
    setTimeout(() => setSaveToast(""), 3500);
  };

  // Toggle Theme
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("vitalscore_theme_mode", next);
  };

  // Update Clinic Config
  const updateClinicConfig = (newCfg) => {
    const updated = { ...clinicConfig, ...newCfg };
    setClinicConfig(updated);
    localStorage.setItem("vitalscore_clinic_config", JSON.stringify(updated));
    showToast("✓ Institutional settings updated");
  };

  // Active Patient selector
  const activePatient = useMemo(() => {
    if (!patients || patients.length === 0) return null;
    return patients.find((p) => p.id === activePatientId) || patients[0];
  }, [patients, activePatientId]);

  // Update Active Patient in state and storage
  const updateActivePatient = (updater) => {
    if (!activePatientId) return;
    setPatients((prevList) => {
      const updated = prevList.map((p) => {
        if (p.id === activePatientId) {
          return typeof updater === "function" ? updater(p) : { ...p, ...updater };
        }
        return p;
      });
      savePatientsToStorage(updated);
      return updated;
    });
  };

  // Create a brand new blank patient intake (Zero mock data)
  const handleAddNewPatient = () => {
    const blank = createEmptyPatient(clinicConfig.defaultDoctor);
    const updated = [blank, ...patients];
    setPatients(updated);
    setActivePatientId(blank.id);
    savePatientsToStorage(updated);
    setActiveNav("patient-profile");
    showToast("✓ New blank patient intake record initiated");
  };

  // Load Optional Calibration Case (For testing algorithms)
  const handleLoadBenchmarkCase = () => {
    const sample = getBenchmarkSamplePatient();
    const updated = [sample, ...patients];
    setPatients(updated);
    setActivePatientId(sample.id);
    savePatientsToStorage(updated);
    showToast("✓ Clinical benchmark sample loaded for verification");
  };

  // Delete Active Patient
  const handleDeletePatient = (patientId) => {
    if (!window.confirm("Are you sure you want to remove this patient record?")) return;
    const filtered = patients.filter((p) => p.id !== patientId);
    setPatients(filtered);
    savePatientsToStorage(filtered);
    setActivePatientId(filtered[0]?.id || null);
    showToast("✓ Patient record removed");
  };

  // Clear Entire Database
  const handleClearDatabase = () => {
    if (!window.confirm("WARNING: This will permanently delete ALL patient records from local storage. Proceed?")) return;
    clearPatientsStorage();
    setPatients([]);
    setActivePatientId(null);
    showToast("✓ Patient database cleared");
  };

  // Export Database JSON
  const handleExportDatabase = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(patients, null, 2));
    const dlAnchor = document.createElement("a");
    dlAnchor.setAttribute("href", dataStr);
    dlAnchor.setAttribute("download", `vitalscore_database_export_${new Date().toISOString().slice(0, 10)}.json`);
    dlAnchor.click();
    showToast("✓ Patient database JSON exported");
  };

  // Import Database JSON
  const handleImportDatabase = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = JSON.parse(evt.target.result);
        if (Array.isArray(parsed)) {
          setPatients(parsed);
          savePatientsToStorage(parsed);
          setActivePatientId(parsed[0]?.id || null);
          showToast(`✓ Successfully imported ${parsed.length} patient records`);
        } else {
          alert("Invalid database format. Must be an array of patient records.");
        }
      } catch (err) {
        alert("Failed to parse JSON file: " + err.message);
      }
    };
    reader.readAsText(file);
  };

  // Sign in clinician
  const handleClinicianLogin = (creds) => {
    const session = {
      isAuthenticated: true,
      doctor: creds.doctor || clinicConfig.defaultDoctor,
      npi: creds.npi || "NPI-9482104",
      department: creds.department || clinicConfig.department,
      email: creds.email || "clinician@vitalscore.health",
      loginTime: new Date().toISOString(),
    };
    setAuthSession(session);
    localStorage.setItem("vitalscore_clinician_auth_session", JSON.stringify(session));
    showToast(`✓ Logged in as ${session.doctor}`);
  };

  // Sign out / Lock Portal
  const handleClinicianLogout = () => {
    setAuthSession(null);
    localStorage.removeItem("vitalscore_clinician_auth_session");
    setIsSettingsOpen(false);
  };

  // Live Bayesian Probability & Uncertainty Calculation (Consolidated with Calibrated Fallback)
  const inference = useMemo(() => {
    if (!activePatient) return null;
    if (activePatient.lastInference) return activePatient.lastInference;
    const v = activePatient.vitals;

    // Check if sufficient inputs exist to calculate probability
    const hasValues = v.age && v.trestbps && v.chol && v.thalach;
    if (!hasValues) {
      return {
        isComputed: false,
        bayesP: 0,
        svmP: 0,
        lower: 0,
        upper: 0,
        ciWidth: 0,
        sigma: 0,
        triageStatus: "Awaiting Risk Assessment",
        triageFlag: {
          flagRaised: false,
          label: "Awaiting Assessment",
          reason: "Enter clinical parameters and tap Assess Risk to calculate calibrated posterior distribution.",
        },
        contribs: [],
      };
    }

    return computeCalibratedIllustrativeInference(v);
  }, [activePatient]);

  // Color theme definitions
  const isDark = theme === "dark";
  const colors = {
    bgApp: isDark ? "#080103" : "#f5f7fb",
    bgSidebar: isDark ? "#100205" : "#ffffff",
    bgCard: isDark ? "#140409" : "#ffffff",
    bgSubtle: isDark ? "#1e060d" : "#f8fafc",
    bgInput: isDark ? "#1e060d" : "#ffffff",
    border: isDark ? "rgba(229, 46, 77, 0.22)" : "#e2e8f0",
    borderStrong: isDark ? "#e52e4d" : "#8b0018",
    textPrimary: isDark ? "#ffffff" : "#111827",
    textSecondary: isDark ? "#fadbe0" : "#374151",
    textMuted: isDark ? "#b89da2" : "#6b7280",
    shadow: isDark ? "0 12px 32px rgba(0, 0, 0, 0.45)" : "0 4px 20px rgba(0, 0, 0, 0.06)",
  };

  // If clinician is not authenticated, display institutional login portal ("Logging First")
  if (!authSession || !authSession.isAuthenticated) {
    return (
      <ClinicianLoginPortal
        clinicConfig={clinicConfig}
        onLogin={handleClinicianLogin}
        theme={theme}
        toggleTheme={toggleTheme}
        colors={colors}
        isDark={isDark}
      />
    );
  }

  return (
    <div
      className={isDark ? "theme-dark" : "theme-light"}
      style={{
        display: "flex",
        minHeight: "100vh",
        backgroundColor: colors.bgApp,
        color: colors.textPrimary,
        fontFamily: "var(--font-sans)",
      }}
    >
      {/* -------------------------------------------------------------
          LEFT-SIDE NAVIGATION BAR (Professional Clinical Sidebar)
          ------------------------------------------------------------- */}
      <aside
        className="vs-sidebar"
        style={{
          width: "270px",
          minWidth: "270px",
          backgroundColor: colors.bgSidebar,
          borderRight: `1px solid ${colors.border}`,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          height: "100vh",
          padding: "20px 16px",
          zIndex: 90,
          boxShadow: isDark ? "4px 0 24px rgba(0,0,0,0.5)" : "2px 0 16px rgba(0,0,0,0.03)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Brand & Hospital Header */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "0 6px" }}>
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "10px",
                background: "linear-gradient(135deg, #8b0018 0%, #e52e4d 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 4px 14px rgba(229, 46, 77, 0.4)",
              }}
            >
              <HeartIcon className="w-6 h-6" fill="white" stroke="none" />
            </div>
            <div>
              <span
                style={{
                  fontSize: "18px",
                  fontWeight: "900",
                  letterSpacing: "-0.03em",
                  color: colors.textPrimary,
                  display: "block",
                }}
              >
                Vital<span style={{ color: "#e52e4d" }}>Score</span>
              </span>
              <span style={{ fontSize: "10px", fontWeight: "700", color: colors.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Cardiology Decision Support
              </span>
            </div>
          </div>

          {/* Active Patient Registry Card with Switcher */}
          <div
            style={{
              backgroundColor: colors.bgSubtle,
              border: `1px solid ${colors.border}`,
              borderRadius: "14px",
              padding: "12px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <span style={{ fontSize: "10px", fontWeight: "800", textTransform: "uppercase", color: colors.textMuted }}>
                Patient Registry
              </span>
              <button
                onClick={handleAddNewPatient}
                title="Initiate a new patient intake with blank records"
                style={{
                  fontSize: "11px",
                  fontWeight: "800",
                  color: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "4px 8px",
                  borderRadius: "6px",
                  background: "linear-gradient(135deg, #8b0018 0%, #c81e32 100%)",
                  boxShadow: "0 2px 6px rgba(139, 0, 24, 0.3)",
                }}
              >
                <PlusIcon className="w-3.5 h-3.5" />
                <span>New Intake</span>
              </button>
            </div>

            {patients.length > 0 ? (
              <>
                <select
                  value={activePatientId || ""}
                  onChange={(e) => setActivePatientId(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: "8px",
                    fontSize: "12px",
                    fontWeight: "700",
                    backgroundColor: colors.bgInput,
                    color: colors.textPrimary,
                    border: `1px solid ${colors.border}`,
                    cursor: "pointer",
                  }}
                >
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.profile.name || "Untitled Intake"} {p.profile.age ? `(${p.profile.age}y)` : ""} [#{p.ref}]
                    </option>
                  ))}
                </select>

                {activePatient && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px", fontSize: "11px", color: colors.textMuted }}>
                    <span>Ref: {activePatient.ref}</span>
                    <button
                      onClick={() => handleDeletePatient(activePatient.id)}
                      title="Delete this patient case"
                      style={{ color: "#ef4444", fontSize: "10px", fontWeight: "700", display: "flex", alignItems: "center", gap: "2px" }}
                    >
                      <TrashIcon className="w-3 h-3" />
                      <span>Remove</span>
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div style={{ padding: "8px 4px", fontSize: "11px", color: colors.textMuted, textAlign: "center" }}>
                No active patients.
                <button
                  onClick={handleAddNewPatient}
                  style={{ color: "#e52e4d", fontWeight: "800", display: "block", marginTop: "4px", margin: "4px auto 0 auto" }}
                >
                  + Add First Patient
                </button>
              </div>
            )}
          </div>

          {/* Left-Side Navigation Options (Strictly 4 Core Clinical Workflows) */}
          <nav style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {[
              {
                id: "clinical-assessment",
                label: "Clinical Assessment",
                sub: "Continuation of Bayesian Report",
                icon: <StethoscopeIcon className="w-5 h-5" />,
              },
              {
                id: "bayesian-report",
                label: "Bayesian Report",
                sub: "Posterior MAP & 95% HDI",
                icon: <ActivityIcon className="w-5 h-5" />,
              },
              {
                id: "patient-profile",
                label: "Patient Profile",
                sub: "Demographics & Intake",
                icon: <UserIcon className="w-5 h-5" />,
              },
              {
                id: "ehr-dashboard",
                label: "EHR Dashboard",
                sub: "Vitals History & Meds",
                icon: <DocumentReportIcon className="w-5 h-5" />,
              },
            ].map((item) => {
              const isActive = activeNav === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveNav(item.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "11px 14px",
                    borderRadius: "12px",
                    textAlign: "left",
                    transition: "all 0.2s ease",
                    backgroundColor: isActive
                      ? isDark
                        ? "rgba(139, 0, 24, 0.45)"
                        : "rgba(229, 46, 77, 0.1)"
                      : "transparent",
                    color: isActive ? (isDark ? "#ffffff" : "#8b0018") : colors.textMuted,
                    border: `1px solid ${isActive ? (isDark ? "#e52e4d" : "rgba(139, 0, 24, 0.3)") : "transparent"}`,
                    boxShadow: isActive ? (isDark ? "0 4px 14px rgba(229, 46, 77, 0.2)" : "none") : "none",
                  }}
                >
                  <div style={{ color: isActive ? "#e52e4d" : colors.textMuted }}>{item.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "13px", fontWeight: isActive ? "800" : "600", color: isActive ? colors.textPrimary : colors.textSecondary }}>
                      {item.label}
                    </div>
                    <div style={{ fontSize: "10px", color: colors.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {item.sub}
                    </div>
                  </div>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Sidebar: Dedicated Settings Button + Clinician Profile */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", borderTop: `1px solid ${colors.border}`, paddingTop: "14px" }}>
          {/* Separate Settings Button */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "10px 14px",
              borderRadius: "10px",
              backgroundColor: colors.bgSubtle,
              color: colors.textPrimary,
              border: `1px solid ${colors.border}`,
              fontSize: "12px",
              fontWeight: "700",
              transition: "all 0.15s ease",
            }}
          >
            <SettingsIcon className="w-4 h-4 text-[#e52e4d]" />
            <span style={{ flex: 1, textAlign: "left" }}>System Settings</span>
            <span style={{ fontSize: "10px", color: colors.textMuted, padding: "2px 6px", borderRadius: "4px", backgroundColor: isDark ? "#280812" : "#f1f5f9" }}>
              {theme === "dark" ? "Dark" : "Light"}
            </span>
          </button>

          {/* Clinician Authentication Info Card */}
          <div
            style={{
              padding: "10px",
              borderRadius: "12px",
              backgroundColor: colors.bgSubtle,
              border: `1px solid ${colors.border}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "8px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
              <div
                style={{
                  width: "30px",
                  height: "30px",
                  borderRadius: "8px",
                  backgroundColor: "#8b0018",
                  color: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "11px",
                  fontWeight: "800",
                  flexShrink: 0,
                }}
              >
                MD
              </div>
              <div style={{ minWidth: 0 }}>
                <span style={{ fontSize: "11px", fontWeight: "800", color: colors.textPrimary, display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {authSession.doctor}
                </span>
                <span style={{ fontSize: "9px", color: colors.textMuted, display: "block" }}>
                  {authSession.npi} • Active
                </span>
              </div>
            </div>

            <button
              onClick={handleClinicianLogout}
              title="Lock portal / Sign out"
              style={{
                color: colors.textMuted,
                padding: "6px",
                borderRadius: "6px",
              }}
            >
              <LogOutIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* -------------------------------------------------------------
          MAIN CONTENT WORKSPACE AREA
          ------------------------------------------------------------- */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflowY: "auto" }}>
        {/* Top Header Bar */}
        <header
          className="vs-header"
          style={{
            backgroundColor: colors.bgSidebar,
            borderBottom: `1px solid ${colors.border}`,
            padding: "14px 28px",
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            position: "sticky",
            top: 0,
            zIndex: 80,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <h1 style={{ fontSize: "17px", fontWeight: "900", color: colors.textPrimary, margin: 0 }}>
              {activeNav === "clinical-assessment" && "Clinical Assessment (Continuation of Bayesian Report)"}
              {activeNav === "bayesian-report" && "Bayesian Risk Inference & Uncertainty Engine"}
              {activeNav === "patient-profile" && "Patient Demographics & Clinical Intake"}
              {activeNav === "ehr-dashboard" && "Electronic Health Records (EHR) Telemetry"}
            </h1>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            {saveToast && (
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: "700",
                  backgroundColor: "#10b981",
                  color: "#ffffff",
                  padding: "4px 12px",
                  borderRadius: "999px",
                  boxShadow: "0 2px 8px rgba(16, 185, 129, 0.4)",
                  animation: "fadeIn 0.2s",
                }}
              >
                {saveToast}
              </span>
            )}

            {/* Facility Indicator */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: colors.textMuted }}>
              <ShieldCheckIcon className="w-4 h-4 text-[#e52e4d]" />
              <span style={{ fontWeight: "600" }}>{clinicConfig.facilityName}</span>
            </div>

            {/* Quick Dark / Light Switch */}
            <button
              onClick={toggleTheme}
              title={`Switch to ${isDark ? "Light" : "Dark"} Mode`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 10px",
                borderRadius: "8px",
                backgroundColor: colors.bgSubtle,
                border: `1px solid ${colors.border}`,
                fontSize: "11px",
                fontWeight: "700",
                color: colors.textPrimary,
              }}
            >
              {isDark ? <SunIcon className="w-3.5 h-3.5 text-amber-400" /> : <MoonIcon className="w-3.5 h-3.5 text-purple-600" />}
              <span>{isDark ? "Light" : "Dark"}</span>
            </button>
          </div>
        </header>

        {/* Main Work Area */}
        <main style={{ padding: "28px", flex: 1 }}>
          {/* If no patient exists in registry, show empty intake trigger */}
          {(!activePatient || patients.length === 0) ? (
            <EmptyRegistryState
              onNewPatient={handleAddNewPatient}
              onLoadBenchmark={handleLoadBenchmarkCase}
              colors={colors}
              isDark={isDark}
            />
          ) : (
            <>
              {/* VIEW 1: CLINICAL ASSESSMENT CONTINUATION */}
              {activeNav === "clinical-assessment" && (
                <ClinicalAssessmentContinuationView
                  patient={activePatient}
                  updatePatient={updateActivePatient}
                  inference={inference}
                  clinicConfig={clinicConfig}
                  colors={colors}
                  isDark={isDark}
                  onNavigateToReport={() => setActiveNav("bayesian-report")}
                  showToast={showToast}
                />
              )}

              {/* VIEW 2: BAYESIAN REPORT */}
              {activeNav === "bayesian-report" && (
                <BayesianReportView
                  patient={activePatient}
                  updatePatient={updateActivePatient}
                  inference={inference}
                  colors={colors}
                  isDark={isDark}
                  onNavigateToAssessment={() => setActiveNav("clinical-assessment")}
                  showToast={showToast}
                />
              )}

              {/* VIEW 3: PATIENT PROFILE */}
              {activeNav === "patient-profile" && (
                <PatientProfileView
                  patient={activePatient}
                  updatePatient={updateActivePatient}
                  colors={colors}
                  isDark={isDark}
                  showToast={showToast}
                />
              )}

              {/* VIEW 4: EHR DASHBOARD */}
              {activeNav === "ehr-dashboard" && (
                <EHRDashboardView
                  patient={activePatient}
                  updatePatient={updateActivePatient}
                  colors={colors}
                  isDark={isDark}
                  showToast={showToast}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* -------------------------------------------------------------
          SEPARATE SYSTEM SETTINGS MODAL
          ------------------------------------------------------------- */}
      {isSettingsOpen && (
        <SettingsModal
          onClose={() => setIsSettingsOpen(false)}
          theme={theme}
          toggleTheme={toggleTheme}
          clinicConfig={clinicConfig}
          onUpdateClinicConfig={updateClinicConfig}
          authSession={authSession}
          onLogout={handleClinicianLogout}
          onExportDatabase={handleExportDatabase}
          onImportDatabase={handleImportDatabase}
          onClearDatabase={handleClearDatabase}
          onLoadBenchmark={handleLoadBenchmarkCase}
          patientCount={patients.length}
          colors={colors}
          isDark={isDark}
          settingsTab={settingsTab}
          setSettingsTab={setSettingsTab}
        />
      )}
    </div>
  );
}

/* =========================================================================
   LOGIN SCREEN ("Logging First")
   ========================================================================= */
function ClinicianLoginPortal({ clinicConfig, onLogin, theme, toggleTheme, colors, isDark }) {
  const [doctor, setDoctor] = useState("Dr. James Anderson, MD, FACC");
  const [npi, setNpi] = useState("NPI-9482104");
  const [email, setEmail] = useState("dr.anderson@cardio.stjude.org");
  const [dept, setDept] = useState("Cardiology & Interventional Hemodynamics");
  const [password, setPassword] = useState("••••••••••••");

  const handleSubmit = (e) => {
    e.preventDefault();
    onLogin({ doctor, npi, email, department: dept });
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: isDark ? "#060102" : "#f1f5f9",
        backgroundImage: isDark
          ? "radial-gradient(circle at 50% 20%, rgba(229, 46, 77, 0.2) 0%, transparent 60%)"
          : "radial-gradient(circle at 50% 20%, rgba(200, 30, 50, 0.08) 0%, transparent 60%)",
        padding: "20px",
      }}
    >
      {/* Theme toggle in corner */}
      <div style={{ position: "absolute", top: "24px", right: "24px" }}>
        <button
          onClick={toggleTheme}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "8px 14px",
            borderRadius: "10px",
            backgroundColor: isDark ? "#140409" : "#ffffff",
            border: `1px solid ${isDark ? "rgba(229, 46, 77, 0.3)" : "#cbd5e1"}`,
            color: isDark ? "#ffffff" : "#111827",
            fontSize: "12px",
            fontWeight: "700",
          }}
        >
          {isDark ? <SunIcon className="w-4 h-4 text-amber-400" /> : <MoonIcon className="w-4 h-4 text-purple-600" />}
          <span>{isDark ? "Light Mode" : "Dark Mode"}</span>
        </button>
      </div>

      <div
        style={{
          width: "100%",
          maxWidth: "460px",
          backgroundColor: isDark ? "#120307" : "#ffffff",
          borderRadius: "24px",
          border: `1px solid ${isDark ? "rgba(229, 46, 77, 0.35)" : "#e2e8f0"}`,
          padding: "36px",
          boxShadow: isDark ? "0 24px 60px rgba(0, 0, 0, 0.8)" : "0 12px 40px rgba(0, 0, 0, 0.08)",
        }}
      >
        {/* Brand Crest */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", marginBottom: "28px" }}>
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "16px",
              background: "linear-gradient(135deg, #8b0018 0%, #e52e4d 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 8px 24px rgba(229, 46, 77, 0.5)",
              marginBottom: "14px",
            }}
          >
            <HeartIcon className="w-8 h-8" fill="white" stroke="none" />
          </div>
          <h1 style={{ fontSize: "24px", fontWeight: "900", color: isDark ? "#ffffff" : "#111827", margin: "0 0 4px 0" }}>
            Vital<span style={{ color: "#e52e4d" }}>Score</span> Portal
          </h1>
          <span style={{ fontSize: "11px", fontWeight: "700", color: "#e52e4d", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Cardiovascular Bayesian Decision Support
          </span>
          <span style={{ fontSize: "12px", color: isDark ? "#a18288" : "#64748b", marginTop: "4px" }}>
            {clinicConfig.facilityName} • Institutional Access
          </span>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label style={{ fontSize: "11px", fontWeight: "800", textTransform: "uppercase", color: isDark ? "#cbd5e1" : "#475569", display: "block", marginBottom: "6px" }}>
              Attending Clinician / Physician
            </label>
            <input
              type="text"
              required
              value={doctor}
              onChange={(e) => setDoctor(e.target.value)}
              style={{
                width: "100%",
                padding: "11px 14px",
                borderRadius: "10px",
                fontSize: "13px",
                backgroundColor: isDark ? "#1e060d" : "#f8fafc",
                color: isDark ? "#ffffff" : "#111827",
                border: `1px solid ${isDark ? "rgba(229, 46, 77, 0.3)" : "#cbd5e1"}`,
              }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ fontSize: "11px", fontWeight: "800", textTransform: "uppercase", color: isDark ? "#cbd5e1" : "#475569", display: "block", marginBottom: "6px" }}>
                Physician NPI / Staff ID
              </label>
              <input
                type="text"
                required
                value={npi}
                onChange={(e) => setNpi(e.target.value)}
                style={{
                  width: "100%",
                  padding: "11px 14px",
                  borderRadius: "10px",
                  fontSize: "13px",
                  fontFamily: "var(--font-mono)",
                  backgroundColor: isDark ? "#1e060d" : "#f8fafc",
                  color: isDark ? "#ffffff" : "#111827",
                  border: `1px solid ${isDark ? "rgba(229, 46, 77, 0.3)" : "#cbd5e1"}`,
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: "11px", fontWeight: "800", textTransform: "uppercase", color: isDark ? "#cbd5e1" : "#475569", display: "block", marginBottom: "6px" }}>
                Department
              </label>
              <select
                value={dept}
                onChange={(e) => setDept(e.target.value)}
                style={{
                  width: "100%",
                  padding: "11px 10px",
                  borderRadius: "10px",
                  fontSize: "12px",
                  backgroundColor: isDark ? "#1e060d" : "#f8fafc",
                  color: isDark ? "#ffffff" : "#111827",
                  border: `1px solid ${isDark ? "rgba(229, 46, 77, 0.3)" : "#cbd5e1"}`,
                }}
              >
                <option value="Cardiology & Interventional Hemodynamics">Cardiology & Hemodynamics</option>
                <option value="Cardiovascular Critical Care & Triage">Critical Care & Triage</option>
                <option value="Preventive Cardiology & Outpatient Care">Preventive Cardiology</option>
              </select>
            </div>
          </div>

          <div>
            <label style={{ fontSize: "11px", fontWeight: "800", textTransform: "uppercase", color: isDark ? "#cbd5e1" : "#475569", display: "block", marginBottom: "6px" }}>
              Institutional Security Credential
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter institutional security PIN"
              style={{
                width: "100%",
                padding: "11px 14px",
                borderRadius: "10px",
                fontSize: "13px",
                backgroundColor: isDark ? "#1e060d" : "#f8fafc",
                color: isDark ? "#ffffff" : "#111827",
                border: `1px solid ${isDark ? "rgba(229, 46, 77, 0.3)" : "#cbd5e1"}`,
              }}
            />
          </div>

          <button
            type="submit"
            style={{
              marginTop: "8px",
              padding: "14px",
              borderRadius: "12px",
              background: "linear-gradient(90deg, #8b0018 0%, #e52e4d 100%)",
              color: "#ffffff",
              fontSize: "14px",
              fontWeight: "800",
              boxShadow: "0 4px 18px rgba(229, 46, 77, 0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
            }}
          >
            <LockIcon className="w-4 h-4" />
            <span>Enter Clinical Workspace</span>
          </button>
        </form>

        <div style={{ marginTop: "24px", paddingTop: "16px", borderTop: `1px solid ${isDark ? "rgba(229,46,77,0.15)" : "#e2e8f0"}`, textAlign: "center" }}>
          <span style={{ fontSize: "11px", color: isDark ? "#82636a" : "#94a3b8" }}>
            🔒 HIPAA & HITECH Encrypted • Bayesian Laplace Quantification Active
          </span>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   EMPTY REGISTRY STATE (When no mock data is loaded)
   ========================================================================= */
function EmptyRegistryState({ onNewPatient, onLoadBenchmark, colors, isDark }) {
  return (
    <div
      style={{
        maxWidth: "680px",
        margin: "60px auto",
        backgroundColor: colors.bgCard,
        borderRadius: "24px",
        border: `1px solid ${colors.border}`,
        padding: "48px 36px",
        textAlign: "center",
        boxShadow: colors.shadow,
      }}
    >
      <div
        style={{
          width: "64px",
          height: "64px",
          borderRadius: "20px",
          backgroundColor: isDark ? "#240610" : "#fff1f3",
          color: "#e52e4d",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 20px auto",
          border: `1px solid ${colors.border}`,
        }}
      >
        <StethoscopeIcon className="w-8 h-8" />
      </div>

      <h2 style={{ fontSize: "22px", fontWeight: "900", color: colors.textPrimary, marginBottom: "8px" }}>
        No Active Patient Case Loaded
      </h2>
      <p style={{ fontSize: "13px", color: colors.textMuted, maxWidth: "460px", margin: "0 auto 28px auto", lineHeight: "1.6" }}>
        To ensure clinical integrity, no prefilled mock data is forced into your workspace. Initiate a fresh patient intake to manually enter demographics, hemodynamics, and run Bayesian risk assessment.
      </p>

      <div style={{ display: "flex", justifyContent: "center", gap: "14px", flexWrap: "wrap" }}>
        <button
          onClick={onNewPatient}
          style={{
            padding: "12px 24px",
            borderRadius: "12px",
            background: "linear-gradient(90deg, #8b0018 0%, #e52e4d 100%)",
            color: "#ffffff",
            fontSize: "13px",
            fontWeight: "800",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            boxShadow: "0 4px 14px rgba(139, 0, 24, 0.35)",
          }}
        >
          <PlusIcon className="w-4 h-4" />
          <span>Register New Patient Intake</span>
        </button>

        <button
          onClick={onLoadBenchmark}
          style={{
            padding: "12px 20px",
            borderRadius: "12px",
            backgroundColor: colors.bgSubtle,
            color: colors.textPrimary,
            fontSize: "13px",
            fontWeight: "700",
            border: `1px solid ${colors.border}`,
          }}
        >
          Load Benchmark Calibration Case
        </button>
      </div>
    </div>
  );
}

/* =========================================================================
   VIEW 1: CLINICAL ASSESSMENT CONTINUATION (Downloadable Report)
   ========================================================================= */
function ClinicalAssessmentContinuationView({
  patient,
  updatePatient,
  inference,
  clinicConfig,
  colors,
  isDark,
  onNavigateToReport,
  showToast,
}) {
  const [assessmentForm, setAssessmentForm] = useState(patient.clinicalAssessment);

  useEffect(() => {
    setAssessmentForm(patient.clinicalAssessment);
  }, [patient.id]);

  const handleSaveAssessment = () => {
    updatePatient({ clinicalAssessment: assessmentForm });
    showToast("✓ Clinical Assessment Report successfully saved to patient records");
  };

  const handleAddTest = () => {
    const testName = prompt("Enter secondary diagnostic test to add (e.g. Stress Echocardiogram, Coronary Calcium Scan):");
    if (testName && testName.trim()) {
      setAssessmentForm((prev) => ({
        ...prev,
        secondaryTestsOrdered: [...(prev.secondaryTestsOrdered || []), testName.trim()],
      }));
    }
  };

  const handleRemoveTest = (idx) => {
    setAssessmentForm((prev) => ({
      ...prev,
      secondaryTestsOrdered: prev.secondaryTestsOrdered.filter((_, i) => i !== idx),
    }));
  };

  // Instant Download of Clinical Assessment Report as formatted HTML Document
  const handleDownloadReport = () => {
    const pName = patient.profile.name || "Patient";
    const refCode = patient.ref || "VS-000";
    const dateStr = new Date().toISOString().slice(0, 10);

    const reportHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>VitalScore Clinical Assessment Report - ${pName} (${refCode})</title>
  <style>
    body { font-family: 'Segoe UI', Helvetica, Arial, sans-serif; color: #111827; background: #ffffff; padding: 40px; margin: 0; line-height: 1.5; }
    .header { border-bottom: 2px solid #8b0018; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-end; }
    .brand { font-size: 26px; font-weight: 900; color: #8b0018; }
    .meta { font-size: 12px; color: #6b7280; text-align: right; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 800; background: #fff1f3; color: #8b0018; border: 1px solid #ffd1dc; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
    .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; }
    .card-title { font-size: 11px; font-weight: 800; text-transform: uppercase; color: #64748b; margin-bottom: 8px; }
    .value { font-size: 18px; font-weight: 800; color: #111827; }
    .section-title { font-size: 14px; font-weight: 800; text-transform: uppercase; color: #8b0018; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin: 24px 0 12px 0; }
    .tag { display: inline-block; background: #e2e8f0; padding: 3px 8px; border-radius: 4px; font-size: 12px; margin-right: 6px; margin-bottom: 6px; font-weight: 600; }
    .signature { margin-top: 40px; padding-top: 20px; border-top: 1px solid #cbd5e1; display: flex; justify-content: space-between; font-size: 12px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">VitalScore • Clinical Assessment Report</div>
      <div style="font-size: 13px; color: #374151; font-weight: 600;">${clinicConfig.facilityName} • ${clinicConfig.department}</div>
    </div>
    <div class="meta">
      <div><strong>Record Ref:</strong> #${refCode}</div>
      <div><strong>Assessment Date:</strong> ${assessmentForm.lastAssessmentDate || dateStr}</div>
      <div><strong>Attending:</strong> ${assessmentForm.attendingDoctor || clinicConfig.defaultDoctor}</div>
    </div>
  </div>

  <div class="card" style="margin-bottom: 24px;">
    <div class="card-title">Patient Demographics</div>
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; font-size: 13px;">
      <div><strong>Name:</strong> ${patient.profile.name || "N/A"}</div>
      <div><strong>Age / Sex:</strong> ${patient.profile.age || "N/A"} yrs / ${patient.profile.sex || "N/A"}</div>
      <div><strong>DOB:</strong> ${patient.profile.dob || "N/A"}</div>
      <div><strong>Blood Group:</strong> ${patient.profile.bloodGroup || "N/A"}</div>
      <div><strong>Height / Weight:</strong> ${patient.profile.height || "N/A"} / ${patient.profile.weight || "N/A"}</div>
      <div><strong>BMI:</strong> ${patient.profile.bmi || "N/A"}</div>
      <div><strong>Phone:</strong> ${patient.profile.phone || "N/A"}</div>
      <div><strong>Allergies:</strong> ${patient.profile.allergies || "None documented"}</div>
    </div>
  </div>

  <div class="section-title">Bayesian Risk Quantification (Model Continuation)</div>
  <div class="grid">
    <div class="card">
      <div class="card-title">Posterior MAP Probability</div>
      <div class="value" style="color: #8b0018;">${inference?.isComputed ? (inference.bayesP * 100).toFixed(1) + "%" : "Awaiting Hemodynamics"}</div>
      <div style="font-size: 11px; color: #64748b; margin-top: 4px;">Mean posterior CAD risk calculated via Laplace approximation.</div>
    </div>
    <div class="card">
      <div class="card-title">95% Credible Interval (HDI)</div>
      <div class="value" style="color: #8b0018;">${inference?.isComputed ? "[" + (inference.lower * 100).toFixed(1) + "% – " + (inference.upper * 100).toFixed(1) + "%]" : "Pending Vitals"}</div>
      <div style="font-size: 11px; color: #64748b; margin-top: 4px;">Epistemic Uncertainty: ±${inference?.isComputed ? (inference.sigma * 100).toFixed(1) + "%" : "N/A"}</div>
    </div>
  </div>

  <div class="section-title">Clinical Assessment & Triage Synthesis</div>
  <div class="card" style="margin-bottom: 16px;">
    <div class="card-title">Triage Priority</div>
    <div class="value">${assessmentForm.triageLevel || "Standard Triage"}</div>
    <div style="margin-top: 12px;"><strong>Primary Diagnostic Impression:</strong></div>
    <p style="font-size: 13px; color: #1f2937; margin: 4px 0 0 0;">${assessmentForm.diagnosisImpression || "No diagnosis recorded yet."}</p>
  </div>

  <div class="card" style="margin-bottom: 16px;">
    <div class="card-title">Attending Physician Impression & Notes</div>
    <p style="font-size: 13px; color: #1f2937; white-space: pre-wrap; margin: 0;">${assessmentForm.doctorNotes || "No detailed notes recorded."}</p>
  </div>

  <div class="card" style="margin-bottom: 16px;">
    <div class="card-title">Ordered Secondary Diagnostic Tests</div>
    <div>
      ${(assessmentForm.secondaryTestsOrdered && assessmentForm.secondaryTestsOrdered.length > 0)
        ? assessmentForm.secondaryTestsOrdered.map(t => `<span class="tag">${t}</span>`).join("")
        : '<span style="font-size: 13px; color: #6b7280;">No secondary tests ordered.</span>'}
    </div>
  </div>

  <div class="card" style="margin-bottom: 24px;">
    <div class="card-title">Pharmacotherapy & Longitudinal Care Plan</div>
    <p style="font-size: 13px; color: #1f2937; white-space: pre-wrap; margin: 0;">${assessmentForm.prescriptionPlan || "No prescription protocol recorded."}</p>
    <div style="margin-top: 10px; font-size: 12px; color: #4b5563;"><strong>Follow-up Timeline:</strong> ${assessmentForm.followUpSchedule || "Not scheduled"}</div>
  </div>

  <div class="signature">
    <div>
      <div><strong>Attending Cardiologist:</strong> ${assessmentForm.attendingDoctor || clinicConfig.defaultDoctor}</div>
      <div>St. Jude Heart Institute • Department of Cardiovascular Medicine</div>
    </div>
    <div style="text-align: right;">
      <div><strong>Signature / Verification:</strong> _____________________________</div>
      <div>Date Verified: ${new Date().toLocaleDateString()}</div>
    </div>
  </div>
</body>
</html>`;

    const blob = new Blob([reportHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `VitalScore_Assessment_${refCode}_${dateStr}.html`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("✓ Clinical Assessment Report successfully downloaded");
  };

  // Browser Print trigger (Uses @media print styles in index.css)
  const handlePrintReport = () => {
    window.print();
  };

  return (
    <div className="clinical-report-container" style={{ display: "flex", flexDirection: "column", gap: "24px", maxWidth: "1050px", margin: "0 auto" }}>
      {/* 1. Continuation Banner connecting to Bayesian Report */}
      <div
        style={{
          borderRadius: "20px",
          background: isDark
            ? "linear-gradient(135deg, #1f050d 0%, #160208 100%)"
            : "linear-gradient(135deg, #fff1f3 0%, #fef2f2 100%)",
          border: `1px solid ${colors.border}`,
          padding: "20px 24px",
          boxShadow: colors.shadow,
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "16px",
        }}
      >
        <div style={{ flex: 1, minWidth: "280px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "10px", fontWeight: "800", textTransform: "uppercase", backgroundColor: "#8b0018", color: "#ffffff", padding: "2px 8px", borderRadius: "6px" }}>
              Report Continuation
            </span>
            <span style={{ fontSize: "11px", color: colors.textMuted }}>
              Generated directly from Bayesian Probability Engine
            </span>
          </div>
          <h2 style={{ fontSize: "20px", fontWeight: "900", color: colors.textPrimary, margin: "6px 0 2px 0" }}>
            Bayesian Assessment Synthesis: {inference?.triageStatus || "Awaiting Data"}
          </h2>
          <p style={{ fontSize: "12px", color: colors.textMuted, margin: 0 }}>
            {inference?.isComputed ? (
              <>
                Model MAP posterior probability is <strong style={{ color: "#e52e4d" }}>{(inference.bayesP * 100).toFixed(1)}%</strong> with 95% Credible Interval (HDI) <strong style={{ color: "#e52e4d" }}>[{(inference.lower * 100).toFixed(1)}% – {(inference.upper * 100).toFixed(1)}%]</strong> and uncertainty sigma <strong style={{ color: colors.textPrimary }}>±{(inference.sigma * 100).toFixed(1)}%</strong>.
              </>
            ) : (
              "Patient hemodynamic data is pending entry in the Bayesian Report tab to synthesize exact posterior distribution."
            )}
          </p>
        </div>

        {/* Action Buttons: Download Report & Print PDF */}
        <div className="btn-print-hide" style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <button
            onClick={handleDownloadReport}
            title="Download complete clinical report document"
            style={{
              padding: "10px 16px",
              borderRadius: "10px",
              background: "linear-gradient(90deg, #8b0018 0%, #e52e4d 100%)",
              color: "#ffffff",
              fontSize: "12px",
              fontWeight: "800",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              boxShadow: "0 3px 12px rgba(139, 0, 24, 0.4)",
            }}
          >
            <DownloadIcon className="w-4 h-4" />
            <span>Download Report</span>
          </button>

          <button
            onClick={handlePrintReport}
            title="Print or Save as PDF"
            style={{
              padding: "10px 14px",
              borderRadius: "10px",
              backgroundColor: colors.bgSubtle,
              color: colors.textPrimary,
              border: `1px solid ${colors.border}`,
              fontSize: "12px",
              fontWeight: "700",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <PrintIcon className="w-4 h-4" />
            <span>Print / PDF</span>
          </button>

          <button
            onClick={onNavigateToReport}
            style={{
              padding: "10px 14px",
              borderRadius: "10px",
              backgroundColor: colors.bgSubtle,
              color: "#e52e4d",
              border: `1px solid ${colors.border}`,
              fontSize: "12px",
              fontWeight: "800",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <span>Bayesian Math</span>
            <ChevronRightIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Four Clinical Assessment Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "16px" }}>
        <div style={{ backgroundColor: colors.bgCard, borderRadius: "16px", border: `1px solid ${colors.border}`, padding: "16px", boxShadow: colors.shadow }}>
          <span style={{ fontSize: "10px", fontWeight: "800", textTransform: "uppercase", color: colors.textMuted }}>
            Posterior Risk (MAP)
          </span>
          <div style={{ fontSize: "24px", fontWeight: "900", color: "#e52e4d", fontFamily: "var(--font-mono)", margin: "4px 0" }}>
            {inference?.isComputed ? `${(inference.bayesP * 100).toFixed(1)}%` : "Pending"}
          </div>
          <span style={{ fontSize: "11px", color: colors.textMuted }}>
            {inference?.isComputed ? "Calibrated probability of CAD" : "Requires BP & Chol entry"}
          </span>
        </div>

        <div style={{ backgroundColor: colors.bgCard, borderRadius: "16px", border: `1px solid ${colors.border}`, padding: "16px", boxShadow: colors.shadow }}>
          <span style={{ fontSize: "10px", fontWeight: "800", textTransform: "uppercase", color: colors.textMuted }}>
            95% Credible Interval (HDI)
          </span>
          <div style={{ fontSize: "20px", fontWeight: "900", color: colors.textPrimary, fontFamily: "var(--font-mono)", margin: "6px 0" }}>
            {inference?.isComputed ? `[${(inference.lower * 100).toFixed(1)}% – ${(inference.upper * 100).toFixed(1)}%]` : "Pending"}
          </div>
          <span style={{ fontSize: "11px", color: colors.textMuted }}>
            Bayesian posterior credible range
          </span>
        </div>

        <div style={{ backgroundColor: colors.bgCard, borderRadius: "16px", border: `1px solid ${colors.border}`, padding: "16px", boxShadow: colors.shadow }}>
          <span style={{ fontSize: "10px", fontWeight: "800", textTransform: "uppercase", color: colors.textMuted }}>
            Epistemic Sigma (Doubt)
          </span>
          <div style={{ fontSize: "22px", fontWeight: "900", color: (inference?.sigma || 0) > clinicConfig.epistemicThreshold ? "#f59e0b" : "#10b981", fontFamily: "var(--font-mono)", margin: "6px 0" }}>
            {inference?.isComputed ? `±${(inference.sigma * 100).toFixed(1)}%` : "Pending"}
          </div>
          <span style={{ fontSize: "11px", color: colors.textMuted }}>
            {(inference?.sigma || 0) > clinicConfig.epistemicThreshold ? "Elevated model doubt" : "Robust inference confidence"}
          </span>
        </div>

        <div style={{ backgroundColor: colors.bgCard, borderRadius: "16px", border: `1px solid ${colors.border}`, padding: "16px", boxShadow: colors.shadow }}>
          <span style={{ fontSize: "10px", fontWeight: "800", textTransform: "uppercase", color: colors.textMuted }}>
            Follow-Up Timeline
          </span>
          <input
            type="text"
            value={assessmentForm.followUpSchedule || ""}
            placeholder="e.g. 2 Weeks (Post-Echo)"
            onChange={(e) => setAssessmentForm({ ...assessmentForm, followUpSchedule: e.target.value })}
            style={{
              width: "100%",
              marginTop: "6px",
              padding: "6px 8px",
              borderRadius: "6px",
              fontSize: "12px",
              fontWeight: "700",
              backgroundColor: colors.bgInput,
              color: colors.textPrimary,
              border: `1px solid ${colors.border}`,
            }}
          />
        </div>
      </div>

      {/* 3. Fully Editable Clinical Assessment Report */}
      <div
        style={{
          backgroundColor: colors.bgCard,
          borderRadius: "20px",
          border: `1px solid ${colors.border}`,
          padding: "24px",
          boxShadow: colors.shadow,
          display: "flex",
          flexDirection: "column",
          gap: "20px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${colors.border}`, paddingBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
          <div>
            <h3 style={{ fontSize: "16px", fontWeight: "900", color: colors.textPrimary, margin: 0 }}>
              Clinical Assessment Report & Treatment Strategy
            </h3>
            <span style={{ fontSize: "11px", color: colors.textMuted }}>
              Patient: <strong>{patient.profile.name || "Untitled Intake"}</strong> (#{patient.ref}) • Editable per clinical protocol
            </span>
          </div>

          <button
            onClick={handleSaveAssessment}
            className="btn-print-hide"
            style={{
              padding: "8px 18px",
              borderRadius: "10px",
              backgroundColor: "#8b0018",
              color: "#ffffff",
              fontSize: "12px",
              fontWeight: "800",
              boxShadow: "0 2px 10px rgba(139, 0, 24, 0.35)",
            }}
          >
            Save Assessment Report
          </button>
        </div>

        {/* Primary Diagnosis & Triage Priority */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "16px" }}>
          <div>
            <label style={{ fontSize: "12px", fontWeight: "700", color: colors.textPrimary, display: "block", marginBottom: "6px" }}>
              Primary Diagnostic Impression
            </label>
            <input
              type="text"
              value={assessmentForm.diagnosisImpression || ""}
              placeholder="e.g. Equivocal exercise-induced ST depression with borderline ischemic risk"
              onChange={(e) => setAssessmentForm({ ...assessmentForm, diagnosisImpression: e.target.value })}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: "10px",
                fontSize: "13px",
                backgroundColor: colors.bgInput,
                color: colors.textPrimary,
                border: `1px solid ${colors.border}`,
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: "12px", fontWeight: "700", color: colors.textPrimary, display: "block", marginBottom: "6px" }}>
              Clinical Triage Priority
            </label>
            <select
              value={assessmentForm.triageLevel || "Uncertainty-Aware Clinical Triage"}
              onChange={(e) => setAssessmentForm({ ...assessmentForm, triageLevel: e.target.value })}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "10px",
                fontSize: "12px",
                fontWeight: "700",
                backgroundColor: colors.bgInput,
                color: colors.textPrimary,
                border: `1px solid ${colors.border}`,
              }}
            >
              <option value="Urgent Inpatient Cardiac Catheterization">Urgent Inpatient Cardiac Cath</option>
              <option value="Cardiology Fast-Track Referral">Cardiology Fast-Track Referral</option>
              <option value="Uncertainty-Aware Clinical Triage">Uncertainty-Aware Clinical Triage</option>
              <option value="Outpatient Diagnostic Workup">Outpatient Diagnostic Workup</option>
              <option value="Low Risk (Calibrated)">Low Risk (Calibrated Routine Follow-up)</option>
            </select>
          </div>
        </div>

        {/* Attending Cardiologist Notes */}
        <div>
          <label style={{ fontSize: "12px", fontWeight: "700", color: colors.textPrimary, display: "block", marginBottom: "6px" }}>
            Attending Cardiologist's Impression & Detailed Assessment
          </label>
          <textarea
            rows={4}
            value={assessmentForm.doctorNotes || ""}
            placeholder="Document patient clinical signs, rationale for triage decision, and interpretation of Bayesian credible interval..."
            onChange={(e) => setAssessmentForm({ ...assessmentForm, doctorNotes: e.target.value })}
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: "10px",
              fontSize: "12px",
              lineHeight: "1.6",
              backgroundColor: colors.bgInput,
              color: colors.textPrimary,
              border: `1px solid ${colors.border}`,
              resize: "vertical",
            }}
          />
        </div>

        {/* Secondary Diagnostic Workups */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <label style={{ fontSize: "12px", fontWeight: "700", color: colors.textPrimary }}>
              Secondary Diagnostic Tests & Ordered Workups
            </label>
            <button
              onClick={handleAddTest}
              className="btn-print-hide"
              style={{
                fontSize: "11px",
                fontWeight: "800",
                color: "#e52e4d",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <PlusIcon className="w-3.5 h-3.5" />
              <span>Add Test</span>
            </button>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {(assessmentForm.secondaryTestsOrdered || []).map((test, idx) => (
              <span
                key={idx}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "6px 12px",
                  borderRadius: "8px",
                  backgroundColor: colors.bgSubtle,
                  color: colors.textPrimary,
                  border: `1px solid ${colors.border}`,
                  fontSize: "12px",
                  fontWeight: "600",
                }}
              >
                <span>{test}</span>
                <button
                  onClick={() => handleRemoveTest(idx)}
                  className="btn-print-hide"
                  style={{ color: "#ef4444", fontSize: "14px", fontWeight: "900", lineHeight: 1 }}
                >
                  ×
                </button>
              </span>
            ))}
            {(!assessmentForm.secondaryTestsOrdered || assessmentForm.secondaryTestsOrdered.length === 0) && (
              <span style={{ fontSize: "12px", color: colors.textMuted }}>
                No secondary tests ordered yet. Click "+ Add Test" to append workups.
              </span>
            )}
          </div>
        </div>

        {/* Pharmacotherapy & Care Plan */}
        <div>
          <label style={{ fontSize: "12px", fontWeight: "700", color: colors.textPrimary, display: "block", marginBottom: "6px" }}>
            Pharmacotherapy & Care Plan
          </label>
          <textarea
            rows={3}
            value={assessmentForm.prescriptionPlan || ""}
            placeholder="e.g. Atorvastatin 20mg q.h.s., Lifestyle & aerobic exercise (Zone 2, 150 min/wk), Low sodium DASH diet."
            onChange={(e) => setAssessmentForm({ ...assessmentForm, prescriptionPlan: e.target.value })}
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: "10px",
              fontSize: "12px",
              lineHeight: "1.6",
              backgroundColor: colors.bgInput,
              color: colors.textPrimary,
              border: `1px solid ${colors.border}`,
              resize: "vertical",
            }}
          />
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
/* =========================================================================
   VIEW 2: BAYESIAN REPORT VIEW (Triage-Aware Risk Inference Engine)
   ========================================================================= */
function BayesianReportView({
  patient,
  updatePatient,
  inference,
  colors,
  isDark,
  onNavigateToAssessment,
  showToast,
  onLoadBenchmark,
}) {
  // Dual-view switch: Clinician View vs Patient View (FR-8)
  const [viewMode, setViewMode] = useState("clinician"); // 'clinician' | 'patient'

  // Validation errors map (FR-4)
  const [fieldErrors, setFieldErrors] = useState({});

  // Submission loading state (FR-7)
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Network/Server alert state (IR-3)
  const [apiAlert, setApiAlert] = useState(null);

  // Screen reader announcement state (AR-4)
  const [srAnnouncement, setSrAnnouncement] = useState("");

  // Live Model Provenance & Hyperparameters (BR-3, FR-19)
  const [modelInfo, setModelInfo] = useState(null);

  useEffect(() => {
    let isMounted = true;
    fetchModelInfo().then((info) => {
      if (isMounted && info) {
        setModelInfo(info);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const updateVital = (key, val) => {
    updatePatient((prev) => ({
      ...prev,
      vitals: {
        ...prev.vitals,
        [key]: val,
      },
    }));

    // Clear error for field if now valid
    if (fieldErrors[key]) {
      const updatedVitals = { ...patient.vitals, [key]: val };
      const errs = validateVitals(updatedVitals);
      setFieldErrors((prev) => ({ ...prev, [key]: errs[key] }));
    }
  };

  const handleBlurField = (key) => {
    const errs = validateVitals(patient.vitals);
    setFieldErrors((prev) => ({ ...prev, [key]: errs[key] }));
  };

  // Explicit "Assess Risk" trigger (FR-6, FR-7, IR-1, IR-3)
  const handleAssessRisk = async (e) => {
    if (e) e.preventDefault();

    // 1. Validate all fields (FR-2, FR-3, FR-4)
    const errs = validateVitals(patient.vitals);
    setFieldErrors(errs);
    if (!isVitalsValid(errs)) {
      setApiAlert({
        type: "error",
        message: "Please correct the highlighted clinical fields before assessing risk.",
      });
      return;
    }

    setApiAlert(null);
    setIsSubmitting(true);
    setSrAnnouncement("Assessing cardiovascular risk through Bayesian inference engine...");

    try {
      // 2. Submit to POST /predict (IR-1, IR-2)
      const apiResp = await callPredictAPI(patient.vitals);
      const computedInference = mapApiResponseToInference(apiResp);

      updatePatient((prev) => ({
        ...prev,
        lastInference: computedInference,
      }));

      setApiAlert({
        type: "success",
        message: "Live prediction computed from FastAPI prediction backend (/predict).",
      });
      setSrAnnouncement(
        `Risk assessment complete. Posterior probability: ${(computedInference.bayesP * 100).toFixed(1)} percent.`
      );
      showToast("✓ Live Bayesian inference calculated from backend");
    } catch (err) {
      // 3. Fallback to calibrated illustrative model with recoverable alert (IR-3, SR-2, FR-21)
      const fallbackInference = computeCalibratedIllustrativeInference(patient.vitals);

      updatePatient((prev) => ({
        ...prev,
        lastInference: fallbackInference,
      }));

      setApiAlert({
        type: "warning",
        message: `Prediction backend at http://localhost:8000 unreachable (${err.message}). Showing calibrated illustrative Bayesian inference for coursework demo.`,
      });
      setSrAnnouncement(
        `Calibrated demo assessment complete. Posterior probability: ${(fallbackInference.bayesP * 100).toFixed(1)} percent.`
      );
      showToast("✓ Calibrated illustrative Bayesian inference computed");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Clear Assessment & Reset Form (FR-9)
  const handleClearAssessment = () => {
    updatePatient((prev) => ({
      ...prev,
      vitals: {
        age: "",
        sex: 1,
        cp: 0,
        trestbps: "",
        chol: "",
        fbs: 0,
        thalach: "",
        exang: 0,
        oldpeak: "",
      },
      lastInference: null,
    }));
    setFieldErrors({});
    setApiAlert(null);
    setSrAnnouncement("Assessment vitals cleared and reset.");
    showToast("✓ Assessment form reset to blank");
  };

  // Load Calibrated Benchmark Case
  const handleLoadBenchmarkSample = () => {
    const sample = getBenchmarkSamplePatient();
    const benchmarkInference = computeCalibratedIllustrativeInference(sample.vitals);
    updatePatient((prev) => ({
      ...prev,
      vitals: sample.vitals,
      lastInference: benchmarkInference,
    }));
    setFieldErrors({});
    setApiAlert(null);
    setSrAnnouncement("Loaded UCI Heart Disease calibration benchmark case.");
    showToast("✓ Calibrated benchmark case loaded for testing");
  };

  const isComplete = inference?.isComputed;
  const bayesPct = isComplete ? (inference.bayesP * 100).toFixed(1) : null;
  const svmPct = isComplete && inference.svmP != null ? (inference.svmP * 100).toFixed(1) : null;
  const lowerPct = isComplete ? (inference.lower * 100).toFixed(1) : null;
  const upperPct = isComplete ? (inference.upper * 100).toFixed(1) : null;
  const ciWidthPct = isComplete ? (inference.ciWidth * 100).toFixed(1) : null;
  const sigmaPct = isComplete ? (inference.sigma * 100).toFixed(1) : null;
  const isConfident = inference?.sigma <= CALIBRATED_TRIAGE_SIGMA_THRESHOLD;

  // Max absolute impact for scaling contribution bars
  const maxAbsContrib = useMemo(() => {
    if (!inference?.contribs || inference.contribs.length === 0) return 1.0;
    return Math.max(...inference.contribs.map((c) => Math.abs(c.impact ?? c.v ?? 0)), 0.6);
  }, [inference]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Screen reader live region for accessibility (AR-4) */}
      <div role="status" aria-live="polite" style={{ position: "absolute", width: "1px", height: "1px", margin: "-1px", overflow: "hidden", clip: "rect(0, 0, 0, 0)", border: 0 }}>
        {srAnnouncement}
      </div>

      {/* Top Banner with Navigation */}
      <div
        style={{
          backgroundColor: colors.bgCard,
          borderRadius: "20px",
          border: `1px solid ${colors.border}`,
          padding: "20px 24px",
          boxShadow: colors.shadow,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "14px",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "10px", fontWeight: "800", textTransform: "uppercase", color: "#e52e4d", letterSpacing: "0.08em" }}>
              Probabilistic Machine Learning Engine
            </span>
            {inference?.fromBackend ? (
              <span style={{ fontSize: "10px", fontWeight: "800", padding: "2px 8px", borderRadius: "999px", backgroundColor: "#065f46", color: "#6ee7b7" }}>
                ● Live API Connected
              </span>
            ) : isComplete ? (
              <span style={{ fontSize: "10px", fontWeight: "800", padding: "2px 8px", borderRadius: "999px", backgroundColor: isDark ? "rgba(245, 158, 11, 0.2)" : "#fef3c7", color: isDark ? "#fbbf24" : "#b45309" }}>
                Illustrative Scoring (Demo Mode)
              </span>
            ) : null}
          </div>
          <h2 style={{ fontSize: "22px", fontWeight: "900", color: colors.textPrimary, margin: "4px 0" }}>
            Bayesian Risk Inference & Uncertainty Quantification
          </h2>
          <p style={{ fontSize: "12px", color: colors.textMuted, margin: 0 }}>
            Collects 9 clinical parameters, quantifies epistemic uncertainty via 95% Credible Interval (HDI), and computes calibrated triage.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <button
            onClick={handleLoadBenchmarkSample}
            style={{
              padding: "9px 14px",
              borderRadius: "10px",
              backgroundColor: colors.bgSubtle,
              color: colors.textPrimary,
              border: `1px solid ${colors.border}`,
              fontSize: "12px",
              fontWeight: "700",
              minHeight: "44px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
            title="Preload calibrated UCI benchmark test case"
          >
            <span>⚡ Load Calibration Case</span>
          </button>

          <button
            onClick={onNavigateToAssessment}
            style={{
              padding: "10px 18px",
              borderRadius: "10px",
              background: "linear-gradient(90deg, #8b0018 0%, #e52e4d 100%)",
              color: "#ffffff",
              fontSize: "12px",
              fontWeight: "800",
              minHeight: "44px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              boxShadow: "0 3px 12px rgba(139, 0, 24, 0.4)",
            }}
          >
            <span>Continue to Clinical Assessment</span>
            <ChevronRightIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Recoverable API Error / Warning Notice (IR-3, SR-2) */}
      {apiAlert && (
        <div
          role="alert"
          style={{
            padding: "12px 18px",
            borderRadius: "14px",
            fontSize: "12px",
            fontWeight: "600",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            backgroundColor:
              apiAlert.type === "error"
                ? isDark ? "rgba(139, 0, 24, 0.3)" : "#fee2e2"
                : apiAlert.type === "success"
                  ? isDark ? "rgba(6, 95, 70, 0.3)" : "#d1fae5"
                  : isDark ? "rgba(245, 158, 11, 0.2)" : "#fef3c7",
            color:
              apiAlert.type === "error"
                ? isDark ? "#fca5a5" : "#991b1b"
                : apiAlert.type === "success"
                  ? isDark ? "#6ee7b7" : "#065f46"
                  : isDark ? "#fde68a" : "#92400e",
            border: `1px solid ${apiAlert.type === "error" ? "#ef4444" : apiAlert.type === "success" ? "#10b981" : "#f59e0b"
              }`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span>{apiAlert.type === "error" ? "⚠️" : apiAlert.type === "success" ? "✓" : "ℹ️"}</span>
            <span>{apiAlert.message}</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {apiAlert.canRetry && (
              <button
                onClick={handleAssessRisk}
                disabled={isSubmitting}
                style={{
                  padding: "4px 10px",
                  borderRadius: "6px",
                  fontSize: "11px",
                  fontWeight: "800",
                  backgroundColor: "#8b0018",
                  color: "#ffffff",
                }}
              >
                Retry Backend
              </button>
            )}
            <button
              onClick={() => setApiAlert(null)}
              style={{ fontSize: "16px", fontWeight: "800", padding: "0 6px", cursor: "pointer" }}
              aria-label="Dismiss alert"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Main Grid: Left Input Controls (FR-1 to FR-5) | Right Output Views (FR-8 to FR-20) */}
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: "24px" }}>
        {/* =========================================================================
            LEFT COLUMN: 9 CLINICAL PARAMETER INPUTS (FR-1, FR-2, FR-3, FR-4, FR-5)
            ========================================================================= */}
        <form
          onSubmit={handleAssessRisk}
          noValidate
          style={{
            backgroundColor: colors.bgCard,
            borderRadius: "20px",
            border: `1px solid ${colors.border}`,
            padding: "24px",
            boxShadow: colors.shadow,
            display: "flex",
            flexDirection: "column",
            gap: "18px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${colors.border}`, paddingBottom: "12px" }}>
            <div>
              <h3 style={{ fontSize: "15px", fontWeight: "800", color: colors.textPrimary, margin: 0 }}>
                Clinical Hemodynamics & Vitals
              </h3>
              <span style={{ fontSize: "11px", color: colors.textMuted }}>
                Patient: <strong>{patient.profile.name || "Intake Record"}</strong> (#{patient.ref})
              </span>
            </div>
            <span style={{ fontSize: "11px", fontWeight: "700", color: "#e52e4d" }}>
              9 Parameters Required (FR-1, FR-3)
            </span>
          </div>

          {/* 1. Age & 2. Sex */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
            {/* Age */}
            <div>
              <label
                htmlFor="vital-age"
                style={{ fontSize: "11px", fontWeight: "700", color: colors.textPrimary, display: "flex", justifyContent: "space-between", marginBottom: "4px" }}
              >
                <span>Age <span style={{ color: "#e52e4d" }}>*</span></span>
                <span style={{ fontSize: "10px", color: colors.textMuted }}>18–100 years</span>
              </label>
              <input
                id="vital-age"
                type="number"
                min="18"
                max="100"
                step="1"
                required
                placeholder="e.g. 54"
                value={patient.vitals.age ?? ""}
                onChange={(e) => updateVital("age", e.target.value === "" ? "" : Number(e.target.value))}
                onBlur={() => handleBlurField("age")}
                aria-invalid={fieldErrors.age ? "true" : "false"}
                aria-describedby={fieldErrors.age ? "error-vital-age" : undefined}
                style={{
                  width: "100%",
                  minHeight: "44px",
                  padding: "9px 12px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontFamily: "var(--font-mono)",
                  backgroundColor: colors.bgInput,
                  color: colors.textPrimary,
                  border: `1px solid ${fieldErrors.age ? "#ef4444" : colors.border}`,
                }}
              />
              <span style={{ fontSize: "10px", color: colors.textMuted, display: "block", marginTop: "2px" }}>
                Patient's chronological age in years
              </span>
              {fieldErrors.age && (
                <span id="error-vital-age" role="alert" style={{ fontSize: "11px", fontWeight: "700", color: "#ef4444", display: "block", marginTop: "2px" }}>
                  {fieldErrors.age}
                </span>
              )}
            </div>

            {/* Sex */}
            <div>
              <label
                id="label-vital-sex"
                style={{ fontSize: "11px", fontWeight: "700", color: colors.textPrimary, display: "flex", justifyContent: "space-between", marginBottom: "4px" }}
              >
                <span>Biological Sex <span style={{ color: "#e52e4d" }}>*</span></span>
                <span style={{ fontSize: "10px", color: colors.textMuted }}>Assigned at birth</span>
              </label>
              <div role="group" aria-labelledby="label-vital-sex" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                {[
                  { val: 1, label: "Male (1)" },
                  { val: 0, label: "Female (0)" },
                ].map((s) => (
                  <button
                    key={s.val}
                    type="button"
                    onClick={() => updateVital("sex", s.val)}
                    style={{
                      minHeight: "44px",
                      padding: "8px",
                      borderRadius: "8px",
                      fontSize: "12px",
                      fontWeight: "700",
                      backgroundColor: Number(patient.vitals.sex) === s.val ? "#8b0018" : colors.bgSubtle,
                      color: Number(patient.vitals.sex) === s.val ? "#ffffff" : colors.textMuted,
                      border: `1px solid ${Number(patient.vitals.sex) === s.val ? "#e52e4d" : colors.border}`,
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <span style={{ fontSize: "10px", color: colors.textMuted, display: "block", marginTop: "2px" }}>
                Epidemiological baseline risk factor
              </span>
            </div>
          </div>

          {/* 3. Chest Pain Presentation (CP) */}
          <div>
            <label
              id="label-vital-cp"
              style={{ fontSize: "11px", fontWeight: "700", color: colors.textPrimary, display: "flex", justifyContent: "space-between", marginBottom: "6px" }}
            >
              <span>Chest Pain Type (CP) <span style={{ color: "#e52e4d" }}>*</span></span>
              <span style={{ fontSize: "10px", color: colors.textMuted }}>ACC/AHA criteria</span>
            </label>
            <div role="group" aria-labelledby="label-vital-cp" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
              {[
                { val: 0, label: "Typical Angina (0)", desc: "Substernal pressure with exertion" },
                { val: 1, label: "Atypical Angina (1)", desc: "Pleuritic or fleeting chest pain" },
                { val: 2, label: "Non-Anginal (2)", desc: "Musculoskeletal or GI etiology" },
                { val: 3, label: "Asymptomatic (3)", desc: "Silent ischemia or no complaints" },
              ].map((cp) => (
                <button
                  key={cp.val}
                  type="button"
                  onClick={() => updateVital("cp", cp.val)}
                  style={{
                    minHeight: "44px",
                    padding: "8px 10px",
                    borderRadius: "8px",
                    fontSize: "11px",
                    fontWeight: "600",
                    textAlign: "left",
                    backgroundColor: Number(patient.vitals.cp) === cp.val ? "#8b0018" : colors.bgSubtle,
                    color: Number(patient.vitals.cp) === cp.val ? "#ffffff" : colors.textPrimary,
                    border: `1px solid ${Number(patient.vitals.cp) === cp.val ? "#e52e4d" : colors.border}`,
                  }}
                >
                  <span style={{ display: "block", fontWeight: "700" }}>{cp.label}</span>
                  <span style={{ fontSize: "9px", opacity: 0.8, display: "block" }}>{cp.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 4. Resting BP & 5. Cholesterol */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            {/* Resting BP */}
            <div>
              <label
                htmlFor="vital-trestbps"
                style={{ fontSize: "11px", fontWeight: "700", color: colors.textPrimary, display: "flex", justifyContent: "space-between", marginBottom: "4px" }}
              >
                <span>Resting BP <span style={{ color: "#e52e4d" }}>*</span></span>
                <span style={{ fontSize: "10px", color: colors.textMuted }}>80–220 mm Hg</span>
              </label>
              <input
                id="vital-trestbps"
                type="number"
                min="80"
                max="220"
                step="1"
                required
                placeholder="e.g. 130"
                value={patient.vitals.trestbps ?? ""}
                onChange={(e) => updateVital("trestbps", e.target.value === "" ? "" : Number(e.target.value))}
                onBlur={() => handleBlurField("trestbps")}
                aria-invalid={fieldErrors.trestbps ? "true" : "false"}
                aria-describedby={fieldErrors.trestbps ? "error-vital-trestbps" : undefined}
                style={{
                  width: "100%",
                  minHeight: "44px",
                  padding: "9px 12px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontFamily: "var(--font-mono)",
                  backgroundColor: colors.bgInput,
                  color: colors.textPrimary,
                  border: `1px solid ${fieldErrors.trestbps ? "#ef4444" : colors.border}`,
                }}
              />
              <span style={{ fontSize: "10px", color: colors.textMuted, display: "block", marginTop: "2px" }}>
                Resting systolic arterial pressure (mm Hg)
              </span>
              {fieldErrors.trestbps && (
                <span id="error-vital-trestbps" role="alert" style={{ fontSize: "11px", fontWeight: "700", color: "#ef4444", display: "block", marginTop: "2px" }}>
                  {fieldErrors.trestbps}
                </span>
              )}
            </div>

            {/* Cholesterol */}
            <div>
              <label
                htmlFor="vital-chol"
                style={{ fontSize: "11px", fontWeight: "700", color: colors.textPrimary, display: "flex", justifyContent: "space-between", marginBottom: "4px" }}
              >
                <span>Cholesterol <span style={{ color: "#e52e4d" }}>*</span></span>
                <span style={{ fontSize: "10px", color: colors.textMuted }}>100–600 mg/dl</span>
              </label>
              <input
                id="vital-chol"
                type="number"
                min="100"
                max="600"
                step="1"
                required
                placeholder="e.g. 240"
                value={patient.vitals.chol ?? ""}
                onChange={(e) => updateVital("chol", e.target.value === "" ? "" : Number(e.target.value))}
                onBlur={() => handleBlurField("chol")}
                aria-invalid={fieldErrors.chol ? "true" : "false"}
                aria-describedby={fieldErrors.chol ? "error-vital-chol" : undefined}
                style={{
                  width: "100%",
                  minHeight: "44px",
                  padding: "9px 12px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontFamily: "var(--font-mono)",
                  backgroundColor: colors.bgInput,
                  color: colors.textPrimary,
                  border: `1px solid ${fieldErrors.chol ? "#ef4444" : colors.border}`,
                }}
              />
              <span style={{ fontSize: "10px", color: colors.textMuted, display: "block", marginTop: "2px" }}>
                Total serum cholesterol assay (mg/dl)
              </span>
              {fieldErrors.chol && (
                <span id="error-vital-chol" role="alert" style={{ fontSize: "11px", fontWeight: "700", color: "#ef4444", display: "block", marginTop: "2px" }}>
                  {fieldErrors.chol}
                </span>
              )}
            </div>
          </div>

          {/* 6. Fasting Blood Sugar (FBS) & 7. Max Heart Rate (Thalach) */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            {/* Max HR */}
            <div>
              <label
                htmlFor="vital-thalach"
                style={{ fontSize: "11px", fontWeight: "700", color: colors.textPrimary, display: "flex", justifyContent: "space-between", marginBottom: "4px" }}
              >
                <span>Max Heart Rate <span style={{ color: "#e52e4d" }}>*</span></span>
                <span style={{ fontSize: "10px", color: colors.textMuted }}>60–220 bpm</span>
              </label>
              <input
                id="vital-thalach"
                type="number"
                min="60"
                max="220"
                step="1"
                required
                placeholder="e.g. 150"
                value={patient.vitals.thalach ?? ""}
                onChange={(e) => updateVital("thalach", e.target.value === "" ? "" : Number(e.target.value))}
                onBlur={() => handleBlurField("thalach")}
                aria-invalid={fieldErrors.thalach ? "true" : "false"}
                aria-describedby={fieldErrors.thalach ? "error-vital-thalach" : undefined}
                style={{
                  width: "100%",
                  minHeight: "44px",
                  padding: "9px 12px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontFamily: "var(--font-mono)",
                  backgroundColor: colors.bgInput,
                  color: colors.textPrimary,
                  border: `1px solid ${fieldErrors.thalach ? "#ef4444" : colors.border}`,
                }}
              />
              <span style={{ fontSize: "10px", color: colors.textMuted, display: "block", marginTop: "2px" }}>
                Maximum achieved heart rate on stress test (bpm)
              </span>
              {fieldErrors.thalach && (
                <span id="error-vital-thalach" role="alert" style={{ fontSize: "11px", fontWeight: "700", color: "#ef4444", display: "block", marginTop: "2px" }}>
                  {fieldErrors.thalach}
                </span>
              )}
            </div>

            {/* ST Depression */}
            <div>
              <label
                htmlFor="vital-oldpeak"
                style={{ fontSize: "11px", fontWeight: "700", color: colors.textPrimary, display: "flex", justifyContent: "space-between", marginBottom: "4px" }}
              >
                <span>ST Depression (Oldpeak)</span>
                <span style={{ fontSize: "10px", color: colors.textMuted }}>0–6.0 mm (step 0.1)</span>
              </label>
              <input
                id="vital-oldpeak"
                type="number"
                min="0"
                max="6"
                step="0.1"
                placeholder="e.g. 1.0"
                value={patient.vitals.oldpeak ?? ""}
                onChange={(e) => updateVital("oldpeak", e.target.value === "" ? "" : Number(e.target.value))}
                onBlur={() => handleBlurField("oldpeak")}
                aria-invalid={fieldErrors.oldpeak ? "true" : "false"}
                aria-describedby={fieldErrors.oldpeak ? "error-vital-oldpeak" : undefined}
                style={{
                  width: "100%",
                  minHeight: "44px",
                  padding: "9px 12px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontFamily: "var(--font-mono)",
                  backgroundColor: colors.bgInput,
                  color: colors.textPrimary,
                  border: `1px solid ${fieldErrors.oldpeak ? "#ef4444" : colors.border}`,
                }}
              />
              <span style={{ fontSize: "10px", color: colors.textMuted, display: "block", marginTop: "2px" }}>
                Exercise-induced ST depression relative to rest (mm)
              </span>
              {fieldErrors.oldpeak && (
                <span id="error-vital-oldpeak" role="alert" style={{ fontSize: "11px", fontWeight: "700", color: "#ef4444", display: "block", marginTop: "2px" }}>
                  {fieldErrors.oldpeak}
                </span>
              )}
            </div>
          </div>

          {/* 8. Exercise Angina & 9. Fasting Blood Sugar Toggles */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            {/* Exang */}
            <div>
              <label id="label-vital-exang" style={{ fontSize: "11px", fontWeight: "700", color: colors.textPrimary, display: "block", marginBottom: "4px" }}>
                Exercise Angina (Exang)
              </label>
              <button
                type="button"
                aria-labelledby="label-vital-exang"
                onClick={() => updateVital("exang", Number(patient.vitals.exang) === 1 ? 0 : 1)}
                style={{
                  width: "100%",
                  minHeight: "44px",
                  padding: "8px 10px",
                  borderRadius: "8px",
                  textAlign: "left",
                  backgroundColor: Number(patient.vitals.exang) === 1 ? "#8b0018" : colors.bgSubtle,
                  color: Number(patient.vitals.exang) === 1 ? "#ffffff" : colors.textPrimary,
                  border: `1px solid ${Number(patient.vitals.exang) === 1 ? "#e52e4d" : colors.border}`,
                }}
              >
                <span style={{ fontSize: "10px", display: "block", color: Number(patient.vitals.exang) === 1 ? "#ffd1dc" : colors.textMuted }}>
                  Ischemic pain induced by stress
                </span>
                <span style={{ fontSize: "12px", fontWeight: "800" }}>
                  {Number(patient.vitals.exang) === 1 ? "Positive (Yes, 1)" : "Negative (None, 0)"}
                </span>
              </button>
            </div>

            {/* FBS */}
            <div>
              <label id="label-vital-fbs" style={{ fontSize: "11px", fontWeight: "700", color: colors.textPrimary, display: "block", marginBottom: "4px" }}>
                Fasting Blood Sugar (FBS)
              </label>
              <button
                type="button"
                aria-labelledby="label-vital-fbs"
                onClick={() => updateVital("fbs", Number(patient.vitals.fbs) === 1 ? 0 : 1)}
                style={{
                  width: "100%",
                  minHeight: "44px",
                  padding: "8px 10px",
                  borderRadius: "8px",
                  textAlign: "left",
                  backgroundColor: Number(patient.vitals.fbs) === 1 ? "#8b0018" : colors.bgSubtle,
                  color: Number(patient.vitals.fbs) === 1 ? "#ffffff" : colors.textPrimary,
                  border: `1px solid ${Number(patient.vitals.fbs) === 1 ? "#e52e4d" : colors.border}`,
                }}
              >
                <span style={{ fontSize: "10px", display: "block", color: Number(patient.vitals.fbs) === 1 ? "#ffd1dc" : colors.textMuted }}>
                  Metabolic biomarker threshold
                </span>
                <span style={{ fontSize: "12px", fontWeight: "800" }}>
                  {Number(patient.vitals.fbs) === 1 ? "Elevated (> 120 mg/dl, 1)" : "Normal (≤ 120 mg/dl, 0)"}
                </span>
              </button>
            </div>
          </div>

          {/* Explicit Form Submission Actions (FR-6, FR-7, FR-9) */}
          <div style={{ display: "flex", gap: "10px", marginTop: "8px", paddingTop: "14px", borderTop: `1px solid ${colors.border}` }}>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                flex: 1,
                minHeight: "46px",
                borderRadius: "12px",
                background: isSubmitting ? "#6b7280" : "linear-gradient(90deg, #8b0018 0%, #e52e4d 100%)",
                color: "#ffffff",
                fontSize: "13px",
                fontWeight: "800",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                boxShadow: isSubmitting ? "none" : "0 4px 16px rgba(229, 46, 77, 0.4)",
                cursor: isSubmitting ? "not-allowed" : "pointer",
                transition: "all 0.2s ease",
              }}
            >
              {isSubmitting ? (
                <>
                  <span style={{ display: "inline-block", width: "16px", height: "16px", border: "2px solid #ffffff", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                  <span>Assessing Risk...</span>
                </>
              ) : (
                <>
                  <PulseIcon className="w-4 h-4" />
                  <span>Assess Risk (Predict)</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleClearAssessment}
              disabled={isSubmitting}
              style={{
                minHeight: "46px",
                padding: "0 16px",
                borderRadius: "12px",
                backgroundColor: colors.bgSubtle,
                color: colors.textPrimary,
                border: `1px solid ${colors.border}`,
                fontSize: "12px",
                fontWeight: "700",
              }}
              title="Reset all vitals to blank (FR-9)"
            >
              Clear
            </button>
          </div>
        </form>

        {/* =========================================================================
            RIGHT COLUMN: OUTPUT DASHBOARD WITH DUAL-VIEW SWITCH (FR-8 to FR-21)
            ========================================================================= */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Dual-View Switch Header (FR-8) */}
          <div
            style={{
              backgroundColor: colors.bgCard,
              borderRadius: "16px",
              border: `1px solid ${colors.border}`,
              padding: "10px 14px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "8px",
            }}
          >
            <span style={{ fontSize: "11px", fontWeight: "800", color: colors.textMuted, textTransform: "uppercase" }}>
              Assessment View:
            </span>

            {/* Segmented Control: Clinician View vs Patient View */}
            <div style={{ display: "flex", backgroundColor: colors.bgSubtle, padding: "3px", borderRadius: "10px", border: `1px solid ${colors.border}` }}>
              <button
                type="button"
                onClick={() => setViewMode("clinician")}
                style={{
                  minHeight: "36px",
                  padding: "6px 14px",
                  borderRadius: "8px",
                  fontSize: "12px",
                  fontWeight: "800",
                  backgroundColor: viewMode === "clinician" ? "#8b0018" : "transparent",
                  color: viewMode === "clinician" ? "#ffffff" : colors.textMuted,
                  boxShadow: viewMode === "clinician" ? "0 2px 8px rgba(139, 0, 24, 0.35)" : "none",
                  transition: "all 0.15s ease",
                }}
              >
                🩺 Clinician View
              </button>
              <button
                type="button"
                onClick={() => setViewMode("patient")}
                style={{
                  minHeight: "36px",
                  padding: "6px 14px",
                  borderRadius: "8px",
                  fontSize: "12px",
                  fontWeight: "800",
                  backgroundColor: viewMode === "patient" ? "#8b0018" : "transparent",
                  color: viewMode === "patient" ? "#ffffff" : colors.textMuted,
                  boxShadow: viewMode === "patient" ? "0 2px 8px rgba(139, 0, 24, 0.35)" : "none",
                  transition: "all 0.15s ease",
                }}
              >
                👤 Patient View
              </button>
            </div>
          </div>

          {!isComplete ? (
            /* Blank / Awaiting state */
            <div
              style={{
                backgroundColor: colors.bgCard,
                borderRadius: "20px",
                border: `1px solid ${colors.border}`,
                padding: "48px 24px",
                boxShadow: colors.shadow,
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "12px",
              }}
            >
              <div style={{ width: "52px", height: "52px", borderRadius: "14px", backgroundColor: isDark ? "#240610" : "#fff1f3", color: "#e52e4d", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <ActivityIcon className="w-7 h-7" />
              </div>
              <h3 style={{ fontSize: "16px", fontWeight: "900", color: colors.textPrimary, margin: 0 }}>
                Awaiting Risk Assessment
              </h3>
              <p style={{ fontSize: "12px", color: colors.textMuted, maxWidth: "340px", margin: 0, lineHeight: "1.5" }}>
                Fill the 9 clinical parameters on the left and tap <strong>Assess Risk</strong> to calculate calibrated Bayesian posterior distributions and 95% Credible Intervals.
              </p>
              <button
                onClick={handleLoadBenchmarkSample}
                style={{
                  marginTop: "8px",
                  padding: "8px 16px",
                  borderRadius: "10px",
                  backgroundColor: colors.bgSubtle,
                  color: "#e52e4d",
                  fontSize: "12px",
                  fontWeight: "800",
                  border: `1px solid ${colors.border}`,
                }}
              >
                Or Load Calibration Benchmark Case
              </button>
            </div>
          ) : viewMode === "patient" ? (
            /* =========================================================================
                PATIENT VIEW (FR-11, FR-12, FR-13, FR-14, SR-3)
                ========================================================================= */
            <div
              aria-live="polite"
              style={{
                backgroundColor: colors.bgCard,
                borderRadius: "20px",
                border: `1px solid ${colors.border}`,
                padding: "24px",
                boxShadow: colors.shadow,
                display: "flex",
                flexDirection: "column",
                gap: "20px",
              }}
            >
              <div style={{ borderBottom: `1px solid ${colors.border}`, paddingBottom: "10px" }}>
                <span style={{ fontSize: "10px", fontWeight: "800", textTransform: "uppercase", color: "#e52e4d" }}>
                  Patient-Friendly Summary
                </span>
                <h3 style={{ fontSize: "16px", fontWeight: "900", color: colors.textPrimary, margin: "2px 0 0 0" }}>
                  Your Cardiovascular Risk Overview
                </h3>
              </div>

              {/* Single Overall Risk Ring (FR-11, FR-12) */}
              <PatientRiskHeroRing
                riskPct={Math.round(inference.bayesP * 100)}
                isConfident={isConfident}
                isDark={isDark}
              />

              {/* Plain-Language Explanation (FR-13) */}
              <div
                style={{
                  backgroundColor: colors.bgSubtle,
                  borderRadius: "14px",
                  padding: "16px",
                  border: `1px solid ${colors.border}`,
                }}
              >
                <div style={{ fontSize: "12px", fontWeight: "800", color: colors.textPrimary, marginBottom: "6px" }}>
                  What does this score mean?
                </div>
                <p style={{ fontSize: "12px", color: colors.textSecondary, lineHeight: "1.6", margin: 0 }}>
                  Based on your resting blood pressure ({patient.vitals.trestbps || 120} mm Hg), cholesterol ({patient.vitals.chol || 200} mg/dl), and heart rate during exercise, our model estimates that your probability of significant heart risk is <strong>{bayesPct}%</strong>.
                  {" "}
                  {isConfident
                    ? `The algorithm is confident in this estimate (the calculated range is relatively narrow: ${lowerPct}% to ${upperPct}%).`
                    : `Because your numbers sit near the borderline, the model has wider uncertainty (ranging from ${lowerPct}% to ${upperPct}%). This indicates a case best reviewed in person with a doctor rather than relying on an automated estimate alone.`}
                </p>
              </div>

              {/* Practical Next-Step Suggestions Checklist (FR-14) */}
              <div>
                <div style={{ fontSize: "12px", fontWeight: "800", color: colors.textPrimary, marginBottom: "8px" }}>
                  Recommended Next Steps:
                </div>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
                  {[
                    "Schedule a formal in-person cardiovascular consultation with your physician.",
                    "Log resting blood pressure daily at home (morning and evening) for 1 week.",
                    "Review full lipid panel (LDL, HDL, triglycerides) at your next routine checkup.",
                    "Discuss an exercise prescription tailored to your heart rate tolerance (150 min/wk moderate activity).",
                  ].map((tip, idx) => (
                    <li
                      key={idx}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "8px",
                        fontSize: "12px",
                        color: colors.textSecondary,
                        lineHeight: "1.5",
                      }}
                    >
                      <span style={{ color: "#10b981", fontWeight: "900" }}>✓</span>
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Patient Non-Diagnostic Disclaimer (SR-3) */}
              <div
                style={{
                  fontSize: "11px",
                  color: colors.textMuted,
                  borderTop: `1px solid ${colors.border}`,
                  paddingTop: "12px",
                  lineHeight: "1.5",
                }}
              >
                <strong>Educational Notice:</strong> This estimated percentage is for educational discussion only and is <strong>not a medical diagnosis</strong>. Never start or modify prescription medications without clinical guidance from your healthcare provider.
              </div>
            </div>
          ) : (
            /* =========================================================================
                CLINICIAN VIEW (FR-15, FR-16, FR-17, FR-18, FR-19, FR-20, FR-21)
                ========================================================================= */
            <div
              aria-live="polite"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "20px",
              }}
            >
              {/* Comparative Model Stats Bento (FR-15, FR-16) */}
              <div
                style={{
                  backgroundColor: colors.bgCard,
                  borderRadius: "20px",
                  border: `1px solid ${colors.border}`,
                  padding: "20px",
                  boxShadow: colors.shadow,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                  <h4 style={{ fontSize: "13px", fontWeight: "800", color: colors.textPrimary, margin: 0 }}>
                    Deterministic Baseline vs. Bayesian Posterior (FR-15)
                  </h4>
                  <span style={{ fontSize: "10px", fontWeight: "700", color: "#e52e4d" }}>
                    Side-by-Side Comparison
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
                  {/* Bayesian Posterior Mean */}
                  <div style={{ backgroundColor: colors.bgSubtle, padding: "12px", borderRadius: "12px", border: `1px solid ${colors.border}` }}>
                    <div style={{ fontSize: "10px", fontWeight: "800", color: "#e52e4d", textTransform: "uppercase" }}>
                      Bayesian MAP Mean
                    </div>
                    <div style={{ fontSize: "20px", fontWeight: "900", color: colors.textPrimary, fontFamily: "var(--font-mono)", margin: "4px 0" }}>
                      {bayesPct}%
                    </div>
                    <div style={{ fontSize: "10px", color: colors.textMuted }}>
                      Posterior expected risk
                    </div>
                  </div>

                  {/* SVM Estimate */}
                  <div style={{ backgroundColor: colors.bgSubtle, padding: "12px", borderRadius: "12px", border: `1px solid ${colors.border}` }}>
                    <div style={{ fontSize: "10px", fontWeight: "800", color: colors.textMuted, textTransform: "uppercase" }}>
                      SVM Estimate (RBF)
                    </div>
                    <div style={{ fontSize: "20px", fontWeight: "900", color: colors.textPrimary, fontFamily: "var(--font-mono)", margin: "4px 0" }}>
                      {svmPct != null ? `${svmPct}%` : "---%"}
                    </div>
                    <div style={{ fontSize: "10px", color: colors.textMuted }}>
                      Platt-scaled deterministic
                    </div>
                  </div>

                  {/* 95% Credible Interval (FR-16) */}
                  <div style={{ backgroundColor: colors.bgSubtle, padding: "12px", borderRadius: "12px", border: `1px solid ${colors.border}` }}>
                    <div style={{ fontSize: "10px", fontWeight: "800", color: "#e52e4d", textTransform: "uppercase" }}>
                      95% Credible Interval
                    </div>
                    <div style={{ fontSize: "14px", fontWeight: "900", color: colors.textPrimary, fontFamily: "var(--font-mono)", margin: "7px 0 3px 0" }}>
                      [{lowerPct}% – {upperPct}%]
                    </div>
                    <div style={{ fontSize: "10px", color: colors.textMuted }}>
                      Width: <strong>{ciWidthPct} pp</strong> (±{sigmaPct}%)
                    </div>
                  </div>
                </div>
              </div>

              {/* Posterior Probability Distribution Curve (FR-17) */}
              <div
                style={{
                  backgroundColor: colors.bgCard,
                  borderRadius: "20px",
                  border: `1px solid ${colors.border}`,
                  padding: "20px",
                  boxShadow: colors.shadow,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <h4 style={{ fontSize: "13px", fontWeight: "800", color: colors.textPrimary, margin: 0 }}>
                    Posterior Probability Distribution (FR-17)
                  </h4>
                  <span style={{ fontSize: "10px", color: colors.textMuted }}>
                    Shaded band: 95% HDI
                  </span>
                </div>

                <PosteriorCurve
                  p={inference.bayesP}
                  lower={inference.lower}
                  upper={inference.upper}
                  isDark={isDark}
                />
              </div>

              {/* Per-Feature Risk Contribution Chart (FR-18) */}
              <div
                style={{
                  backgroundColor: colors.bgCard,
                  borderRadius: "20px",
                  border: `1px solid ${colors.border}`,
                  padding: "20px",
                  boxShadow: colors.shadow,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                  <h4 style={{ fontSize: "13px", fontWeight: "800", color: colors.textPrimary, margin: 0 }}>
                    Bayesian Feature Contributions (Log-Odds) (FR-18)
                  </h4>
                  <span style={{ fontSize: "10px", color: colors.textMuted }}>
                    Bayesian Model Only: <strong style={{ color: "#e52e4d" }}>+Risk</strong> vs <strong style={{ color: "#10b981" }}>-Protective</strong> (RBF SVM has no linear coefficients)
                  </span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  {inference.contribs.map((c, i) => (
                    <ContributionBar
                      key={c.name || c.label || i}
                      label={c.label || c.name}
                      value={c.value}
                      impact={c.impact ?? c.v ?? 0}
                      maxAbs={maxAbsContrib}
                      isDark={isDark}
                    />
                  ))}
                </div>
              </div>

              {/* Model Configuration Details (FR-19) */}
              <div
                style={{
                  backgroundColor: colors.bgCard,
                  borderRadius: "20px",
                  border: `1px solid ${colors.border}`,
                  padding: "18px 20px",
                  boxShadow: colors.shadow,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                  <h4 style={{ fontSize: "12px", fontWeight: "800", color: colors.textPrimary, margin: 0, textTransform: "uppercase" }}>
                    Model Configuration & Provenance (FR-19, BR-3)
                  </h4>
                  {modelInfo && (
                    <span style={{ fontSize: "10px", fontWeight: "800", padding: "2px 8px", borderRadius: "6px", backgroundColor: isDark ? "rgba(229, 46, 77, 0.2)" : "#fff1f3", color: "#e52e4d" }}>
                      Artifact v{modelInfo.artifact_version} (Seed {modelInfo.random_seed})
                    </span>
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", fontSize: "11px" }}>
                  <div style={{ backgroundColor: colors.bgSubtle, padding: "10px", borderRadius: "10px", border: `1px solid ${colors.border}` }}>
                    <div style={{ fontWeight: "800", color: "#e52e4d", marginBottom: "4px" }}>Support Vector Machine (SVM)</div>
                    <div style={{ color: colors.textSecondary }}>• Kernel: <strong>{modelInfo?.svm_kernel ? modelInfo.svm_kernel.toUpperCase() : "RBF"} (Radial Basis)</strong></div>
                    <div style={{ color: colors.textSecondary }}>• Regularization: <strong>C = {modelInfo?.svm_c ?? "0.1"}</strong>, Gamma: <strong>{modelInfo?.svm_gamma ?? "0.1"}</strong></div>
                    <div style={{ color: colors.textSecondary }}>• Calibration: <strong>{modelInfo?.svm_calibration_method ?? "Platt scaling"}</strong></div>
                  </div>

                  <div style={{ backgroundColor: colors.bgSubtle, padding: "10px", borderRadius: "10px", border: `1px solid ${colors.border}` }}>
                    <div style={{ fontWeight: "800", color: "#e52e4d", marginBottom: "4px" }}>Bayesian Logistic Regression</div>
                    <div style={{ color: colors.textSecondary }}>• Engine: <strong>{modelInfo?.bayesian_inference_method ? "Laplace Approx (Hessian)" : "Laplace Approximation"}</strong> ({modelInfo?.bayesian_draws ?? 2000} draws)</div>
                    <div style={{ color: colors.textSecondary }}>• Priors: <strong>{modelInfo?.bayesian_priors ?? "Normal(μ=0, σ=10)"}</strong></div>
                    <div style={{ color: colors.textSecondary }}>• Calibrated σ Alarm: <strong>{modelInfo?.calibration_threshold_sigma ? `${(modelInfo.calibration_threshold_sigma * 100).toFixed(1)}%` : `${CALIBRATED_TRIAGE_SIGMA_THRESHOLD * 100}%`} (85th %ile held-out)</strong></div>
                  </div>
                </div>
              </div>

              {/* Calibrated Triage Alert & Reason (FR-20, FR-21) */}
              <div
                style={{
                  backgroundColor: inference.triageFlag?.flagRaised
                    ? isDark ? "rgba(139, 0, 24, 0.25)" : "#fff1f3"
                    : isDark ? "rgba(6, 95, 70, 0.25)" : "#ecfdf5",
                  borderRadius: "18px",
                  border: `1px solid ${inference.triageFlag?.flagRaised ? "#e52e4d" : "#10b981"}`,
                  padding: "18px 20px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                  <span style={{ fontSize: "14px" }}>{inference.triageFlag?.flagRaised ? "▲" : "✓"}</span>
                  <span style={{ fontSize: "12px", fontWeight: "900", color: inference.triageFlag?.flagRaised ? "#e52e4d" : "#10b981", textTransform: "uppercase" }}>
                    Calibrated Triage Priority: {inference.triageFlag?.label || inference.triageStatus}
                  </span>
                </div>
                <p style={{ fontSize: "12px", color: colors.textPrimary, lineHeight: "1.6", margin: 0 }}>
                  {inference.triageFlag?.reason ||
                    `Posterior risk is ${bayesPct}% with Credible Interval width ${ciWidthPct} pp (epistemic σ = ${sigmaPct}%). Calibrated boundary derived from held-out UCI test validation.`}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Security, Privacy & Academic Disclaimers Footer (SR-1, SR-4, PR-1) */}
      <div
        style={{
          backgroundColor: colors.bgCard,
          borderRadius: "16px",
          border: `1px solid ${colors.border}`,
          padding: "16px 20px",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          fontSize: "11px",
          color: colors.textMuted,
          lineHeight: "1.5",
        }}
      >
        <div>
          <strong>Academic Coursework Demo (SR-1):</strong> VitalScore is an educational research demonstration illustrating uncertainty-aware Bayesian classification compared with standard SVM baselines. It is <strong>not a clinically validated diagnostic device</strong> and should never be used as the sole basis for clinical treatment.
        </div>
        <div>
          <strong>Privacy & Data Safety (PR-1, SR-4):</strong> Entered patient clinical parameters are processed in-memory for this evaluation. No patient health information is transmitted to third parties or persisted in external databases.
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   VIEW 3: PATIENT PROFILE VIEW (Fully Editable, Blank Initial State)
   ========================================================================= */
function PatientProfileView({ patient, updatePatient, colors, isDark, showToast }) {
  const [profileForm, setProfileForm] = useState(patient.profile);

  useEffect(() => {
    setProfileForm(patient.profile);
  }, [patient.id]);

  const handleSaveProfile = () => {
    updatePatient({
      profile: profileForm,
      vitals: {
        ...patient.vitals,
        age: profileForm.age ? Number(profileForm.age) : patient.vitals.age,
        sex: profileForm.sex === "Female" ? 0 : 1,
      },
    });
    showToast("✓ Patient profile updated successfully");
  };

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Top Banner */}
      <div
        style={{
          backgroundColor: colors.bgCard,
          borderRadius: "20px",
          border: `1px solid ${colors.border}`,
          padding: "20px 24px",
          boxShadow: colors.shadow,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "14px",
        }}
      >
        <div>
          <span style={{ fontSize: "10px", fontWeight: "800", textTransform: "uppercase", color: "#e52e4d", letterSpacing: "0.08em" }}>
            Patient Electronic Health Record
          </span>
          <h2 style={{ fontSize: "22px", fontWeight: "900", color: colors.textPrimary, margin: "4px 0" }}>
            Edit Patient Demographics & Profile
          </h2>
          <p style={{ fontSize: "12px", color: colors.textMuted, margin: 0 }}>
            All values can be manually entered and updated. Changes persist across the system.
          </p>
        </div>

        <button
          onClick={handleSaveProfile}
          style={{
            padding: "10px 20px",
            borderRadius: "12px",
            background: "linear-gradient(90deg, #8b0018 0%, #e52e4d 100%)",
            color: "#ffffff",
            fontSize: "12px",
            fontWeight: "800",
            boxShadow: "0 4px 14px rgba(139, 0, 24, 0.4)",
          }}
        >
          Save Profile Changes
        </button>
      </div>

      {/* Main Profile Form */}
      <div
        style={{
          backgroundColor: colors.bgCard,
          borderRadius: "20px",
          border: `1px solid ${colors.border}`,
          padding: "24px",
          boxShadow: colors.shadow,
          display: "flex",
          flexDirection: "column",
          gap: "20px",
        }}
      >
        {/* Row 1: Name & Patient Ref */}
        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr", gap: "16px" }}>
          <div>
            <label style={{ fontSize: "12px", fontWeight: "700", color: colors.textPrimary, display: "block", marginBottom: "6px" }}>
              Full Name
            </label>
            <input
              type="text"
              placeholder="e.g. Eleanor Vance"
              value={profileForm.name || ""}
              onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: "10px",
                fontSize: "13px",
                backgroundColor: colors.bgInput,
                color: colors.textPrimary,
                border: `1px solid ${colors.border}`,
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: "12px", fontWeight: "700", color: colors.textPrimary, display: "block", marginBottom: "6px" }}>
              Date of Birth
            </label>
            <input
              type="date"
              value={profileForm.dob || ""}
              onChange={(e) => setProfileForm({ ...profileForm, dob: e.target.value })}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: "10px",
                fontSize: "13px",
                backgroundColor: colors.bgInput,
                color: colors.textPrimary,
                border: `1px solid ${colors.border}`,
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: "12px", fontWeight: "700", color: colors.textPrimary, display: "block", marginBottom: "6px" }}>
              Age (Years)
            </label>
            <input
              type="number"
              min="18"
              max="100"
              placeholder="e.g. 52"
              value={profileForm.age || ""}
              onChange={(e) => setProfileForm({ ...profileForm, age: e.target.value === "" ? "" : Number(e.target.value) })}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: "10px",
                fontSize: "13px",
                backgroundColor: colors.bgInput,
                color: colors.textPrimary,
                border: `1px solid ${colors.border}`,
              }}
            />
          </div>
        </div>

        {/* Row 2: Gender, Blood Group, Height, Weight */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
          <div>
            <label style={{ fontSize: "12px", fontWeight: "700", color: colors.textPrimary, display: "block", marginBottom: "6px" }}>
              Gender
            </label>
            <select
              value={profileForm.sex || "Male"}
              onChange={(e) => setProfileForm({ ...profileForm, sex: e.target.value })}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: "10px",
                fontSize: "13px",
                backgroundColor: colors.bgInput,
                color: colors.textPrimary,
                border: `1px solid ${colors.border}`,
              }}
            >
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: "12px", fontWeight: "700", color: colors.textPrimary, display: "block", marginBottom: "6px" }}>
              Blood Group
            </label>
            <input
              type="text"
              placeholder="e.g. O+, A-, B+"
              value={profileForm.bloodGroup || ""}
              onChange={(e) => setProfileForm({ ...profileForm, bloodGroup: e.target.value })}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: "10px",
                fontSize: "13px",
                backgroundColor: colors.bgInput,
                color: colors.textPrimary,
                border: `1px solid ${colors.border}`,
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: "12px", fontWeight: "700", color: colors.textPrimary, display: "block", marginBottom: "6px" }}>
              Height
            </label>
            <input
              type="text"
              placeholder="e.g. 175 cm"
              value={profileForm.height || ""}
              onChange={(e) => setProfileForm({ ...profileForm, height: e.target.value })}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: "10px",
                fontSize: "13px",
                backgroundColor: colors.bgInput,
                color: colors.textPrimary,
                border: `1px solid ${colors.border}`,
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: "12px", fontWeight: "700", color: colors.textPrimary, display: "block", marginBottom: "6px" }}>
              Weight
            </label>
            <input
              type="text"
              placeholder="e.g. 74 kg"
              value={profileForm.weight || ""}
              onChange={(e) => setProfileForm({ ...profileForm, weight: e.target.value })}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: "10px",
                fontSize: "13px",
                backgroundColor: colors.bgInput,
                color: colors.textPrimary,
                border: `1px solid ${colors.border}`,
              }}
            />
          </div>
        </div>

        {/* Row 3: Contacts */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <div>
            <label style={{ fontSize: "12px", fontWeight: "700", color: colors.textPrimary, display: "block", marginBottom: "6px" }}>
              Telephone Contact
            </label>
            <input
              type="text"
              placeholder="e.g. +1 (555) 234-5678"
              value={profileForm.phone || ""}
              onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: "10px",
                fontSize: "13px",
                backgroundColor: colors.bgInput,
                color: colors.textPrimary,
                border: `1px solid ${colors.border}`,
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: "12px", fontWeight: "700", color: colors.textPrimary, display: "block", marginBottom: "6px" }}>
              Email Address
            </label>
            <input
              type="email"
              placeholder="e.g. patient@healthnet.org"
              value={profileForm.email || ""}
              onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: "10px",
                fontSize: "13px",
                backgroundColor: colors.bgInput,
                color: colors.textPrimary,
                border: `1px solid ${colors.border}`,
              }}
            />
          </div>
        </div>

        {/* Row 4: Allergies & Medical History */}
        <div>
          <label style={{ fontSize: "12px", fontWeight: "700", color: colors.textPrimary, display: "block", marginBottom: "6px" }}>
            Allergies & Drug Sensitivities
          </label>
          <textarea
            rows={2}
            placeholder="e.g. Penicillin (rash), Sulfa drugs"
            value={profileForm.allergies || ""}
            onChange={(e) => setProfileForm({ ...profileForm, allergies: e.target.value })}
            style={{
              width: "100%",
              padding: "10px 14px",
              borderRadius: "10px",
              fontSize: "12px",
              backgroundColor: colors.bgInput,
              color: colors.textPrimary,
              border: `1px solid ${colors.border}`,
            }}
          />
        </div>

        <div>
          <label style={{ fontSize: "12px", fontWeight: "700", color: colors.textPrimary, display: "block", marginBottom: "6px" }}>
            Past Medical History & Chronic Conditions
          </label>
          <textarea
            rows={3}
            placeholder="Document patient hypertension, diabetes, smoking history, prior myocardial infarctions..."
            value={profileForm.medicalHistory || ""}
            onChange={(e) => setProfileForm({ ...profileForm, medicalHistory: e.target.value })}
            style={{
              width: "100%",
              padding: "10px 14px",
              borderRadius: "10px",
              fontSize: "12px",
              backgroundColor: colors.bgInput,
              color: colors.textPrimary,
              border: `1px solid ${colors.border}`,
            }}
          />
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   VIEW 4: EHR DASHBOARD (Fully Editable Vitals & Meds)
   ========================================================================= */
function EHRDashboardView({ patient, updatePatient, colors, isDark, showToast }) {
  const [ehrForm, setEhrForm] = useState(patient.ehrRecords || { activeMedications: [], encounters: [] });

  useEffect(() => {
    setEhrForm(patient.ehrRecords || { activeMedications: [], encounters: [] });
  }, [patient.id]);

  const handleSaveEHR = () => {
    updatePatient({ ehrRecords: ehrForm });
    showToast("✓ Electronic Health Records successfully saved");
  };

  const handleAddMedication = () => {
    const name = prompt("Medication Name (e.g. Atorvastatin):");
    if (!name) return;
    const dosage = prompt("Dosage (e.g. 20mg):") || "10mg";
    const freq = prompt("Frequency (e.g. Once daily):") || "Daily";
    setEhrForm((prev) => ({
      ...prev,
      activeMedications: [...(prev.activeMedications || []), { name, dosage, freq }],
    }));
  };

  const handleRemoveMedication = (idx) => {
    setEhrForm((prev) => ({
      ...prev,
      activeMedications: prev.activeMedications.filter((_, i) => i !== idx),
    }));
  };

  const handleAddEncounter = () => {
    const type = prompt("Clinical Encounter Title (e.g. 12-Lead Holter ECG):");
    if (!type) return;
    const summary = prompt("Encounter Diagnostic Summary:") || "Diagnostic assessment completed.";
    setEhrForm((prev) => ({
      ...prev,
      encounters: [
        {
          date: new Date().toISOString().slice(0, 10),
          type,
          provider: patient.profile.doctor || "Attending Physician",
          summary,
        },
        ...(prev.encounters || []),
      ],
    }));
  };

  return (
    <div style={{ maxWidth: "1000px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Top Banner */}
      <div
        style={{
          backgroundColor: colors.bgCard,
          borderRadius: "20px",
          border: `1px solid ${colors.border}`,
          padding: "20px 24px",
          boxShadow: colors.shadow,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "14px",
        }}
      >
        <div>
          <span style={{ fontSize: "10px", fontWeight: "800", textTransform: "uppercase", color: "#e52e4d", letterSpacing: "0.08em" }}>
            Longitudinal Health Telemetry
          </span>
          <h2 style={{ fontSize: "22px", fontWeight: "900", color: colors.textPrimary, margin: "4px 0" }}>
            EHR Dashboard & Diagnostic History
          </h2>
          <p style={{ fontSize: "12px", color: colors.textMuted, margin: 0 }}>
            Track continuous vitals, laboratory panels, medications, and clinical encounter timelines.
          </p>
        </div>

        <button
          onClick={handleSaveEHR}
          style={{
            padding: "10px 20px",
            borderRadius: "12px",
            background: "linear-gradient(90deg, #8b0018 0%, #e52e4d 100%)",
            color: "#ffffff",
            fontSize: "12px",
            fontWeight: "800",
            boxShadow: "0 4px 14px rgba(139, 0, 24, 0.4)",
          }}
        >
          Save EHR Records
        </button>
      </div>

      {/* Grid: Baseline Labs & Active Medications */}
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "24px" }}>
        {/* Lab Metrics */}
        <div style={{ backgroundColor: colors.bgCard, borderRadius: "20px", border: `1px solid ${colors.border}`, padding: "24px", boxShadow: colors.shadow }}>
          <h3 style={{ fontSize: "15px", fontWeight: "800", color: colors.textPrimary, margin: "0 0 16px 0" }}>
            Lipid & Metabolic Telemetry Panels
          </h3>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
            <div>
              <label style={{ fontSize: "11px", fontWeight: "700", color: colors.textPrimary, display: "block", marginBottom: "4px" }}>
                HbA1c (%)
              </label>
              <input
                type="text"
                placeholder="e.g. 5.6"
                value={ehrForm.hba1c || ""}
                onChange={(e) => setEhrForm({ ...ehrForm, hba1c: e.target.value })}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  backgroundColor: colors.bgInput,
                  color: colors.textPrimary,
                  border: `1px solid ${colors.border}`,
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: "11px", fontWeight: "700", color: colors.textPrimary, display: "block", marginBottom: "4px" }}>
                HDL Cholesterol (mg/dL)
              </label>
              <input
                type="text"
                placeholder="e.g. 48"
                value={ehrForm.hdl || ""}
                onChange={(e) => setEhrForm({ ...ehrForm, hdl: e.target.value })}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  backgroundColor: colors.bgInput,
                  color: colors.textPrimary,
                  border: `1px solid ${colors.border}`,
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: "11px", fontWeight: "700", color: colors.textPrimary, display: "block", marginBottom: "4px" }}>
                LDL Cholesterol (mg/dL)
              </label>
              <input
                type="text"
                placeholder="e.g. 138"
                value={ehrForm.ldl || ""}
                onChange={(e) => setEhrForm({ ...ehrForm, ldl: e.target.value })}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  backgroundColor: colors.bgInput,
                  color: colors.textPrimary,
                  border: `1px solid ${colors.border}`,
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: "11px", fontWeight: "700", color: colors.textPrimary, display: "block", marginBottom: "4px" }}>
                Triglycerides (mg/dL)
              </label>
              <input
                type="text"
                placeholder="e.g. 165"
                value={ehrForm.triglycerides || ""}
                onChange={(e) => setEhrForm({ ...ehrForm, triglycerides: e.target.value })}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  backgroundColor: colors.bgInput,
                  color: colors.textPrimary,
                  border: `1px solid ${colors.border}`,
                }}
              />
            </div>
          </div>
        </div>

        {/* Active Medications */}
        <div style={{ backgroundColor: colors.bgCard, borderRadius: "20px", border: `1px solid ${colors.border}`, padding: "24px", boxShadow: colors.shadow }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h3 style={{ fontSize: "15px", fontWeight: "800", color: colors.textPrimary, margin: 0 }}>
              Active Medications
            </h3>
            <button
              onClick={handleAddMedication}
              style={{
                fontSize: "11px",
                fontWeight: "800",
                color: "#e52e4d",
                display: "flex",
                alignItems: "center",
                gap: "2px",
              }}
            >
              <PlusIcon className="w-3.5 h-3.5" />
              <span>Add Med</span>
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {(ehrForm.activeMedications || []).map((med, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 12px",
                  borderRadius: "10px",
                  backgroundColor: colors.bgSubtle,
                  border: `1px solid ${colors.border}`,
                }}
              >
                <div>
                  <span style={{ fontSize: "12px", fontWeight: "800", color: colors.textPrimary, display: "block" }}>
                    {med.name} ({med.dosage})
                  </span>
                  <span style={{ fontSize: "10px", color: colors.textMuted }}>
                    {med.freq}
                  </span>
                </div>
                <button
                  onClick={() => handleRemoveMedication(idx)}
                  style={{ color: "#ef4444", fontSize: "11px", fontWeight: "700" }}
                >
                  Remove
                </button>
              </div>
            ))}
            {(!ehrForm.activeMedications || ehrForm.activeMedications.length === 0) && (
              <span style={{ fontSize: "12px", color: colors.textMuted, textAlign: "center", padding: "16px 0" }}>
                No active medications registered.
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Clinical Encounters Timeline */}
      <div style={{ backgroundColor: colors.bgCard, borderRadius: "20px", border: `1px solid ${colors.border}`, padding: "24px", boxShadow: colors.shadow }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <div>
            <h3 style={{ fontSize: "15px", fontWeight: "800", color: colors.textPrimary, margin: 0 }}>
              Documented Clinical Encounters
            </h3>
            <span style={{ fontSize: "11px", color: colors.textMuted }}>
              Chronological log of visits, diagnostics, and evaluations
            </span>
          </div>

          <button
            onClick={handleAddEncounter}
            style={{
              padding: "6px 12px",
              borderRadius: "8px",
              backgroundColor: colors.bgSubtle,
              color: "#e52e4d",
              border: `1px solid ${colors.border}`,
              fontSize: "11px",
              fontWeight: "800",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <PlusIcon className="w-3.5 h-3.5" />
            <span>Log Encounter</span>
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {(ehrForm.encounters || []).map((enc, idx) => (
            <div
              key={idx}
              style={{
                padding: "12px 14px",
                borderRadius: "12px",
                backgroundColor: colors.bgSubtle,
                border: `1px solid ${colors.border}`,
                display: "flex",
                flexDirection: "column",
                gap: "4px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                <span style={{ fontWeight: "800", color: "#e52e4d" }}>{enc.type}</span>
                <span style={{ color: colors.textMuted }}>{enc.date} • {enc.provider}</span>
              </div>
              <p style={{ fontSize: "12px", color: colors.textPrimary, margin: 0 }}>
                {enc.summary}
              </p>
            </div>
          ))}
          {(!ehrForm.encounters || ehrForm.encounters.length === 0) && (
            <span style={{ fontSize: "12px", color: colors.textMuted, textAlign: "center", padding: "16px 0" }}>
              No previous clinical encounters logged for this patient.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   SYSTEM SETTINGS MODAL (Kept completely separate & organized)
   ========================================================================= */
function SettingsModal({
  onClose,
  theme,
  toggleTheme,
  clinicConfig,
  onUpdateClinicConfig,
  authSession,
  onLogout,
  onExportDatabase,
  onImportDatabase,
  onClearDatabase,
  onLoadBenchmark,
  patientCount,
  colors,
  isDark,
  settingsTab,
  setSettingsTab,
}) {
  const [facilityName, setFacilityName] = useState(clinicConfig.facilityName);
  const [department, setDepartment] = useState(clinicConfig.department);
  const [defaultDoctor, setDefaultDoctor] = useState(clinicConfig.defaultDoctor);
  const [epistemicThreshold, setEpistemicThreshold] = useState(clinicConfig.epistemicThreshold);

  const handleSaveClinicSettings = (e) => {
    e.preventDefault();
    onUpdateClinicConfig({
      facilityName,
      department,
      defaultDoctor,
      epistemicThreshold: Number(epistemicThreshold),
    });
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.7)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
        padding: "20px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "640px",
          backgroundColor: colors.bgCard,
          borderRadius: "24px",
          border: `1px solid ${colors.border}`,
          boxShadow: colors.shadow,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Modal Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 24px", borderBottom: `1px solid ${colors.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <SettingsIcon className="w-5 h-5 text-[#e52e4d]" />
            <h2 style={{ fontSize: "17px", fontWeight: "900", color: colors.textPrimary, margin: 0 }}>
              VitalScore System Configuration
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{ fontSize: "18px", fontWeight: "700", color: colors.textMuted, padding: "4px 8px" }}
          >
            ×
          </button>
        </div>

        {/* Settings Navigation Tabs */}
        <div style={{ display: "flex", borderBottom: `1px solid ${colors.border}`, backgroundColor: colors.bgSubtle }}>
          {[
            { id: "general", label: "Appearance & Theme" },
            { id: "clinic", label: "Institutional Profile" },
            { id: "bayesian", label: "Bayesian Engine" },
            { id: "database", label: `Data (${patientCount})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSettingsTab(tab.id)}
              style={{
                flex: 1,
                padding: "12px 14px",
                fontSize: "12px",
                fontWeight: settingsTab === tab.id ? "800" : "600",
                color: settingsTab === tab.id ? "#e52e4d" : colors.textMuted,
                borderBottom: `2px solid ${settingsTab === tab.id ? "#e52e4d" : "transparent"}`,
                textAlign: "center",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Body */}
        <div style={{ padding: "24px", maxHeight: "65vh", overflowY: "auto" }}>
          {/* TAB 1: APPEARANCE & THEME */}
          {settingsTab === "general" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div>
                <label style={{ fontSize: "12px", fontWeight: "800", color: colors.textPrimary, display: "block", marginBottom: "8px" }}>
                  Interface Theme
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <button
                    onClick={() => theme !== "dark" && toggleTheme()}
                    style={{
                      padding: "14px",
                      borderRadius: "12px",
                      backgroundColor: "#100205",
                      border: `2px solid ${isDark ? "#e52e4d" : "transparent"}`,
                      color: "#ffffff",
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                    }}
                  >
                    <MoonIcon className="w-5 h-5 text-[#e52e4d]" />
                    <div style={{ textAlign: "left" }}>
                      <span style={{ fontSize: "13px", fontWeight: "800", display: "block" }}>Dark Mode</span>
                      <span style={{ fontSize: "10px", color: "#a18288" }}>Obsidian Clinical Palette</span>
                    </div>
                  </button>

                  <button
                    onClick={() => theme !== "light" && toggleTheme()}
                    style={{
                      padding: "14px",
                      borderRadius: "12px",
                      backgroundColor: "#ffffff",
                      border: `2px solid ${!isDark ? "#8b0018" : "transparent"}`,
                      color: "#111827",
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                    }}
                  >
                    <SunIcon className="w-5 h-5 text-amber-500" />
                    <div style={{ textAlign: "left" }}>
                      <span style={{ fontSize: "13px", fontWeight: "800", display: "block" }}>Light Mode</span>
                      <span style={{ fontSize: "10px", color: "#64748b" }}>Clean Clinical Paper</span>
                    </div>
                  </button>
                </div>
              </div>

              <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: "16px" }}>
                <span style={{ fontSize: "12px", fontWeight: "700", color: colors.textPrimary, display: "block", marginBottom: "4px" }}>
                  Authenticated Clinician
                </span>
                <span style={{ fontSize: "12px", color: colors.textMuted, display: "block" }}>
                  Currently signed in as: <strong>{authSession.doctor}</strong> ({authSession.npi})
                </span>
                <button
                  onClick={onLogout}
                  style={{
                    marginTop: "12px",
                    padding: "8px 16px",
                    borderRadius: "8px",
                    backgroundColor: colors.bgSubtle,
                    color: "#ef4444",
                    border: "1px solid #ef4444",
                    fontSize: "12px",
                    fontWeight: "800",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <LogOutIcon className="w-3.5 h-3.5" />
                  <span>Lock Session / Sign Out</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: INSTITUTIONAL SETTINGS */}
          {settingsTab === "clinic" && (
            <form onSubmit={handleSaveClinicSettings} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label style={{ fontSize: "12px", fontWeight: "700", color: colors.textPrimary, display: "block", marginBottom: "6px" }}>
                  Hospital / Facility Name
                </label>
                <input
                  type="text"
                  value={facilityName}
                  onChange={(e) => setFacilityName(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: "10px",
                    fontSize: "13px",
                    backgroundColor: colors.bgInput,
                    color: colors.textPrimary,
                    border: `1px solid ${colors.border}`,
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: "12px", fontWeight: "700", color: colors.textPrimary, display: "block", marginBottom: "6px" }}>
                  Clinical Department
                </label>
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: "10px",
                    fontSize: "13px",
                    backgroundColor: colors.bgInput,
                    color: colors.textPrimary,
                    border: `1px solid ${colors.border}`,
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: "12px", fontWeight: "700", color: colors.textPrimary, display: "block", marginBottom: "6px" }}>
                  Default Attending Doctor
                </label>
                <input
                  type="text"
                  value={defaultDoctor}
                  onChange={(e) => setDefaultDoctor(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: "10px",
                    fontSize: "13px",
                    backgroundColor: colors.bgInput,
                    color: colors.textPrimary,
                    border: `1px solid ${colors.border}`,
                  }}
                />
              </div>

              <button
                type="submit"
                style={{
                  marginTop: "8px",
                  padding: "10px 18px",
                  borderRadius: "10px",
                  background: "linear-gradient(90deg, #8b0018 0%, #e52e4d 100%)",
                  color: "#ffffff",
                  fontSize: "12px",
                  fontWeight: "800",
                }}
              >
                Save Institutional Profile
              </button>
            </form>
          )}

          {/* TAB 3: BAYESIAN ENGINE CONFIG */}
          {settingsTab === "bayesian" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label style={{ fontSize: "12px", fontWeight: "700", color: colors.textPrimary, display: "block", marginBottom: "6px" }}>
                  Epistemic Uncertainty Alarm Cutoff (σ)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.04"
                  max="0.25"
                  value={epistemicThreshold}
                  onChange={(e) => setEpistemicThreshold(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: "10px",
                    fontSize: "13px",
                    backgroundColor: colors.bgInput,
                    color: colors.textPrimary,
                    border: `1px solid ${colors.border}`,
                  }}
                />
                <span style={{ fontSize: "11px", color: colors.textMuted, display: "block", marginTop: "4px" }}>
                  Alerts clinician when posterior dispersion exceeds this threshold.
                </span>
              </div>

              <div style={{ backgroundColor: colors.bgSubtle, padding: "14px", borderRadius: "12px", border: `1px solid ${colors.border}` }}>
                <span style={{ fontSize: "12px", fontWeight: "800", color: colors.textPrimary, display: "block" }}>
                  Laplace Approximation Specifications
                </span>
                <ul style={{ fontSize: "11px", color: colors.textMuted, margin: "6px 0 0 16px", lineHeight: "1.6" }}>
                  <li>Prior Distribution: N(μ₀ = -1.15, τ₀ = 1.0)</li>
                  <li>Credible Interval Coverage: 95% Highest Density Interval (HDI)</li>
                  <li>Overconfidence Penalty: Activated across boundary hemodynamics</li>
                </ul>
              </div>
            </div>
          )}

          {/* TAB 4: DATABASE & BACKUP */}
          {settingsTab === "database" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <span style={{ fontSize: "13px", fontWeight: "800", color: colors.textPrimary, display: "block" }}>
                    Patient Database Registry
                  </span>
                  <span style={{ fontSize: "11px", color: colors.textMuted }}>
                    {patientCount} patient record(s) persisted in local storage
                  </span>
                </div>

                <button
                  onClick={onExportDatabase}
                  style={{
                    padding: "8px 14px",
                    borderRadius: "8px",
                    backgroundColor: colors.bgSubtle,
                    color: colors.textPrimary,
                    border: `1px solid ${colors.border}`,
                    fontSize: "11px",
                    fontWeight: "800",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <DownloadIcon className="w-3.5 h-3.5" />
                  <span>Export JSON</span>
                </button>
              </div>

              <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: "14px" }}>
                <span style={{ fontSize: "12px", fontWeight: "700", color: colors.textPrimary, display: "block", marginBottom: "6px" }}>
                  Import Patient Records (JSON)
                </span>
                <input
                  type="file"
                  accept=".json"
                  onChange={onImportDatabase}
                  style={{ fontSize: "12px", color: colors.textMuted }}
                />
              </div>

              <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: "14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <span style={{ fontSize: "12px", fontWeight: "800", color: "#ef4444", display: "block" }}>
                    Purge All Patient Records
                  </span>
                  <span style={{ fontSize: "11px", color: colors.textMuted }}>
                    Clears all patient records from local cache.
                  </span>
                </div>
                <button
                  onClick={onClearDatabase}
                  style={{
                    padding: "8px 14px",
                    borderRadius: "8px",
                    backgroundColor: "#ef4444",
                    color: "#ffffff",
                    fontSize: "11px",
                    fontWeight: "800",
                  }}
                >
                  Clear Database
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "14px 24px", borderTop: `1px solid ${colors.border}`, backgroundColor: colors.bgSubtle }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 20px",
              borderRadius: "10px",
              backgroundColor: colors.bgCard,
              color: colors.textPrimary,
              border: `1px solid ${colors.border}`,
              fontSize: "12px",
              fontWeight: "700",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
