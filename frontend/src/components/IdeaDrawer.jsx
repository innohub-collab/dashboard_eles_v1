import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useData } from "@/context/DataContext";
import { StatusBadge, OutcomeBadge, PriorityBadge } from "./StatusBadge";
import { fmtDate } from "@/lib/format";
import { Calendar, Building2, User, Tag, Sparkles, MessageSquare, Target, FileText } from "lucide-react";
import { PROGRAM_TAGS } from "@/lib/kpi";

export default function IdeaDrawer() {
  const { selected, setSelectedId } = useData();
  const open = !!selected;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && setSelectedId(null)}>
      <SheetContent
        data-testid="idea-drawer"
        className="w-full sm:max-w-2xl overflow-y-auto p-0 bg-white"
      >
        {selected && (
          <>
            <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-lime-900/10 px-8 pt-8 pb-5">
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <StatusBadge status={selected.allapot} />
                <OutcomeBadge outcome={selected.outcome} />
                <PriorityBadge priority={selected.prioritas} />
                <span className="text-[11px] font-mono text-forest-700/70 ml-auto">{selected.id}</span>
              </div>
              <SheetHeader className="text-left">
                <SheetTitle className="font-display text-2xl leading-snug text-forest-950">
                  {selected.cim || "Névtelen ötlet"}
                </SheetTitle>
              </SheetHeader>
              <div className="flex flex-wrap gap-4 mt-3 text-xs text-forest-700/80">
                <InfoLine icon={User} label={selected.bejelento} />
                <InfoLine icon={Calendar} label={fmtDate(selected.letrehozva)} />
                <InfoLine icon={Building2} label={selected.igazgatosag} />
                <InfoLine icon={Tag} label={selected.customer_request_type} />
              </div>
            </div>

            <div className="px-8 py-6 space-y-7">
              <Section icon={FileText} title="Rövid összefoglaló">
                <p className="text-sm text-forest-900 leading-relaxed">
                  {selected.cim}
                </p>
              </Section>

              <Section icon={FileText} title="Teljes leírás">
                <p className="text-sm text-forest-900 leading-relaxed whitespace-pre-wrap">
                  {selected.leiras || "Nincs megadva leírás."}
                </p>
              </Section>

              <Section icon={Target} title="Elvárt eredmény">
                <p className="text-sm text-forest-900 leading-relaxed whitespace-pre-wrap">
                  {selected.elvart_eredmeny || "—"}
                </p>
              </Section>

              <Section icon={MessageSquare} title="Kommentek / Közreműködők">
                <p className="text-sm text-forest-900 leading-relaxed whitespace-pre-wrap">
                  {selected.kozremukodok || "Nincs komment."}
                </p>
              </Section>

              <div className="grid grid-cols-2 gap-4">
                <MetaCard label="Szervezeti egység" value={selected.szervezeti_egyseg} />
                <MetaCard label="Érintett terület" value={selected.erintett_terulet || "—"} />
                <MetaCard label="Frissítve" value={fmtDate(selected.frissitve)} />
                <MetaCard label="Egyediség" value={selected.egyedi || "—"} />
                <MetaCard label="Feladattípus" value={selected.feladattipus} />
                <MetaCard label="Megoldás" value={selected.megoldas || "—"} />
              </div>

              {selected.cimkek?.length > 0 && (
                <Section icon={Sparkles} title="Címkék">
                  <div className="flex flex-wrap gap-2">
                    {selected.cimkek.map((t) => {
                      const isProgram = PROGRAM_TAGS.some((p) => p.toLowerCase() === t.toLowerCase());
                      return (
                        <span
                          key={t}
                          className={`px-2.5 py-1 text-xs rounded-full border ${
                            isProgram
                              ? "bg-forest-950 text-lime-100 border-forest-900"
                              : "bg-lime-50 text-forest-900 border-lime-200"
                          }`}
                        >
                          {t}
                        </span>
                      );
                    })}
                  </div>
                </Section>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function InfoLine({ icon: Icon, label }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
      {label || "—"}
    </span>
  );
}

function Section({ icon: Icon, title, children }) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-forest-700" strokeWidth={1.75} />
        <h4 className="text-[11px] uppercase tracking-[0.16em] font-semibold text-forest-700/80">
          {title}
        </h4>
      </div>
      {children}
    </section>
  );
}

function MetaCard({ label, value }) {
  return (
    <div className="rounded-xl bg-forest-50 border border-lime-900/10 p-3">
      <div className="text-[10px] uppercase tracking-[0.16em] font-semibold text-forest-700/70">{label}</div>
      <div className="text-sm text-forest-950 mt-0.5 font-medium truncate">{value || "—"}</div>
    </div>
  );
}
