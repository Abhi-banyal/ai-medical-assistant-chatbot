import {
  Activity,
  AlertTriangle,
  Bot,
  CalendarDays,
  ClipboardList,
  Cross,
  HeartPulse,
  Hospital,
  Loader2,
  MapPin,
  MessageCircle,
  Plus,
  Search,
  RotateCcw,
  Send,
  ShieldCheck,
  Stethoscope,
  Trash2,
  UserRound,
  Users,
  XCircle
} from "lucide-react";

import { useEffect, useMemo, useRef, useState } from "react";
import aiMedicalHeaderBg from "./assets/ai-medical-header.png";
import doctorHero from "./assets/doctor-hero.png";
import {
  fetchNearbyHospitals,
  sendChatMessage,
  searchConsultationHistory,
  startBackendSession
} from "./lib/api";

const DOCTORS = [
  { id: 1, name: "Dr. Shifali Thakur (General Physician)", experience: "11 years experience" },
  { id: 2, name: "Dr. Raj Mehta (Cardiologist)", experience: "14 years experience" },
  { id: 3, name: "Dr. Neha Verma (Dermatologist)", experience: "10 years experience" },
  { id: 4, name: "Dr. Amit Singh (Orthopedic)", experience: "12 years experience" },
  { id: 5, name: "Dr. Priya Nair (Gynecologist)", experience: "13 years experience" },
  { id: 6, name: "Dr. Karan Gupta (Neurologist)", experience: "15 years experience" },
  { id: 7, name: "Dr. Sneha Kapoor (Pediatrician)", experience: "9 years experience" }
];

const INITIAL_PROFILE = {
  name: "",
  dob: "",
  age: 25,
  sex: "",
  allergies: "",
  medications: "",
  conditions: ""
};

const INITIAL_SOAP = {
  Subjective: "Pending",
  Objective: "Pending",
  Assessment: "Pending",
  Plan: "Pending"
};

function generateLocalSessionId() {
  return crypto.randomUUID().slice(0, 8).toUpperCase();
}

function nowTime() {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function detectTriage(message) {
  const text = message.toLowerCase();

  const urgentKeywords = [
    "chest pain",
    "difficulty breathing",
    "shortness of breath",
    "can't breathe",
    "cannot breathe",
    "severe bleeding",
    "unconscious",
    "fainting",
    "stroke",
    "seizure",
    "heart attack",
    "blue lips",
    "anaphylaxis",
    "severe allergic",
    "blood vomiting",
    "severe head injury",
    "loss of consciousness"
  ];

  const warningKeywords = [
    "high fever",
    "severe pain",
    "persistent vomiting",
    "dizziness",
    "pregnant",
    "diabetes",
    "blood pressure",
    "infection",
    "worsening",
    "dehydration",
    "rash",
    "swelling",
    "fever"
  ];

  if (urgentKeywords.some((keyword) => text.includes(keyword))) {
    return "urgent";
  }

  if (warningKeywords.some((keyword) => text.includes(keyword))) {
    return "warning";
  }

  return "safe";
}

function triagePriority(status) {
  const map = {
    neutral: 0,
    safe: 1,
    warning: 2,
    urgent: 3
  };

  return map[status] ?? 0;
}

function validateProfile(profile) {
  const nameValid = profile.name.trim().length > 0;
  const dobValid = Boolean(parseDobInput(profile.dob));
  const sexValid = profile.sex.trim().length > 0;
  const ageNumber = Number(profile.age);
  const ageValid = Number.isInteger(ageNumber) && ageNumber >= 0 && ageNumber <= 120;

  return nameValid && dobValid && sexValid && ageValid;
}

function parseDobInput(input) {
  if (!input || typeof input !== "string") {
    return null;
  }

  const value = input.trim();
  if (!value) {
    return null;
  }

  const isoMatch = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    const date = new Date(year, month - 1, day);
    if (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    ) {
      return date;
    }
    return null;
  }

  const slashMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const first = Number(slashMatch[1]);
    const second = Number(slashMatch[2]);
    const year = Number(slashMatch[3]);

    // Prefer DD/MM for ambiguous values, MM/DD when second part cannot be month.
    let day = first;
    let month = second;
    if (second > 12 && first <= 12) {
      day = second;
      month = first;
    }

    const date = new Date(year, month - 1, day);
    if (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    ) {
      return date;
    }
    return null;
  }

  const dashMatch = value.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dashMatch) {
    const day = Number(dashMatch[1]);
    const month = Number(dashMatch[2]);
    const year = Number(dashMatch[3]);
    const date = new Date(year, month - 1, day);
    if (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    ) {
      return date;
    }
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function calculateAgeFromDob(dateOfBirth) {
  if (!(dateOfBirth instanceof Date) || Number.isNaN(dateOfBirth.getTime())) {
    return null;
  }

  const today = new Date();
  let age = today.getFullYear() - dateOfBirth.getFullYear();
  const hasBirthdayPassed =
    today.getMonth() > dateOfBirth.getMonth() ||
    (today.getMonth() === dateOfBirth.getMonth() &&
      today.getDate() >= dateOfBirth.getDate());

  if (!hasBirthdayPassed) {
    age -= 1;
  }

  if (age < 0 || age > 120) {
    return null;
  }

  return age;
}

function normalizeDobForBackend(value) {
  const parsed = parseDobInput(value);
  if (!parsed) {
    return "";
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function isFutureDate(dateObj) {
  if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const candidate = new Date(dateObj);
  candidate.setHours(0, 0, 0, 0);

  return candidate > today;
}

function formatDateTimeValue(value) {
  if (!value) {
    return "Not available";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return parsed.toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function hasClearClinicalContext(chatHistory) {
  const userMessages = chatHistory.filter((item) => item.role === "user");

  if (userMessages.length === 0) {
    return false;
  }

  const combinedText = userMessages
    .map((item) => item.content.toLowerCase())
    .join(" ");

  const symptomKeywords = [
    "fever",
    "cough",
    "headache",
    "pain",
    "ache",
    "rash",
    "swelling",
    "vomiting",
    "nausea",
    "diarrhea",
    "dizzy",
    "dizziness",
    "breath",
    "chest",
    "throat",
    "stomach",
    "abdomen",
    "infection"
  ];

  const detailPatterns = [
    /\b\d+\s*(day|days|hour|hours|week|weeks|month|months)\b/,
    /\b(today|yesterday|since|started|duration|for the last)\b/,
    /\b(mild|moderate|severe|worse|worsening|intense|unbearable)\b/,
    /\b\d+\s*\/\s*10\b/,
    /\b(chills|body ache|shortness|breathing|runny nose|sore throat|fatigue|weakness)\b/,
    /\b(temperature|temp|allergy|medication|diabetes|blood pressure)\b/
  ];

  const hasSymptom = symptomKeywords.some((keyword) =>
    combinedText.includes(keyword)
  );
  const detailCount = detailPatterns.filter((pattern) =>
    pattern.test(combinedText)
  ).length;

  return hasSymptom && (userMessages.length >= 2 || detailCount >= 2);
}

function parseStoredSummary(summary) {
  if (summary == null) {
    return null;
  }

  if (typeof summary !== "string") {
    return summary;
  }

  const trimmed = summary.trim();

  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return summary;
  }
}

function renderStoredSummaryValue(value) {
  if (value == null || value === "") {
    return "Pending";
  }

  if (Array.isArray(value)) {
    return value.length > 0
      ? value.map(renderStoredSummaryValue).join("\n")
      : "Pending";
  }

  if (typeof value === "object") {
    return Object.entries(value)
      .map(([key, nestedValue]) => `${key}: ${renderStoredSummaryValue(nestedValue)}`)
      .join("\n");
  }

  return String(value);
}

function StatusPill({ status }) {
  const normalized = status === "Active" ? "Active" : status === "Ended" ? "Ended" : "Not Started";
  const active = normalized === "Active";
  const ended = normalized === "Ended";

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-black ${
        active
          ? "bg-green-100 text-green-700"
          : ended
            ? "bg-red-100 text-red-700"
            : "bg-slate-100 text-slate-700"
      }`}
    >
      {active ? <ShieldCheck size={14} /> : ended ? <XCircle size={14} /> : <Activity size={14} />}
      {normalized}
    </span>
  );
}

function SectionHeader({ icon, title, subtitle }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 text-[15px] font-black text-slate-950">
        {icon}
        <h2>{title}</h2>
      </div>
      {subtitle ? (
        <p className="mt-1 text-sm leading-5 text-slate-500">{subtitle}</p>
      ) : null}
    </div>
  );
}

function Sidebar({
  sessionId,
  selectedDoctor,
  setSelectedDoctor,
  profile,
  profileSubmitted,
  sessionStatus,
  nearbyHospitals,
  loadingHospitals,
  hospitalError,
  onStartNewSession,
  onFindHospitals
}) {
  const isActive = sessionStatus === "active";
  const statusLabel =
    sessionStatus === "active" ? "Active" : sessionStatus === "ended" ? "Ended" : "Not Started";

  return (
    <aside className="glass-card flex h-full min-h-0 flex-col overflow-hidden bg-white/70 p-3 backdrop-blur-lg">
      <div className="custom-scrollbar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
        <div className="card p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-black text-slate-900">Session Status</p>
            <StatusPill status={statusLabel} />
          </div>
          
        </div>

        <div className="card border-teal-100/80 bg-gradient-to-br from-white to-teal-50/70 p-4">
          <div className="mb-3 flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-teal-100 text-teal-700">
              <UserRound size={18} />
            </div>
            <div>
              <div className="text-base font-black text-slate-950">
                Select Doctor
              </div>
              <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                Choose the specialist for this consultation session.
              </p>
            </div>
          </div>

          <DoctorDropdown
            selectedDoctor={selectedDoctor}
            setSelectedDoctor={setSelectedDoctor}
          />
        </div>

        {!isActive ? (
          <button
            type="button"
            onClick={onStartNewSession}
            className="gradient-button mb-4 flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black"
          >
            <Plus size={17} />
            Start New Session
          </button>
        ) : null}

        <NearbyHospitalsCard
          hospitals={nearbyHospitals}
          loading={loadingHospitals}
          error={hospitalError}
          onFindHospitals={onFindHospitals}
        />
      </div>

      <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
        <strong>Care guideline:</strong> This assistant supports symptom intake,
        triage, and documentation. It does not replace a licensed clinician.
      </div>
    </aside>
  );
}

function NearbyHospitalsCard({ hospitals, loading, error, onFindHospitals }) {
  const hasHospitals = hospitals.length > 0;

  return (
    <div className="card flex min-h-[420px] flex-1 flex-col overflow-hidden border-cyan-100/80 bg-gradient-to-br from-white via-sky-50/60 to-teal-50/70 p-4">
      <div className="shrink-0">
        <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-700 shadow-sm">
            <Hospital size={20} />
          </div>
          <div className="min-w-0">
            <div className="text-base font-black text-slate-950">
              Nearby Hospitals
            </div>
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
              Location-based care options and quick guidance.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onFindHospitals}
          disabled={loading}
          className="gradient-button flex shrink-0 items-center gap-1 rounded-2xl px-3 py-2.5 text-xs font-black disabled:opacity-60"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <MapPin size={13} />}
          Find
        </button>
        </div>
      </div>

      {error ? (
        <div className="mt-3 shrink-0 rounded-2xl border border-red-200 bg-red-50 p-3 text-xs font-semibold leading-5 text-red-700">
          {error}
        </div>
      ) : null}

      {hasHospitals ? (
        <div className="relative z-0 mt-3 h-[120px] shrink-0 overflow-hidden rounded-2xl border border-cyan-100 bg-gradient-to-br from-cyan-50 via-white to-teal-50 p-3 shadow-inner">
          <div className="relative h-full overflow-hidden rounded-xl bg-[linear-gradient(135deg,rgba(14,165,233,0.16),rgba(20,184,166,0.12)),linear-gradient(90deg,rgba(15,23,42,0.05)_1px,transparent_1px),linear-gradient(rgba(15,23,42,0.05)_1px,transparent_1px)] bg-[size:auto,28px_28px,28px_28px]">
            <div className="absolute left-[18%] top-[26%] h-2.5 w-2.5 rounded-full bg-teal-600 shadow-[0_0_0_6px_rgba(20,184,166,0.16)]" />
            <div className="absolute right-[22%] top-[42%] h-2.5 w-2.5 rounded-full bg-blue-600 shadow-[0_0_0_6px_rgba(37,99,235,0.14)]" />
            <div className="absolute bottom-[20%] left-[46%] h-2.5 w-2.5 rounded-full bg-cyan-600 shadow-[0_0_0_6px_rgba(6,182,212,0.14)]" />
            <div className="absolute inset-x-5 top-1/2 h-px rotate-[-14deg] bg-cyan-500/25" />
            <div className="absolute bottom-3 left-3 rounded-full bg-white/85 px-3 py-1 text-[11px] font-black text-slate-600 shadow-sm">
              {hospitals.length} nearby
            </div>
          </div>
        </div>
      ) : null}

      <div className="custom-scrollbar relative z-10 mt-3 min-h-[150px] flex-1 space-y-2 overflow-y-auto pr-1">
        {hospitals.length === 0 && !loading ? (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-4 text-xs font-semibold leading-5 text-slate-500">
            Click Find to load nearby hospitals.
          </p>
        ) : null}

        {hospitals.map((hospital) => (
          <div
            key={hospital.id || hospital.name}
            className="rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-sm"
          >
            <p className="text-xs font-black leading-4 text-slate-950">
              {hospital.name}
            </p>
            <p className="mt-1 line-clamp-2 text-[11px] font-semibold leading-4 text-slate-500">
              {hospital.address}
            </p>
            <div className="mt-2 flex items-center justify-between gap-2 text-[11px] font-black text-teal-700">
              <span>{hospital.distance_km} km away</span>
              {hospital.website ? (
                <a
                  href={hospital.website}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  Website
                </a>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2 last:border-b-0 last:pb-0">
      <span className="text-xs font-bold text-slate-500">{label}</span>
      <span className="text-right text-xs font-black text-slate-950">
        {value || "Not set"}
      </span>
    </div>
  );
}

function DoctorDropdown({ selectedDoctor, setSelectedDoctor }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="input-field flex w-full items-center justify-between text-left text-sm font-semibold"
      >
        <span className="truncate">{selectedDoctor.name}</span>
        <span className="ml-2 text-slate-400">{open ? "▲" : "⌄"}</span>
      </button>

      {open ? (
        <div className="custom-scrollbar mt-2 max-h-[132px] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl">
          {DOCTORS.map((doctor) => (
            <button
              key={doctor.id}
              type="button"
              onClick={() => {
                setSelectedDoctor(doctor);
                setOpen(false);
              }}
              className={`block w-full px-3 py-2.5 text-left text-sm font-semibold leading-5 transition-colors ${
                selectedDoctor.id === doctor.id
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              {doctor.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DoctorAndProfilePanel({
  profile,
  setProfile,
  profileSubmitted,
  dobError,
  setDobError,
  onStartConsultation
}) {
  const [error, setError] = useState("");
  const [dobTouched, setDobTouched] = useState(false);
  const todayIso = new Date().toISOString().split("T")[0];
  const calendarInputRef = useRef(null);

  function handleProfileChange(field, value) {
    if (field === "dob") {
      setDobTouched(true);
      const parsedDob = parseDobInput(value);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (value.trim() === "") {
        setDobError("");
        setProfile((previous) => ({
          ...previous,
          dob: value
        }));
        return;
      }

      if (!parsedDob) {
        const compactValue = value.replace(/\s+/g, "");
        setDobError(
          compactValue.length >= 8 ? "Please enter a valid date of birth." : ""
        );
        setProfile((previous) => ({
          ...previous,
          dob: value
        }));
        return;
      }

      if (parsedDob > today) {
        setDobError("Date of birth cannot be in the future.");
        setProfile((previous) => ({
          ...previous,
          dob: value
        }));
        return;
      }

      const calculatedAge = calculateAgeFromDob(parsedDob);
      if (calculatedAge == null) {
        setDobError("Please enter a valid date of birth.");
        setProfile((previous) => ({
          ...previous,
          dob: value
        }));
        return;
      }

      setDobError("");
      setProfile((previous) => ({
        ...previous,
        dob: value,
        age: calculatedAge
      }));
      return;
    }

    if (field === "age") {
      setDobError("");
    }

    setProfile((previous) => ({
      ...previous,
      [field]: value
    }));
  }

  function handleSubmit(event) {
    event.preventDefault();

    if (!validateProfile(profile)) {
      setError("Please enter a valid name, date of birth, age, and sex before starting the consultation.");
      return;
    }

    if (profile.dob?.trim() && dobError) {
      setError("Please correct the date of birth before starting the consultation.");
      return;
    }

    setError("");
    onStartConsultation();
  }

  function toIsoDateString(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, "0");
    const d = String(dateObj.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function openNativeDatePicker() {
    if (calendarInputRef.current?.showPicker) {
      calendarInputRef.current.showPicker();
      return;
    }
    calendarInputRef.current?.focus();
    calendarInputRef.current?.click();
  }

  return (
    <section className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <form onSubmit={handleSubmit} className="card relative z-0 flex h-full min-h-0 flex-col overflow-hidden p-1">
        

        <div className="card card-green custom-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
          <SectionHeader
            icon={<ClipboardList size={18} className="text-secondary" />}
            title="Patient Profile"
            subtitle="Complete patient details to personalize the consultation flow."
          />

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-700 font-black">
                {profile.name ? profile.name.split(" ").map((n) => n[0]).slice(0,2).join("") : <UserRound size={20} />}
              </div>
              <div>
                <div className="text-sm font-black text-slate-900">{profile.name || "Not set"}</div>
                <div className="text-xs text-slate-500">{profile.age ? `Age: ${profile.age}` : ""}{profile.sex ? ` · ${profile.sex}` : ""}</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="name">Name</label>
              <input
                id="name"
                className="input-field"
                value={profile.name}
                onChange={(event) => handleProfileChange("name", event.target.value)}
                placeholder="Enter patient name"
              />
            </div>

            <div>
              <label className="label" htmlFor="dob">Date of Birth</label>
              <div className="flex items-center gap-2">
                <input
                  id="dob"
                  type="text"
                  className="input-field"
                  value={profile.dob}
                  onChange={(event) => handleProfileChange("dob", event.target.value)}
                  placeholder="DD-MM-YYYY"
                />
                <button
                  type="button"
                  onClick={openNativeDatePicker}
                  className="secondary-button inline-flex h-10 w-10 items-center justify-center rounded-xl px-0"
                  aria-label="Open date picker"
                  title="Open date picker"
                >
                  <CalendarDays size={16} />
                </button>
                <input
                  ref={calendarInputRef}
                  type="date"
                  max={todayIso}
                  className="sr-only"
                  tabIndex={-1}
                  value={
                    parseDobInput(profile.dob)
                      ? toIsoDateString(parseDobInput(profile.dob))
                      : ""
                  }
                  onChange={(event) => handleProfileChange("dob", event.target.value)}
                />
              </div>
              {dobTouched && dobError ? (
                <p className="mt-1 text-xs font-semibold text-red-600">{dobError}</p>
              ) : null}
            </div>

            <div>
              <label className="label" htmlFor="age">Age</label>
              <input
                id="age"
                type="number"
                min="0"
                max="120"
                className="input-field"
                value={profile.age}
                onChange={(event) => handleProfileChange("age", Number(event.target.value))}
                placeholder="Age"
              />
            </div>

            <div>
              <label className="label" htmlFor="sex">Sex</label>
              <select
                id="sex"
                className="input-field"
                value={profile.sex}
                onChange={(event) => handleProfileChange("sex", event.target.value)}
              >
                <option value="">Select</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </select>
            </div>

            <div>
              <label className="label" htmlFor="allergies">Allergies</label>
              <input
                id="allergies"
                className="input-field"
                value={profile.allergies}
                onChange={(event) => handleProfileChange("allergies", event.target.value)}
                placeholder="e.g., Penicillin"
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="medications">Medications</label>
            <textarea
              id="medications"
              rows={1}
              className="input-field resize-none h-10 overflow-y-auto"
              value={profile.medications}
              onChange={(event) => handleProfileChange("medications", event.target.value)}
              placeholder="e.g., Metformin"
            />
          </div>

          <div>
            <label className="label" htmlFor="conditions">Conditions</label>
            <textarea
              id="conditions"
              rows={1}
              className="input-field resize-none h-10 overflow-y-auto"
              value={profile.conditions}
              onChange={(event) => handleProfileChange("conditions", event.target.value)}
              placeholder="e.g., Diabetes"
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <button
              type="submit"
              className="gradient-button flex-1 rounded-2xl px-4 py-2 text-sm font-black"
            >
              Start Consultation
            </button>
            <button
              type="button"
              onClick={() => setProfile(INITIAL_PROFILE)}
              className="secondary-button ml-2 rounded-2xl px-4 py-2 text-sm font-black"
            >
              Clear
            </button>
          </div>
        </div>

        {error ? (
          <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : null}

        {profileSubmitted ? (
          <div className="mt-3 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">
            Patient profile saved. Consultation is active.
          </div>
        ) : null}

        
      </form>
    </section>
  );
}

function TextAreaField({ id, label, value, placeholder, onChange }) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        rows={1}
        className="input-field resize-none"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function TriageAlert({ status }) {
  const normalizedStatus =
    typeof status === "string" && status.trim()
      ? status.trim().toLowerCase()
      : "neutral";

  if (normalizedStatus === "neutral") {
    return null;
  }

  const config = {
    urgent: {
      className: "border-red-200 bg-red-50 text-red-800",
      icon: <AlertTriangle size={18} />,
      title: "Seek immediate medical attention",
      body:
        "Symptoms may indicate a medical emergency. Contact emergency services or visit the nearest emergency department now."
    },
    warning: {
      className: "border-amber-200 bg-amber-50 text-amber-800",
      icon: <AlertTriangle size={18} />,
      title: "Medical review recommended",
      body:
        "Symptoms may require timely clinician evaluation, especially if worsening or persistent."
    },
    safe: {
      className: "border-green-200 bg-green-50 text-green-800",
      icon: <ShieldCheck size={18} />,
      title: "No immediate emergency red flags detected",
      body:
        "Continue monitoring. Seek care if symptoms worsen or new red flags appear."
    }
  };

  const statusAlias = {
    "non-urgent": "safe",
    nonurgent: "safe",
    low: "safe",
    moderate: "warning",
    high: "urgent"
  };

  const mappedStatus = statusAlias[normalizedStatus] || normalizedStatus;
  const item = config[mappedStatus];

  if (!item) {
    return null;
  }

  return (
    <div className={`mb-4 rounded-2xl border p-3 ${item.className}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{item.icon}</div>
        <div>
          <p className="font-black">{item.title}</p>
          <p className="mt-1 text-sm font-medium leading-5">{item.body}</p>
        </div>
      </div>
    </div>
  );
}

function ChatPanel({
  chatHistory,
  profileSubmitted,
  sessionActive,
  triageStatus,
  loading,
  error,
  onSendMessage,
  profile,
  selectedDoctorName
}) {
  const [message, setMessage] = useState("");
  const chatContainerRef = useRef(null);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [chatHistory, loading]);

 
  

  function handleSubmit(event) {
    event.preventDefault();

    const clean = message.trim();

    if (!clean) {
      return;
    }

    onSendMessage(clean);
    setMessage("");
  }

  const disabled = !profileSubmitted || !sessionActive || loading;

  return (
    <section className="consultation-chat-card card card-purple flex h-full min-h-[520px] flex-col overflow-hidden p-3 xl:min-h-0">
      <div className="mb-0.5 shrink-0 flex items-center justify-between gap-2">
        <div>
          <SectionHeader
            icon={<MessageCircle size={18} className="text-primary" />}
            title="Consultation Chat"
            subtitle=""
          />
        </div>
        
      </div>

      <div className="flex min-h-0 flex-1 flex-col">

        

        <div
          ref={chatContainerRef}
          className="chat-bg-panel custom-scrollbar min-h-0 flex-1 overflow-y-auto rounded-[18px] border border-cyan-100 p-2.5 shadow-inner"
        >
          <div className="relative z-10 flex min-h-full flex-col space-y-3">
      
            {chatHistory.length === 0 ? (
              <div className="empty-chat-glass flex min-h-[220px] flex-col items-center justify-center rounded-2xl p-6 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-500 to-cyan-400 text-white shadow-lg">
                  <Bot size={26} />
                </div>
                <h3 className="text-lg font-black text-slate-950">
                  No conversation yet
                </h3>

                <p className="mt-2 max-w-sm text-sm font-semibold leading-6 text-slate-600">
                  Complete the patient profile and start the consultation to begin.
                </p>

              </div>
            ) : (
              <>
                {chatHistory.map((item) => (
                  <ChatBubble key={item.id} message={item} />
                ))}

                {loading ? (
                  <div className="flex justify-start">
                    <div className="loading-bubble-glass max-w-[80%] rounded-2xl rounded-bl-md border border-slate-200 px-4 py-3 shadow-sm">
                      <div className="flex items-center gap-2 text-sm font-bold text-slate-600">
                        <Loader2 size={16} className="animate-spin text-primary" />
                        {selectedDoctorName || "Assistant"} is reviewing your message...
                      </div>
                    </div>
                  </div>
                ) : null}
              </>
            )}

          </div>
        </div>

      </div>
      {error ? (
        <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700">
          {error}
        </div>
      ) : null}

      {!profileSubmitted ? (
        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800">
          Please complete the patient profile before starting the chat.
        </div>
      ) : null}

      {!sessionActive ? (
        <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700">
          This session has ended. Start a new session to continue.
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="chat-input-bar mt-2 flex shrink-0 gap-2 rounded-2xl border border-cyan-100 p-1.5">
        <input
          className="input-field flex-1 border-0 bg-transparent shadow-none focus:shadow-none"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder={
            !profileSubmitted
              ? "Complete profile to unlock chat..."
              : !sessionActive
                ? "Session ended"
                : "Describe symptoms, duration, severity, triggers..."
          }
          disabled={disabled}
        />

        <button
          type="submit"
          disabled={disabled || !message.trim()}
          className="gradient-button send-button flex min-w-[108px] items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-black disabled:opacity-50"
        >
          {loading ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
          Send
        </button>
      </form>
    </section>
  );
}

function ChatBubble({ message }) {
  const isUser = message.role === "user";
  const displayName = isUser ? "Patient" : (message.doctorName || "Assistant");

  return (
    <div className={`flex ${isUser ? "justify-end pr-3" : "justify-start"}`}>
      <div
        className={`max-w-[84%] rounded-2xl px-4 py-3 shadow-sm ${
          isUser
            ? "patient-bubble rounded-br-md text-white"
            : "assistant-bubble-glass doctor-bubble rounded-bl-md border text-slate-900"
        }`}
      >
        <div
          className={`mb-1 flex items-center gap-2 text-xs font-black ${
            isUser ? "text-blue-50" : "text-slate-500"
          }`}
        >
          {isUser ? <UserRound size={13} /> : <Bot size={13} />}
          {displayName}
        </div>

        <p className="whitespace-pre-wrap text-sm leading-6">
          {message.content}
        </p>

        <p
          className={`mt-2 text-[11px] font-bold ${
            isUser ? "text-blue-100" : "text-slate-400"
          }`}
        >
          {message.timestamp}
        </p>
      </div>
    </div>
  );
}

function InsightBadge({ children, tone = "blue" }) {
  const toneClass = {
    blue: "bg-blue-50 text-blue-700 ring-blue-100",
    green: "bg-green-50 text-green-700 ring-green-100",
    amber: "bg-amber-50 text-amber-700 ring-amber-100",
    red: "bg-red-50 text-red-700 ring-red-100"
  }[tone];

  return (
    <span className={`status-badge inline-flex rounded-full px-2.5 py-1 text-[11px] font-black ring-1 ${toneClass}`}>
      {children}
    </span>
  );
}

function SoapSummaryPanel({ soapSummary }) {
  const storedSummary = parseStoredSummary(soapSummary);
  const displaySummary =
    storedSummary && typeof storedSummary === "object" && !Array.isArray(storedSummary)
      ? storedSummary
      : storedSummary
        ? { Summary: storedSummary }
        : INITIAL_SOAP;
  const sectionTone = {
    Subjective: "bg-blue-50 text-blue-700 border-blue-100",
    Objective: "bg-cyan-50 text-cyan-700 border-cyan-100",
    Assessment: "bg-amber-50 text-amber-700 border-amber-100",
    Plan: "bg-teal-50 text-teal-700 border-teal-100"
  };

  return (
    <aside className="soap-panel card card-orange flex h-full min-h-[360px] flex-col overflow-hidden p-3 xl:min-h-0">
      <div className="mb-0.5 shrink-0">
        <div className="mb-1.5 flex items-center justify-between gap-3">
          <SectionHeader
            icon={<ClipboardList size={18} className="text-primary" />}
            title="SOAP Summary"
            subtitle="Stored summary for this session."
          />
          <InsightBadge tone="blue">Database Summary</InsightBadge>
        </div>
      </div>

      <div className="custom-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {Object.keys(displaySummary).map((key) => (
          <div
            key={key}
            className="soap-note-item rounded-2xl border px-3 py-2 shadow-sm"
          >
            <p className={`mb-0.5 inline-flex rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-wide ${sectionTone[key] || "bg-slate-50 text-slate-700 border-slate-100"}`}>
              {key}
            </p>
            <p className="line-clamp-4 text-sm leading-5 text-slate-700 before:mr-2 before:text-blue-500 before:content-['•']">
              <span className="block whitespace-pre-wrap">
                {renderStoredSummaryValue(displaySummary[key])}
              </span>
            </p>
          </div>
        ))}
      </div>
    </aside>
  );
}

function SafetySignalsPanel({
  triageStatus,
  safetySignals,
  diagnosisGiven,
  messageCount,
  profileSubmitted,
  sessionActive
}) {
  const resolvedTriageStatusRaw = safetySignals?.status ?? triageStatus;
  const normalizedRawStatus =
    typeof resolvedTriageStatusRaw === "string" && resolvedTriageStatusRaw.trim()
      ? resolvedTriageStatusRaw.trim().toLowerCase()
      : "neutral";
  const statusAlias = {
    "non-urgent": "safe",
    nonurgent: "safe",
    low: "safe",
    moderate: "warning",
    high: "urgent"
  };
  let resolvedTriageStatus = statusAlias[normalizedRawStatus] || normalizedRawStatus;

  // Once diagnosis/advice is available, avoid falling back to "Collecting".
  if (diagnosisGiven && resolvedTriageStatus === "neutral") {
    resolvedTriageStatus = "safe";
  }
  const riskConfig = {
    urgent: {
      tone: "red",
      label: "Emergency",
      className: "border-red-200 bg-red-50 text-red-700",
      reason: "Red-flag symptoms detected - urgent medical review recommended."
    },
    warning: {
      tone: "amber",
      label: "Warning",
      className: "border-amber-200 bg-amber-50 text-amber-700",
      reason: "Symptoms may need timely clinician review if persistent or worsening."
    },
    safe: {
      tone: "green",
      label: "Low Risk",
      className: "border-green-200 bg-green-50 text-green-700",
      reason: "No immediate emergency red flags detected from current details."
    },
    neutral: {
      tone: "blue",
      label: "Collecting",
      className: "border-blue-200 bg-blue-50 text-blue-700",
      reason: "More symptom details are needed before assigning risk clearly."
    }
  }[resolvedTriageStatus] || {
    tone: "blue",
    label: "Collecting",
    className: "border-blue-200 bg-blue-50 text-blue-700",
    reason: "More symptom details are needed before assigning risk clearly."
  };

  return (
    <aside className={`safety-panel safety-${resolvedTriageStatus} card card-pink flex min-h-0 flex-col overflow-hidden p-4 xl:h-full`}>
      <div className="mb-3 shrink-0">
        <div className="mb-2 flex items-center justify-between gap-3">
          <SectionHeader
            icon={<ShieldCheck size={18} className="text-secondary" />}
            title="Safety Signals"
            subtitle="Real-time risk and session status."
          />
          <InsightBadge tone={riskConfig.tone}>Risk Check</InsightBadge>
        </div>

        <div className={`risk-banner rounded-2xl border px-3 py-3 ${riskConfig.className}`}>
          <p className="text-[11px] font-black uppercase tracking-wide">
            Current Status
          </p>
          <p className="mt-1 text-base font-black">{riskConfig.label}</p>
          <p className="mt-2 text-xs font-semibold leading-5 opacity-90">
            {safetySignals?.message || riskConfig.reason}
          </p>
        </div>
      </div>

      <div className="custom-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        <MetricCard
          icon={<HeartPulse size={17} />}
          label="Triage"
          value={resolvedTriageStatus.charAt(0).toUpperCase() + resolvedTriageStatus.slice(1)}
        />

        <MetricCard
          icon={<MessageCircle size={17} />}
          label="Messages"
          value={messageCount}
        />

        <MetricCard
          icon={<UserRound size={17} />}
          label="Profile"
          value={profileSubmitted ? "Complete" : "Pending"}
        />

        <MetricCard
          icon={<Activity size={17} />}
          label="Session"
          value={sessionActive ? "Active" : "Ended"}
        />
      </div>
    </aside>
  );
}

function MetricCard({ icon, label, value }) {
  return (
    <div className="metric-card rounded-2xl border border-slate-200 p-2.5">
      <div className="flex items-center gap-3">
        <div className="metric-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-600">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">
            {label}
          </p>
          <p className="truncate text-sm font-black text-slate-950">{value}</p>
        </div>
      </div>
    </div>
  );
}

function Header({
  selectedDoctor,
  profile,
  sessionId,
  sessionStatus,
  currentPage,
  sessionActive,
  onEndSession,
  onOpenHistorySearch
}) {
  const resolvedDoctor =
    DOCTORS.find((doctor) => doctor.id === selectedDoctor?.id) || selectedDoctor;
  const doctorName = (resolvedDoctor?.name || "Doctor").split(" (")[0];
  const doctorSpecialty =
    (resolvedDoctor?.name || "").split(" (")[1]?.replace(")", "") || "General Physician";
  const doctorExperience = resolvedDoctor?.experience || "Experience not specified";
  const patientName = profile.name?.trim() || "Not set";
  const patientAge = profile.name?.trim() && profile.age ? `Age: ${profile.age}` : "Age: --";

  return (
    <header
      className="relative shrink-0 overflow-hidden rounded-[24px] border border-cyan-300/25 p-2 shadow-[0_18px_46px_rgba(8,47,73,0.22)]"
      style={{
        backgroundImage: `
          linear-gradient(90deg, rgba(2,6,23,0.96) 0%, rgba(8,47,73,0.92) 44%, rgba(14,116,144,0.52) 72%, rgba(37,99,235,0.22) 100%),
          url(${aiMedicalHeaderBg})
        `,
        backgroundPosition: "center right",
        backgroundSize: "cover"
      }}
    >
      <div className="absolute inset-0 bg-[linear-gradient(rgba(125,211,252,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(125,211,252,0.08)_1px,transparent_1px)] bg-[size:34px_34px]" />
      <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent" />

      <div className="relative z-10 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-4">
          <div className="relative flex h-16 w-16 items-center justify-center rounded-full border border-cyan-300/40 bg-slate-950/20 text-white shadow-[0_0_30px_rgba(6,182,212,0.36)] backdrop-blur-md">
            <MessageCircle size={30} />
            <div className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-slate-950 bg-cyan-100 text-teal-700 shadow-[0_0_18px_rgba(103,232,249,0.65)]">
              <Cross size={12} strokeWidth={3} />
            </div>
          </div>

          <div>
            <h1 className="text-2xl font-black tracking-tight text-white md:text-3xl">
              <span className="bg-gradient-to-r from-cyan-200 via-white to-cyan-100 bg-clip-text text-transparent">
                AI Medical
              </span>{" "}
              Assistant
            </h1>
            <p className="mt-0.5 text-sm font-semibold leading-5 text-cyan-50/85">
              Smart clinical consultation support
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-3 py-2 text-[11px] font-semibold text-cyan-50 shadow-[0_10px_30px_rgba(2,6,23,0.16)] backdrop-blur-md">
                <span className="uppercase tracking-[0.22em] text-cyan-100/80">
                  Session ID
                </span>
                <span className="font-black tracking-[0.18em] text-white">
                  {sessionId || (sessionStatus === "active" ? "Creating..." : "Not Started")}
                </span>
              </div>

              <button
                type="button"
                onClick={onOpenHistorySearch}
                className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-white transition hover:bg-white/15"
              >
                <Search size={14} />
                View History
              </button>
            </div>
          </div>
        </div>

        {currentPage === "consultation" ? (
          <div className="flex w-full flex-col gap-2 rounded-[22px] border border-white/70 bg-white/95 p-2 text-slate-950 shadow-[0_18px_50px_rgba(15,23,42,0.16)] backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between xl:max-w-[560px]">
            <div className="flex min-w-0 items-center gap-3">
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-2xl border border-blue-100 bg-blue-50">
                <img
                  src={doctorHero}
                  alt={doctorName}
                  className="h-full w-full object-cover object-top"
                />
              </div>

              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                  Consultation With
                </p>
                <p className="mt-1 text-sm font-black text-slate-950 md:text-base">
                  {doctorName}
                </p>
                <p className="mt-0.5 text-xs font-bold text-slate-500">
                  {doctorSpecialty}
                </p>
                <p className="mt-0.5 text-xs font-semibold text-slate-500">
                  {doctorExperience}
                </p>
              </div>
            </div>

            <div className="min-w-[118px] rounded-2xl bg-slate-50/80 px-3 py-2">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                Patient
              </p>
              <p className="mt-1 text-sm font-black text-slate-950 md:text-base">
                {patientName}
              </p>
              <p className="mt-0.5 text-xs font-bold text-slate-500">
                {patientAge}
              </p>
            </div>

            <button
              type="button"
              onClick={onEndSession}
              disabled={!sessionActive}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl border border-red-300 bg-white px-4 py-3 text-sm font-black text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <XCircle size={16} strokeWidth={2.6} />
              End Session
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}

function HistorySearchModal({
  open,
  searchForm,
  setSearchForm,
  dobError,
  loading,
  error,
  results,
  selectedResult,
  onSelectResult,
  onClose,
  onSearch
}) {
  const activeResult = selectedResult || (Array.isArray(results) ? results[0] : null);
  const summaryValue = parseStoredSummary(activeResult?.summary);
  const soapEntries =
    summaryValue && typeof summaryValue === "object" && !Array.isArray(summaryValue)
      ? Object.entries(summaryValue)
      : null;
  const hasResults = Array.isArray(results) && results.length > 0;

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 px-4 py-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="custom-scrollbar flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-[30px] border border-white/70 bg-white shadow-[0_40px_120px_rgba(15,23,42,0.34)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shrink-0 border-b border-slate-200 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.28em] text-cyan-700">
              Consultation History
            </p>
            <h3 className="mt-1 text-xl font-black text-slate-950">
              Search by Name and DOB
            </h3>
            <p className="mt-1 text-sm font-semibold leading-5 text-slate-500">
              Enter the patient details to retrieve matching consultation records, then open any result to view the SOAP summary and full chat.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
            aria-label="Close history search"
          >
            <XCircle size={18} />
          </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-5 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div className="flex min-h-0 flex-col gap-4">
            <form onSubmit={onSearch} className="rounded-[26px] border border-slate-200 bg-slate-50/80 p-4 lg:sticky lg:top-0 lg:self-start">
              <div className="space-y-3">
                <div>
                  <label className="label" htmlFor="history-patient-name">
                    Patient Name
                  </label>
                  <input
                    id="history-patient-name"
                    className="input-field"
                    value={searchForm.patientName}
                    onChange={(event) =>
                      setSearchForm((previous) => ({
                        ...previous,
                        patientName: event.target.value
                      }))
                    }
                    placeholder="Abhi"
                  />
                </div>

                <div>
                  <label className="label" htmlFor="history-dob">
                    Date of Birth
                  </label>
                  <input
                    id="history-dob"
                    type="text"
                    className="input-field"
                    value={searchForm.dob}
                    onChange={(event) =>
                      setSearchForm((previous) => ({
                        ...previous,
                        dob: event.target.value
                      }))
                    }
                    placeholder="DD-MM-YYYY"
                    inputMode="numeric"
                  />
                  <p className="mt-1 text-[11px] font-semibold text-slate-500">
                    Accepts DD-MM-YYYY, DD/MM/YYYY, or YYYY-MM-DD.
                  </p>
                  {dobError ? (
                    <p className="mt-1 text-xs font-semibold text-red-600">{dobError}</p>
                  ) : null}
                </div>

                {error ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
                    {error}
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={loading}
                  className="gradient-button inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black disabled:opacity-60"
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                  Search History
                </button>
              </div>
            </form>

            <div className="custom-scrollbar flex min-h-0 flex-1 flex-col overflow-hidden rounded-[26px] border border-slate-200 bg-white p-4">
              {!hasResults ? (
                <div className="flex min-h-[240px] items-center justify-center rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-6 text-center">
                  <div className="max-w-sm">
                    <p className="text-base font-black text-slate-900">
                      {loading ? "Searching consultation history..." : "Search results will appear here."}
                    </p>
                    <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
                      Enter the patient name and date of birth to load matching consultation records.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col gap-3 justify-start">
                  <div className="rounded-[22px] border border-cyan-100 bg-gradient-to-br from-cyan-50 to-white p-3">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <h4 className="text-sm font-black uppercase tracking-[0.2em] text-cyan-700">
                          Matching Records
                        </h4>
                        <p className="mt-1 text-sm font-semibold text-slate-500">
                          {results.length} record{results.length === 1 ? "" : "s"} found
                        </p>
                      </div>
                    </div>

                    <div className="custom-scrollbar max-h-[340px] space-y-3 overflow-y-auto pr-1">
                      {results.map((record) => {
                        const isSelected = activeResult?.session_id === record.session_id;
                        return (
                          <HistoryRecordCard
                            key={record.session_id}
                            record={record}
                            isSelected={isSelected}
                            onSelect={onSelectResult}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="custom-scrollbar flex min-h-0 flex-col overflow-hidden rounded-[26px] border border-slate-200 bg-white p-4">
            {!hasResults ? (
              <div className="flex min-h-[240px] items-center justify-center rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-6 text-center">
                <div className="max-w-sm">
                  <p className="text-base font-black text-slate-900">
                    {loading ? "Searching consultation history..." : "Select a record to see the SOAP summary and full chat."}
                  </p>
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
                    Matching records appear below the search form on the left.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col gap-3 justify-start">
                <div className="rounded-[22px] border border-cyan-100 bg-white p-3">
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    <HistoryDetail label="Session ID" value={activeResult?.session_id} />
                    <HistoryDetail label="Patient Name" value={activeResult?.patient_name} />
                    <HistoryDetail label="Date of Birth" value={activeResult?.dob} />
                    <HistoryDetail label="Age" value={activeResult?.age} />
                    <HistoryDetail label="Sex" value={activeResult?.sex} />
                    <HistoryDetail label="Date Saved" value={formatDateTimeValue(activeResult?.date)} />
                  </div>
                </div>

                <div className="grid min-h-0 gap-3 xl:grid-cols-2">
                  <section className="flex min-h-0 flex-col rounded-[22px] border border-slate-200 bg-slate-50 p-3">
                    <h4 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">
                      SOAP Summary
                    </h4>
                    <div className="mt-2 max-h-[420px] min-h-0 flex-1 overflow-y-auto pr-2">
                      <div className="rounded-2xl bg-white p-3 text-sm leading-6 text-slate-700 shadow-sm">
                        {soapEntries ? (
                          <div className="space-y-3">
                            {soapEntries.map(([key, value]) => (
                              <div key={key} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
                                <p className="text-sm leading-5 text-slate-700">
                                  <span className="font-semibold uppercase tracking-wide text-slate-700">
                                    {key}
                                  </span>
                                  <span className="font-sans">: </span>
                                  <span className="whitespace-pre-wrap font-sans">
                                    {renderStoredSummaryValue(value) || "Pending"}
                                  </span>
                                </p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <pre className="whitespace-pre-wrap font-sans">
                            {summaryValue ? renderStoredSummaryValue(summaryValue) || "Pending" : "Pending"}
                          </pre>
                        )}
                      </div>
                    </div>
                  </section>

                  <section className="flex min-h-0 flex-col rounded-[22px] border border-slate-200 bg-slate-50 p-3">
                    <h4 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">
                      Full Chat
                    </h4>
                    <div className="custom-scrollbar mt-2 max-h-[420px] min-h-0 flex-1 space-y-3 overflow-y-auto pr-2">
                      {Array.isArray(activeResult?.full_chat) && activeResult.full_chat.length > 0 ? (
                        activeResult.full_chat.map((entry, index) => (
                          <div
                            key={`${entry.timestamp || index}-${index}`}
                            className={`rounded-2xl border px-3 py-3 shadow-sm ${
                              entry.role === "assistant"
                                ? "border-cyan-100 bg-cyan-50/80"
                                : "border-slate-200 bg-white"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                                {entry.role}
                              </span>
                              <span className="text-[11px] font-bold text-slate-400">
                                {formatDateTimeValue(entry.timestamp)}
                              </span>
                            </div>
                            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                              {entry.message}
                            </p>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-sm font-semibold text-slate-500">
                          No chat messages available for this consultation.
                        </div>
                      )}
                    </div>
                  </section>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function HistoryDetail({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-black text-slate-950">
        {value || "Not set"}
      </p>
    </div>
  );
}

function HistoryRecordCard({ record, isSelected, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(record)}
      className={`w-full rounded-2xl border p-3 text-left shadow-sm transition ${
        isSelected
          ? "border-cyan-300 bg-cyan-50 ring-2 ring-cyan-200"
          : "border-slate-200 bg-white hover:border-cyan-200 hover:bg-cyan-50/50"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-slate-950">
            {record.patient_name || "Unknown patient"}
          </p>
          <p className="mt-1 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
            Session ID: {record.session_id}
          </p>
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
          {formatDateTimeValue(record.date)}
        </span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <HistoryDetail label="DOB" value={record.dob} />
        <HistoryDetail label="Age" value={record.age} />
        <HistoryDetail label="Sex" value={record.sex} />
      </div>
    </button>
  );
}

export default function App() {
  const [currentPage, setCurrentPage] = useState("setup");
  const [sessionId, setSessionId] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  const [selectedDoctor, setSelectedDoctor] = useState(DOCTORS[0]);
  const [profile, setProfile] = useState(INITIAL_PROFILE);
  const [profileSubmitted, setProfileSubmitted] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionStatus, setSessionStatus] = useState("not_started");
  const [dobError, setDobError] = useState("");
  const [triageStatus, setTriageStatus] = useState("neutral");
  const [soapSummary, setSoapSummary] = useState(null);
  const [showSoapPanel, setShowSoapPanel] = useState(false);
  const [problemUnderstood, setProblemUnderstood] = useState(false);
  const [diagnosisGiven, setDiagnosisGiven] = useState(false);
  const [safetySignals, setSafetySignals] = useState(null);
  const [showSafetySignals, setShowSafetySignals] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historySearchForm, setHistorySearchForm] = useState({
    patientName: "",
    dob: ""
  });
  const [historySearchResults, setHistorySearchResults] = useState([]);
  const [selectedHistoryResult, setSelectedHistoryResult] = useState(null);
  const [historySearchLoading, setHistorySearchLoading] = useState(false);
  const [historySearchError, setHistorySearchError] = useState("");
  const [historyDobError, setHistoryDobError] = useState("");
  const historySearchRequestIdRef = useRef(0);

  const [loadingSession, setLoadingSession] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);
  const [endingSession, setEndingSession] = useState(false);
  const [loadingHospitals, setLoadingHospitals] = useState(false);
  const [nearbyHospitals, setNearbyHospitals] = useState([]);
  const [hospitalError, setHospitalError] = useState("");
  const [error, setError] = useState("");

  const showSoapSummary = diagnosisGiven && Boolean(parseStoredSummary(soapSummary));
  const showInsightPanels = showSoapSummary || showSafetySignals;

  useEffect(() => {
    if (!showHistoryModal) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        closeHistorySearchModal();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showHistoryModal]);

  const messageCount = useMemo(() => chatHistory.length, [chatHistory]);

  function openHistorySearchModal() {
    setHistorySearchError("");
    setHistoryDobError("");
    setShowHistoryModal(true);
  }

  function closeHistorySearchModal() {
    historySearchRequestIdRef.current += 1;
    setHistorySearchForm({
      patientName: "",
      dob: ""
    });
    setHistorySearchResults([]);
    setSelectedHistoryResult(null);
    setHistorySearchLoading(false);
    setHistorySearchError("");
    setHistoryDobError("");
    setShowHistoryModal(false);
  }

  async function handleSearchHistory(event) {
    event.preventDefault();

    setHistorySearchLoading(true);
    setHistorySearchError("");
    setHistoryDobError("");
    setHistorySearchResults([]);
    setSelectedHistoryResult(null);

    const parsedDob = parseDobInput(historySearchForm.dob);

    if (!historySearchForm.patientName.trim() || !historySearchForm.dob.trim()) {
      setHistorySearchLoading(false);
      setHistorySearchError("Please fill in patient name and date of birth.");
      return;
    }

    if (!parsedDob) {
      setHistorySearchLoading(false);
      setHistoryDobError("Please enter a valid date of birth.");
      return;
    }

    if (isFutureDate(parsedDob)) {
      setHistorySearchLoading(false);
      setHistoryDobError("Date of birth cannot be in the future.");
      return;
    }

    const requestId = historySearchRequestIdRef.current + 1;
    historySearchRequestIdRef.current = requestId;

    try {
      const data = await searchConsultationHistory({
        patientName: historySearchForm.patientName.trim(),
        dob: normalizeDobForBackend(historySearchForm.dob)
      });

      const records = Array.isArray(data)
        ? data
        : Array.isArray(data?.records)
          ? data.records
          : [];

      if (historySearchRequestIdRef.current === requestId) {
        setHistorySearchResults(records);
        setSelectedHistoryResult(records[0] ?? null);
      }
    } catch (err) {
      if (historySearchRequestIdRef.current !== requestId) {
        return;
      }

      console.error(err);
      if (err?.status === 404) {
        setHistorySearchError("No consultation history found.");
      } else if (err?.detail) {
        setHistorySearchError(err.detail);
      } else {
        setHistorySearchError("Unable to search history.");
      }
    } finally {
      if (historySearchRequestIdRef.current === requestId) {
        setHistorySearchLoading(false);
      }
    }
  }

  async function handleStartConsultation() {
    if (!validateProfile(profile)) {
      setError("Please enter a valid name, date of birth, age, and sex before starting the consultation.");
      return;
    }

    if (dobError) {
      setError("Please correct the date of birth before starting the consultation.");
      return;
    }

    setLoadingSession(true);
    setError("");

    try {
      const data = await startBackendSession();
      const newSessionId = data.session_id;

      if (!newSessionId) {
        throw new Error("Backend did not return a session ID.");
      }

      setSessionId(newSessionId);
      setSoapSummary(data.summary ?? null);
      setProfileSubmitted(true);
      setSessionActive(true);
      setSessionStatus("active");
      setCurrentPage("consultation");

      if (chatHistory.length === 0) {
        const doctorName = selectedDoctor.name.split(" (")[0];
        const doctorSpecialty = selectedDoctor.name.split(" (")[1]?.replace(")", "") || "";

        const greeting = {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            `Hello ${profile.name}, I am ${doctorName}${doctorSpecialty ? `, a ${doctorSpecialty}` : ""}. ` +
            "Please describe your main symptom, when it started, severity, triggers, and any associated symptoms. " +
            "If you have chest pain, severe breathing difficulty, heavy bleeding, loss of consciousness, or stroke-like symptoms, seek emergency care immediately.",
          timestamp: nowTime(),
          doctorName: doctorName
        };

        setChatHistory([greeting]);
      }
    } catch (err) {
      console.error(err);
      setSessionId("");
      setProfileSubmitted(false);
      setSessionActive(false);
      setSessionStatus("not_started");
      setError("Backend session could not be created. Please try again.");
    } finally {
      setLoadingSession(false);
    }
  }

  function handleClearChat() {
    setChatHistory([]);
    setTriageStatus("neutral");
    setSoapSummary(null);
    setShowSoapPanel(false);
    setProblemUnderstood(false);
    setDiagnosisGiven(false);
    setSafetySignals(null);
    setShowSafetySignals(false);
    setError("");
  }

  async function handleEndSession() {
    if (endingSession || !sessionActive) {
      return;
    }

    setEndingSession(true);
    setSessionActive(false);
    setSessionStatus("ended");

    const parsedSummary = parseStoredSummary(soapSummary);
    const summaryForSave =
      parsedSummary && typeof parsedSummary === "object" && !Array.isArray(parsedSummary)
        ? parsedSummary
        : null;

    try {
      const res = await fetch("http://127.0.0.1:8000/session/end", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          session_id: sessionId,
          name: profile.name,
          age: Number(profile.age),
          sex: profile.sex,
          dob: normalizeDobForBackend(profile.dob),
          soap_summary: summaryForSave
        }),
      });

      const data = await res.json();
      console.log("Session ended:", data);
      setSoapSummary(data.summary ?? null);
    } catch (error) {
      console.error("Error ending session:", error);
      setError("Unable to end session on backend. You can start a new session.");
    } finally {
      setEndingSession(false);
    }
    
    setCurrentPage("setup");
    setChatHistory([]);
    setProfileSubmitted(false);
    setTriageStatus("neutral");
    setShowSoapPanel(false);
    setProblemUnderstood(false);
    setDiagnosisGiven(false);
    setSafetySignals(null);
    setShowSafetySignals(false);
    setError("");
  }

  async function handleStartNewSession() {
    setSessionId("");
    setChatHistory([]);
    setProfile(INITIAL_PROFILE);
    setProfileSubmitted(false);
    setSessionActive(false);
    setSessionStatus("not_started");
    setDobError("");
    setTriageStatus("neutral");
    setSoapSummary(null);
    setShowSoapPanel(false);
    setProblemUnderstood(false);
    setDiagnosisGiven(false);
    setSafetySignals(null);
    setShowSafetySignals(false);
    setShowHistoryModal(false);
    setHistorySearchForm({
      sessionId: "",
      patientName: "",
      dob: ""
    });
    setHistorySearchResult(null);
    setHistorySearchError("");
    setError("");
    setCurrentPage("setup");
  }

  function handleFindHospitals() {
    if (!navigator.geolocation) {
      setHospitalError("Location is not supported by this browser.");
      return;
    }

    setLoadingHospitals(true);
    setHospitalError("");

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const data = await fetchNearbyHospitals(latitude, longitude);
          setNearbyHospitals(data.hospitals || []);

          if (!data.hospitals || data.hospitals.length === 0) {
            setHospitalError("No nearby hospitals found in this area.");
          }
        } catch (err) {
          console.error(err);
          setHospitalError("Unable to load nearby hospitals.");
        } finally {
          setLoadingHospitals(false);
        }
      },
      () => {
        setLoadingHospitals(false);
        setHospitalError("Location permission was denied.");
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 300000
      }
    );
  }

  async function handleSendMessage(userMessage) {
    if (!profileSubmitted || !sessionActive || endingSession) {
      return;
    }

    setError("");

    const userEntry = {
      id: crypto.randomUUID(),
      role: "user",
      content: userMessage,
      timestamp: nowTime()
    };

    const nextChat = [...chatHistory, userEntry];

    setChatHistory(nextChat);

    const detected = detectTriage(userMessage);

    let nextTriage = triageStatus;

    if (triagePriority(detected) >= triagePriority(triageStatus)) {
      nextTriage = detected;
      setTriageStatus(detected);
    }

    setLoadingChat(true);

    const doctorName = selectedDoctor.name.split(" (")[0];

    try {
      const payload = {
        session_id: sessionId || generateLocalSessionId(),
        message: userMessage,
        doctor_id: selectedDoctor.id,
        patient_profile: {
          name: profile.name || "User",
          age: Number(profile.age) || 25,
          sex: profile.sex || "",
          dob: normalizeDobForBackend(profile.dob),
          allergies: profile.allergies || "",
          medications: profile.medications || "",
          conditions: profile.conditions || ""
        }
      };

      const data = await sendChatMessage(payload);
      const responseData = data || {};

      console.log("🔍 API Response:", {
        problem_understood: responseData.problem_understood,
        diagnosis_given: responseData.diagnosis_given,
        safety_signals: responseData.safety_signals,
        triage_status: responseData.triage_status,
        risk_level: responseData.risk_level,
        soap_summary: responseData.soap_summary
      });

      const assistantEntry = {
        id: crypto.randomUUID(),
        role: "assistant",
        content:
          responseData.reply ||
          "I received your message, but no reply was returned by the backend.",
        timestamp: nowTime(),
        doctorName: doctorName
      };

      const finalChat = [...nextChat, assistantEntry];

      setChatHistory(finalChat);
      
      const backendTriageStatus = responseData.triage_status || responseData.risk_level;
      if (backendTriageStatus) {
        setTriageStatus(backendTriageStatus);
      }

      const hasSafetyData = Boolean(
        responseData.safety_signals ||
        responseData.triage_status ||
        responseData.risk_level
      );
      const shouldShowSafetySignals = Boolean(
        responseData.problem_understood || hasSafetyData
      );

      setProblemUnderstood(Boolean(responseData.problem_understood));
      if (typeof setSafetySignals === "function" && responseData.safety_signals) {
        console.log("✅ Setting safety_signals:", responseData.safety_signals);
        setSafetySignals(responseData.safety_signals);
      }
      if (shouldShowSafetySignals) {
        setShowSafetySignals(true);
      }
      
      // Update diagnosis_given state and show SOAP Summary immediately
      if (responseData.diagnosis_given) {
        console.log("✅ Setting diagnosisGiven to true");
        setDiagnosisGiven(true);
      }
      
      // Set SOAP Summary if provided
      const returnedSoapSummary =
        responseData.soap_summary || parseStoredSummary(responseData.summary);
      if (returnedSoapSummary) {
        console.log("✅ Setting SOAP Summary");
        setSoapSummary(returnedSoapSummary);
      }
    } catch (err) {
      console.error(err);
      const isSessionGone = err && err.status === 410;

      if (isSessionGone) {
        setSessionActive(false);
        setCurrentPage("setup");
      }

      const assistantEntry = {
        id: crypto.randomUUID(),
        role: "assistant",
        content:
          isSessionGone
            ? "This session has ended. Please start a new session to continue."
            : "Connection error: Unable to reach the backend. Please make sure FastAPI is running and CORS is enabled.",
        timestamp: nowTime(),
        doctorName: doctorName
      };

      const finalChat = [...nextChat, assistantEntry];

      setChatHistory(finalChat);
      setSoapSummary(null);
      setShowSoapPanel(false);
      setProblemUnderstood(false);
      setDiagnosisGiven(false);
      setSafetySignals(null);
      setShowSafetySignals(false);
      setError(
        isSessionGone
          ? "Session has ended. Start a new session to continue."
          : "Unable to reach backend API. Check FastAPI server and CORS settings."
      );
    } finally {
      setLoadingChat(false);
    }
  }

  return (
    <main className="medical-dashboard-shell relative h-screen overflow-hidden px-4 py-4 text-slate-950 md:px-6">
      <div className="relative z-10 flex h-full min-h-0 flex-col gap-3">
        <Header
          selectedDoctor={selectedDoctor}
          profile={profile}
          sessionId={sessionId}
          sessionStatus={sessionStatus}
          currentPage={currentPage}
          sessionActive={sessionActive}
          onEndSession={handleEndSession}
          onOpenHistorySearch={openHistorySearchModal}
        />

        <HistorySearchModal
          open={showHistoryModal}
          searchForm={historySearchForm}
          setSearchForm={setHistorySearchForm}
          dobError={historyDobError}
          loading={historySearchLoading}
          error={historySearchError}
          results={historySearchResults}
          selectedResult={selectedHistoryResult}
          onSelectResult={setSelectedHistoryResult}
          onClose={closeHistorySearchModal}
          onSearch={handleSearchHistory}
        />

        {loadingSession ? (
          <div className="mb-4 flex items-center gap-2 rounded-2xl border border-blue-100 bg-blue-50/90 px-4 py-3 text-sm font-bold text-blue-700 shadow-sm backdrop-blur-md">
            <Loader2 size={16} className="animate-spin" />
            Creating backend session...
          </div>
        ) : null}

        {currentPage === "setup" ? (
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto xl:grid-cols-[340px_520px_minmax(0,1fr)] xl:items-stretch xl:overflow-hidden">
        <Sidebar
          sessionId={sessionId}
          selectedDoctor={selectedDoctor}
          setSelectedDoctor={setSelectedDoctor}
          profile={profile}
          profileSubmitted={profileSubmitted}
          sessionStatus={sessionStatus}
          nearbyHospitals={nearbyHospitals}
          loadingHospitals={loadingHospitals}
          hospitalError={hospitalError}
          onStartNewSession={handleStartNewSession}
          onFindHospitals={handleFindHospitals}
        />

            <DoctorAndProfilePanel
              profile={profile}
              setProfile={setProfile}
              profileSubmitted={profileSubmitted}
              dobError={dobError}
              setDobError={setDobError}
              onStartConsultation={handleStartConsultation}
            />

            <section className="relative isolate flex h-full min-h-[540px] overflow-hidden rounded-[32px] bg-gradient-to-br from-cyan-50 via-sky-50 to-blue-100 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.86)] xl:min-h-0">
              <div className="absolute -right-24 top-8 h-72 w-72 rounded-full bg-cyan-200/25 blur-3xl" />
              <div className="absolute bottom-0 left-0 h-56 w-56 rounded-full bg-teal-100/35 blur-3xl" />
              <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/50 to-transparent" />
              <div className="absolute right-[-18%] top-[16%] z-[5] h-[72%] w-[72%] rounded-full bg-gradient-to-br from-sky-100/50 via-cyan-50/30 to-blue-100/50 blur-xl" />

              <div className="relative z-20 max-w-[360px] pt-3">
                <span className="mb-4 block text-xs font-black uppercase tracking-[0.28em] text-cyan-700/55">
                  Care Intelligence
                </span>

                <h2 className="text-3xl font-black leading-tight text-slate-800/85 2xl:text-4xl">
                  Welcome to
                  <br />
                  AI Medical Assistant
                </h2>

                <p className="mt-3 text-base font-semibold leading-7 text-blue-700/60 2xl:text-lg">
                  Your intelligent healthcare companion
                </p>

                <div className="mt-6 space-y-3 text-sm font-semibold leading-5 text-slate-600/75">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/65 text-teal-700/70 shadow-sm">
                      <Stethoscope size={16} />
                    </span>
                    <span>AI-powered symptom analysis</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/65 text-blue-700/70 shadow-sm">
                      <HeartPulse size={16} />
                    </span>
                    <span>Smart triage and risk assessment</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/65 text-cyan-700/70 shadow-sm">
                      <ClipboardList size={16} />
                    </span>
                    <span>SOAP documentation</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/65 text-teal-700/70 shadow-sm">
                      <Hospital size={16} />
                    </span>
                    <span>Nearby hospitals and guidance</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/65 text-blue-700/70 shadow-sm">
                      <ShieldCheck size={16} />
                    </span>
                    <span>Secure and confidential</span>
                  </div>
                </div>

              </div>

              <div className="pointer-events-none absolute right-[-24px] top-[72px] z-10 h-[520px] w-[560px] overflow-hidden [mask-image:linear-gradient(to_right,transparent_0%,black_14%,black_86%,transparent_100%)] xl:right-[-40px] xl:top-[82px] 2xl:right-[-12px] 2xl:top-[64px]">
                <img
                  src={doctorHero}
                  alt="Doctor hero"
                  className="h-full w-full object-contain object-right-top opacity-100 mix-blend-multiply contrast-[1.05] saturate-[1.04] drop-shadow-[0_34px_58px_rgba(14,116,144,0.16)]"
                />
              </div>

              <div className="pointer-events-none absolute inset-0 z-[15] bg-gradient-to-r from-cyan-50 via-cyan-50/75 to-transparent" />
              <div className="pointer-events-none absolute bottom-0 right-0 z-[16] h-[34%] w-[50%] bg-gradient-to-tr from-transparent via-sky-50/15 to-blue-100/35" />
            </section>
      </div>
    ) : (
          <div
            className={`consultation-grid grid min-h-0 flex-1 grid-cols-1 gap-5 overflow-y-auto xl:items-stretch xl:overflow-hidden ${
              showInsightPanels
                ? "lg:grid-cols-2 xl:grid-cols-[300px_minmax(450px,0.9fr)_300px]"
                : "xl:grid-cols-[minmax(520px,960px)] xl:justify-center"
            }`}
          >
            <div className={`min-h-0 ${showInsightPanels ? "lg:col-span-2 xl:order-2 xl:col-span-1" : ""}`}>
              <ChatPanel
                chatHistory={chatHistory}
                profileSubmitted={profileSubmitted}
                sessionActive={sessionActive}
                triageStatus={triageStatus}
                loading={loadingChat}
                error={error}
                onSendMessage={handleSendMessage}
                profile={profile}
                selectedDoctorName={selectedDoctor.name.split(" (")[0]}
              />
            </div>

            {showInsightPanels ? (
              showSoapSummary ? (
                <div className="min-h-0 lg:order-2 xl:order-1">
                  <SoapSummaryPanel soapSummary={soapSummary} />
                </div>
              ) : (
                <div className="hidden xl:order-1 xl:block" />
              )
            ) : null}

            {showSafetySignals ? (
              <div className="min-h-0 lg:order-3 xl:order-3">
                <SafetySignalsPanel
                  triageStatus={triageStatus}
                  safetySignals={safetySignals}
                  diagnosisGiven={diagnosisGiven}
                  messageCount={messageCount}
                  profileSubmitted={profileSubmitted}
                  sessionActive={sessionActive}
                />
              </div>
            ) : null}
          </div>
        )}
      </div>
    </main>
  );
}
