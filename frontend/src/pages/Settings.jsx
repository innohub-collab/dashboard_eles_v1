import { useEffect, useRef, useState } from "react";
import { useData } from "@/context/DataContext";
import { fmtDateTime } from "@/lib/format";
import { FileSpreadsheet, RefreshCw, Database, Info, FolderSearch, Upload, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL ||
  (window.location.port === "3000" ? "http://localhost:8000" : window.location.origin);
const API = `${BACKEND_URL}/api`;

export default function Settings() {
  const { loadedAt, records, reload, refreshing } = useData();
  const [config, setConfig] = useState(null);
  const [pathInput, setPathInput] = useState("");
  const [savingPath, setSavingPath] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const fetchConfig = async () => {
    try {
      const { data } = await axios.get(`${API}/config`);
      setConfig(data);
      setPathInput(data.file_path || "");
    } catch (e) {
      /* ignore */
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleReload = async () => {
    const t = toast.loading("Adatok újratöltése…");
    const res = await reload();
    toast.dismiss(t);
    if (res.ok) toast.success(`Sikeres újratöltés (${res.count} rekord)`);
    else toast.error(res.error || "Hiba történt");
    fetchConfig();
  };

  const handleSavePath = async () => {
    if (!pathInput.trim()) {
      toast.error("Adj meg egy útvonalat.");
      return;
    }
    setSavingPath(true);
    const t = toast.loading("Új útvonal ellenőrzése és betöltése…");
    try {
      const { data } = await axios.post(`${API}/config/path`, { path: pathInput.trim() });
      toast.dismiss(t);
      toast.success(`Útvonal beállítva — ${data.count} rekord betöltve`, {
        icon: <CheckCircle2 className="w-4 h-4" />,
      });
      await reload();
      fetchConfig();
    } catch (e) {
      toast.dismiss(t);
      toast.error(e?.response?.data?.detail || "Hiba történt");
    } finally {
      setSavingPath(false);
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const t = toast.loading(`Feltöltés: ${file.name} …`);
    try {
      const form = new FormData();
      form.append("file", file);
      const { data } = await axios.post(`${API}/upload`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.dismiss(t);
      toast.success(`Fájl feltöltve — ${data.count} rekord`, {
        icon: <CheckCircle2 className="w-4 h-4" />,
      });
      await reload();
      fetchConfig();
    } catch (err) {
      toast.dismiss(t);
      toast.error(err?.response?.data?.detail || "Feltöltés sikertelen");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="pt-6 space-y-6 max-w-4xl" data-testid="settings-page">
      <div>
        <h2 className="font-display text-2xl font-semibold text-forest-950">Beállítások és adatfrissítés</h2>
        <p className="text-sm text-forest-700/70 mt-1">Excel forrás és rendszerinformációk</p>
      </div>

      {/* File source panel */}
      <div className="rounded-3xl bg-white border border-lime-900/10 shadow-soft-lg p-6 space-y-6">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl bg-lime-50 border border-lime-200 flex items-center justify-center">
            <FileSpreadsheet className="w-5 h-5 text-forest-800" strokeWidth={1.75} />
          </div>
          <div className="flex-1">
            <h3 className="font-display text-lg font-semibold text-forest-950">Excel forrás</h3>
            <p className="text-sm text-forest-700/80 mt-1">
              A dashboard szerver oldalról olvassa be az adatokat. Beállíthatsz egy hálózati vagy lokális
              útvonalat (a szerverről elérhető formában), vagy közvetlenül feltölthetsz egy új Excel fájlt.
            </p>
          </div>
        </div>

        {/* Path input */}
        <div className="grid gap-3">
          <label className="text-[11px] uppercase tracking-[0.16em] font-semibold text-forest-800/70">
            Fájl útvonal (szerver oldali)
          </label>
          <div className="flex flex-col md:flex-row gap-2">
            <div className="relative flex-1">
              <FolderSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-forest-700/60" strokeWidth={1.75} />
              <Input
                data-testid="settings-path-input"
                value={pathInput}
                onChange={(e) => setPathInput(e.target.value)}
                placeholder="/app/backend/data/otletek_riport.xlsx  vagy  //server/share/otletek_riport.xlsx"
                className="pl-9 h-11 rounded-xl bg-white border-lime-900/15 font-mono text-xs"
              />
            </div>
            <Button
              data-testid="settings-save-path"
              onClick={handleSavePath}
              disabled={savingPath}
              className="h-11 rounded-xl bg-forest-950 hover:bg-forest-900 text-lime-50 px-6"
            >
              Beállítás és betöltés
            </Button>
          </div>
          <div className="text-xs text-forest-700/70 leading-relaxed bg-lime-50 border border-lime-200 rounded-lg px-3 py-2">
            <strong className="text-forest-900">Windows fájl megosztása:</strong> a Windows-formátumú útvonal
            (pl. <code className="font-mono">H:\H2-es célfeladat\ötletláda\...\ötletek_riport.xlsx</code>)
            csak akkor működik közvetlenül, ha a szerver ugyanezen a hálózaton van és fel van csatolva a meghajtó.
            Ha nem, használd a lenti feltöltést, vagy szinkronizáld a fájlt egy Linux útvonalra
            (pl. <code className="font-mono">/mnt/otletlada/otletek_riport.xlsx</code>).
          </div>
        </div>

        {/* File upload */}
        <div className="grid gap-3 border-t border-lime-900/10 pt-5">
          <label className="text-[11px] uppercase tracking-[0.16em] font-semibold text-forest-800/70">
            Vagy közvetlen feltöltés
          </label>
          <div className="flex items-center gap-3 flex-wrap">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xlsm"
              onChange={handleUpload}
              className="hidden"
              data-testid="settings-file-input"
            />
            <Button
              data-testid="settings-upload-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              variant="outline"
              className="h-11 rounded-xl border-forest-800/25 text-forest-950 hover:bg-lime-50"
            >
              <Upload className={`w-4 h-4 mr-2 ${uploading ? "animate-pulse" : ""}`} strokeWidth={1.75} />
              {uploading ? "Feltöltés…" : "Excel fájl kiválasztása"}
            </Button>
            <span className="text-xs text-forest-700/70">
              .xlsx / .xlsm elfogadva · a feltöltött fájl azonnal aktivvá válik
            </span>
          </div>
        </div>

        {/* Meta info */}
        <div className="border-t border-lime-900/10 pt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
          <MetaRow icon={Database} label="Betöltött rekord" value={records.length} />
          <MetaRow icon={RefreshCw} label="Utolsó frissítés" value={loadedAt ? fmtDateTime(loadedAt) : "—"} />
          <MetaRow
            icon={Info}
            label="Aktív fájl mérete"
            value={
              config?.size_bytes
                ? `${(config.size_bytes / 1024).toFixed(1)} kB`
                : "—"
            }
          />
        </div>

        <div className="border-t border-lime-900/10 pt-5 flex flex-wrap items-center gap-3">
          <Button
            data-testid="settings-reload"
            onClick={handleReload}
            disabled={refreshing}
            className="rounded-full bg-forest-950 hover:bg-forest-900 text-lime-50"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} strokeWidth={1.75} />
            {refreshing ? "Frissítés folyamatban…" : "Adatok újratöltése"}
          </Button>
          <span className="text-xs text-forest-700/70">
            Az aktív fájl újraolvasása (útvonal nem változik).
          </span>
        </div>
      </div>

      {/* Expected schema */}
      <div className="rounded-3xl bg-white border border-lime-900/10 shadow-soft-lg p-6">
        <h3 className="font-display text-lg font-semibold text-forest-950">Elvárt Excel oszlopok</h3>
        <p className="text-sm text-forest-700/70 mt-1">
          A rendszer az alábbi oszlopokra épít (a hiányzókat elegánsan kezeli):
        </p>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
          {[
            "Feladattípus", "Customer Request Type", "Kulcs", "Összefoglalás", "Leírás", "Elvárt eredmény",
            "Bejelentő", "Hozzárendelt személy", "Állapot", "Megoldás", "Létrehozva", "Frissítve",
            "Címkék", "Igazgatóság", "Igénylő szervezeti egység", "Prioritás", "Komplexitás", "Közreműködők",
          ].map((c) => (
            <div key={c} className="px-3 py-2 rounded-lg bg-forest-50 border border-lime-200/60 text-forest-900 font-mono">
              {c}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MetaRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-lime-50 border border-lime-200 flex items-center justify-center">
        <Icon className="w-4 h-4 text-forest-800" strokeWidth={1.75} />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-[0.16em] text-forest-700/70 font-semibold">{label}</div>
        <div className="font-display text-sm text-forest-950 font-semibold truncate">{value}</div>
      </div>
    </div>
  );
}
