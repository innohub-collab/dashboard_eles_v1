import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { isInnovationLab, isProgram } from "@/lib/kpi";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL ||
  (window.location.port === "3000" ? "http://localhost:8000" : window.location.origin);
const API = `${BACKEND_URL}/api`;

const DataCtx = createContext(null);

const initialFilters = {
  feladattipus: "Innováció", // osszes | Innováció | Feladat
  allapot: "all",
  kategoria: "all",
  igazgatosag: "all",
  bejelento: "all",
  program: "all", // all | any | specific program name
  search: "",
  period: "all", // all | 3m | 6m | 12m
};

export function DataProvider({ children }) {
  const [records, setRecords] = useState([]);
  const [loadedAt, setLoadedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState(initialFilters);
  const [selectedId, setSelectedId] = useState(null);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await axios.get(`${API}/records`);
      setRecords(data.records || []);
      setLoadedAt(data.loaded_at);
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || "Hiba történt");
    } finally {
      setLoading(false);
    }
  }, []);

  const reload = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const { data } = await axios.post(`${API}/reload`);
      setLoadedAt(data.loaded_at);
      const rec = await axios.get(`${API}/records`);
      setRecords(rec.data.records || []);
      return { ok: true, count: data.count };
    } catch (e) {
      const msg = e?.response?.data?.detail || e.message || "Frissítés sikertelen";
      setError(msg);
      return { ok: false, error: msg };
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const setFilter = useCallback((key, value) => {
    setFilters((f) => ({ ...f, [key]: value }));
  }, []);

  const resetFilters = useCallback(() => setFilters(initialFilters), []);

  const filtered = useMemo(() => {
    const now = new Date();
    return records.filter((r) => {
      if (filters.feladattipus !== "osszes" && r.feladattipus !== filters.feladattipus) return false;
      if (filters.allapot !== "all" && r.allapot !== filters.allapot) return false;
      if (filters.kategoria !== "all" && r.customer_request_type !== filters.kategoria) return false;
      if (filters.igazgatosag !== "all" && r.igazgatosag !== filters.igazgatosag) return false;
      if (filters.bejelento !== "all" && r.bejelento !== filters.bejelento) return false;
      if (filters.program === "any" && !isProgram(r)) return false;
      if (filters.program === "InnovationLab" && !isInnovationLab(r)) return false;
      if (!["all", "any", "InnovationLab"].includes(filters.program)) {
        const tags = (r.cimkek || []).map((t) => t.toLowerCase());
        if (!tags.includes(filters.program.toLowerCase())) return false;
      }
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const hay = `${r.cim} ${r.leiras} ${r.bejelento} ${r.id}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filters.period !== "all" && r.letrehozva) {
        const months = filters.period === "3m" ? 3 : filters.period === "6m" ? 6 : 12;
        const cutoff = new Date();
        cutoff.setMonth(cutoff.getMonth() - months);
        if (new Date(r.letrehozva) < cutoff) return false;
      }
      return true;
    });
  }, [records, filters]);

  const selected = useMemo(
    () => records.find((r) => r.id === selectedId) || null,
    [records, selectedId]
  );

  // dropdown option lists
  const options = useMemo(() => {
    const uniq = (key) => [...new Set(records.map((r) => r[key]).filter(Boolean))].sort();
    return {
      allapot: uniq("allapot"),
      kategoria: uniq("customer_request_type"),
      igazgatosag: uniq("igazgatosag"),
      bejelento: uniq("bejelento").filter((b) => !["Unassigned"].includes(b)),
    };
  }, [records]);

  const activeFilterChips = useMemo(() => {
    const chips = [];
    if (filters.feladattipus !== "osszes")
      chips.push({ key: "feladattipus", label: `Típus: ${filters.feladattipus}` });
    if (filters.allapot !== "all") chips.push({ key: "allapot", label: `Állapot: ${filters.allapot}` });
    if (filters.kategoria !== "all") chips.push({ key: "kategoria", label: `Kategória: ${filters.kategoria}` });
    if (filters.igazgatosag !== "all") chips.push({ key: "igazgatosag", label: `Igazgatóság: ${filters.igazgatosag}` });
    if (filters.bejelento !== "all") chips.push({ key: "bejelento", label: `Bejelentő: ${filters.bejelento}` });
    if (filters.program !== "all") chips.push({ key: "program", label: `Program: ${filters.program === "any" ? "Bármelyik" : filters.program}` });
    if (filters.period !== "all") chips.push({ key: "period", label: `Időszak: utolsó ${filters.period.replace("m", " hónap")}` });
    if (filters.search) chips.push({ key: "search", label: `Keresés: "${filters.search}"` });
    return chips;
  }, [filters]);

  const value = {
    records,
    filtered,
    loadedAt,
    loading,
    refreshing,
    error,
    filters,
    setFilter,
    resetFilters,
    reload,
    selectedId,
    setSelectedId,
    selected,
    options,
    activeFilterChips,
  };

  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

export function useData() {
  const ctx = useContext(DataCtx);
  if (!ctx) throw new Error("useData must be used inside DataProvider");
  return ctx;
}
