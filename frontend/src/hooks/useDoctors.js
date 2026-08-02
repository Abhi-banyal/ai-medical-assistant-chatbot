import { useEffect, useState } from "react";

import { fetchDoctors } from "../lib/api";

function normalizeDoctor(doctor) {
  const id = Number(doctor?.id);
  const name = typeof doctor?.name === "string" ? doctor.name.trim() : "";
  const specialty = typeof doctor?.specialty === "string" ? doctor.specialty.trim() : "";
  const experience = typeof doctor?.experience === "string" ? doctor.experience.trim() : "";

  if (!Number.isInteger(id) || id <= 0 || !name || !specialty) return null;
  return { id, name, specialty, experience, displayName: `${name} (${specialty})` };
}

export function useDoctors() {
  const [doctors, setDoctors] = useState([]);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [error, setError] = useState("");
  const [loadKey, setLoadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadDoctors() {
      try {
        const data = await fetchDoctors({ signal: controller.signal });
        const validDoctors = Array.isArray(data?.doctors)
          ? data.doctors.map(normalizeDoctor).filter(Boolean)
          : [];
        if (validDoctors.length === 0) throw new Error("No valid doctors were returned.");

        setDoctors(validDoctors);
        setSelectedDoctor((current) =>
          validDoctors.find((doctor) => doctor.id === current?.id) || validDoctors[0]
        );
        setError("");
      } catch (loadError) {
        if (loadError?.type !== "cancelled") {
          setDoctors([]);
          setSelectedDoctor(null);
          setError("Doctor information is unavailable. Please try again.");
        }
      }
    }

    loadDoctors();
    return () => controller.abort();
  }, [loadKey]);

  return {
    doctors,
    selectedDoctor,
    setSelectedDoctor,
    error,
    retry: () => setLoadKey((value) => value + 1)
  };
}
