/**
 * VitalScore Clinical Data Engine
 * Persistent multi-patient storage with zero prefilled mock data.
 * Clinicians manually register and document patient cases.
 */

const DB_STORAGE_KEY = "vitalscore_patient_database_v3";

/**
 * Creates a clean, empty patient record with blank inputs
 */
export function createEmptyPatient(customDoctor = "Dr. James Anderson, MD, FACC") {
  const timestamp = Date.now();
  const refCode = `VS-${Math.floor(100000 + Math.random() * 900000)}`;
  return {
    id: `patient-${timestamp}`,
    ref: refCode,
    createdAt: new Date().toISOString(),
    profile: {
      name: "",
      dob: "",
      age: "",
      sex: "Male", // "Male" | "Female" | "Other"
      bloodGroup: "",
      height: "",
      weight: "",
      bmi: "",
      phone: "",
      email: "",
      emergencyContact: "",
      doctor: customDoctor,
      clinic: "Cardiology Department",
      allergies: "",
      medicalHistory: "",
    },
    vitals: {
      age: "",
      sex: 1, // 1: Male, 0: Female
      cp: 0, // 0: Typical Angina, 1: Atypical, 2: Non-Anginal, 3: Asymptomatic
      trestbps: "",
      chol: "",
      fbs: 0, // 0: <= 120, 1: > 120
      thalach: "",
      exang: 0, // 0: No, 1: Yes
      oldpeak: "",
    },
    clinicalAssessment: {
      lastAssessmentDate: new Date().toISOString().slice(0, 10),
      attendingDoctor: customDoctor,
      diagnosisImpression: "",
      triageLevel: "Pending Data Entry",
      doctorNotes: "",
      secondaryTestsOrdered: [],
      prescriptionPlan: "",
      followUpSchedule: "",
    },
    ehrRecords: {
      restingHeartRate: "",
      spO2: "",
      hba1c: "",
      hdl: "",
      ldl: "",
      triglycerides: "",
      activeMedications: [],
      encounters: [],
    },
  };
}

/**
 * Loads patient records from localStorage without forcing mock data
 */
export function loadPatientsFromStorage() {
  try {
    const raw = localStorage.getItem(DB_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (err) {
    console.error("Failed to load patients from storage", err);
  }
  return [];
}

/**
 * Persists patient array to localStorage
 */
export function savePatientsToStorage(patients) {
  try {
    localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(patients));
  } catch (err) {
    console.error("Failed to save patients to storage", err);
  }
}

/**
 * Clears all patient data from storage
 */
export function clearPatientsStorage() {
  try {
    localStorage.removeItem(DB_STORAGE_KEY);
  } catch (err) {
    console.error("Failed to clear storage", err);
  }
}

/**
 * Generates an optional clinical reference benchmark case for demonstration if requested
 */
export function getBenchmarkSamplePatient() {
  return {
    id: `benchmark-${Date.now()}`,
    ref: "BENCH-092",
    createdAt: new Date().toISOString(),
    profile: {
      name: "Marcus Vance",
      dob: "1971-06-14",
      age: 55,
      sex: "Male",
      bloodGroup: "O+",
      height: "176 cm",
      weight: "82 kg",
      bmi: "26.5",
      phone: "+1 (555) 492-8812",
      email: "m.vance@institutional.med",
      emergencyContact: "Sarah Vance • +1 (555) 492-8813",
      doctor: "Dr. James Anderson, MD, FACC",
      clinic: "St. Jude Heart Institute",
      allergies: "Penicillin",
      medicalHistory: "Essential hypertension (5 yrs), Borderline hyperlipidemia.",
    },
    vitals: {
      age: 55,
      sex: 1,
      cp: 1,
      trestbps: 142,
      chol: 236,
      fbs: 0,
      thalach: 148,
      exang: 1,
      oldpeak: 1.6,
    },
    clinicalAssessment: {
      lastAssessmentDate: new Date().toISOString().slice(0, 10),
      attendingDoctor: "Dr. James Anderson, MD, FACC",
      diagnosisImpression: "Exertional angina with ischemic ST depression.",
      triageLevel: "High Concern (Calibrated)",
      doctorNotes: "Elevated posterior probability with wide credible intervals warrants stress echocardiogram.",
      secondaryTestsOrdered: ["Stress Echocardiography", "Serial Cardiac Troponins"],
      prescriptionPlan: "Aspirin 81mg, Atorvastatin 40mg, Metoprolol 25mg daily.",
      followUpSchedule: "1 Week Post-Stress Echo",
    },
    ehrRecords: {
      restingHeartRate: 74,
      spO2: 98,
      hba1c: 5.8,
      hdl: 42,
      ldl: 148,
      triglycerides: 190,
      activeMedications: [
        { name: "Atorvastatin", dosage: "40mg", freq: "Once daily" },
      ],
      encounters: [
        {
          date: new Date().toISOString().slice(0, 10),
          type: "Comprehensive Outpatient Cardiology Intake",
          provider: "Dr. James Anderson",
          summary: "Initial Bayesian CAD risk screening.",
        },
      ],
    },
  };
}
