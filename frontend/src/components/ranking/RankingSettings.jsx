import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, LockKeyhole, RotateCcw, Save, SlidersHorizontal, Undo2 } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { criteriaContentChanged, RANKING_SETTINGS_DEFAULT_OPEN, validateCriteria } from "@/lib/ranking";

export default function RankingSettings({ settings, permissions, saving, resetting, onSave, onResetDefaults }) {
  const [criteria, setCriteria] = useState([]);
  const [dirty, setDirty] = useState(false);
  const canEditWeights = permissions?.editWeights === true;
  const canEditCriteria = permissions?.editCriteria === true;
  const canEdit = canEditWeights || canEditCriteria;

  useEffect(() => {
    setCriteria((settings?.criteria || []).map((criterion) => ({ ...criterion })));
    setDirty(false);
  }, [settings?.configVersion, settings?.criteria]);

  const validation = useMemo(() => validateCriteria(criteria), [criteria]);
  const methodologyChanged = useMemo(
    () => criteriaContentChanged(settings?.criteria || [], criteria),
    [criteria, settings?.criteria],
  );

  const updateCriterion = (index, key, value) => {
    setCriteria((current) => current.map((criterion, criterionIndex) =>
      criterionIndex === index ? { ...criterion, [key]: value } : criterion,
    ));
    setDirty(true);
  };

  const cancel = () => {
    setCriteria((settings?.criteria || []).map((criterion) => ({ ...criterion })));
    setDirty(false);
  };

  const save = async () => {
    if (!dirty || !validation.valid || saving) return;
    try {
      await onSave({
        configVersion: settings.configVersion,
        criteria: criteria.map((criterion) => ({ ...criterion, weight: Number(criterion.weight) })),
      });
      setDirty(false);
    } catch (_) {
      // Sikertelen mentésnél a helyi szerkesztés változatlanul megmarad.
    }
  };

  if (!settings) return <SettingsSkeleton />;

  return (
    <section data-testid="ranking-settings">
      <Accordion type="single" collapsible defaultValue={RANKING_SETTINGS_DEFAULT_OPEN ? "settings" : undefined}>
        <AccordionItem value="settings" className="overflow-hidden rounded-3xl border border-lime-900/10 bg-white shadow-soft-lg">
          <AccordionTrigger className="px-5 py-5 md:px-6 hover:no-underline">
            <div className="flex min-w-0 items-center gap-3 text-left">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-lime-200 bg-lime-50">
                <SlidersHorizontal className="h-5 w-5 text-forest-800" strokeWidth={1.7} />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-lg font-semibold text-forest-950">Értékelési beállítások</h2>
                  {dirty && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-semibold text-amber-800">Nem mentett változások</span>}
                  {!canEdit && <LockKeyhole className="h-3.5 w-3.5 text-forest-700/60" aria-label="Csak olvasható" />}
                </div>
                <p className="mt-0.5 text-xs text-forest-700/65">
                  {settings.criteriaVersion} · {criteria.length} kritérium · összesen {formatNumber(validation.totalWeight)}%
                </p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-5 pb-6 md:px-6">
            <div className="mb-5 grid gap-2 rounded-2xl bg-forest-50 p-4 text-xs text-forest-700 md:grid-cols-3">
              <Meta label="Kritériumverzió" value={settings.criteriaVersion} />
              <Meta label="Utolsó módosítás" value={formatDateTime(settings.updatedAt)} />
              <Meta label="Módosító" value={settings.updatedBy || "—"} />
            </div>

            <div className="space-y-4">
              {criteria.map((criterion, index) => (
                <div key={criterion.id || index} className="rounded-2xl border border-lime-900/10 bg-white p-4 md:p-5">
                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_150px_110px]">
                    <div className="space-y-3">
                      <Field label="Kritérium neve">
                        <Input
                          value={criterion.name || ""}
                          onChange={(event) => updateCriterion(index, "name", event.target.value)}
                          disabled={!canEditCriteria || saving}
                          className="h-10 rounded-xl border-lime-900/15"
                        />
                      </Field>
                      <Field label="Rövid leírás">
                        <Textarea
                          value={criterion.description || ""}
                          onChange={(event) => updateCriterion(index, "description", event.target.value)}
                          disabled={!canEditCriteria || saving}
                          rows={2}
                          className="resize-y rounded-xl border-lime-900/15"
                        />
                      </Field>
                    </div>
                    <Field label="Súly (%)">
                      <Input
                        type="number"
                        min="0"
                        step="0.5"
                        value={criterion.weight ?? ""}
                        onChange={(event) => updateCriterion(index, "weight", event.target.value)}
                        disabled={!canEditWeights || saving || criterion.active === false}
                        className="h-10 rounded-xl border-lime-900/15 font-display text-lg font-semibold"
                        aria-label={`${criterion.name || index + 1}. kritérium súlya`}
                      />
                    </Field>
                    <Field label="Aktív">
                      <div className="flex h-10 items-center gap-2">
                        <Switch
                          checked={criterion.active !== false}
                          onCheckedChange={(checked) => updateCriterion(index, "active", checked)}
                          disabled={!canEditCriteria || saving}
                          aria-label={`${criterion.name || index + 1}. kritérium aktív állapota`}
                        />
                        <span className="text-xs text-forest-700">{criterion.active === false ? "Inaktív" : "Aktív"}</span>
                      </div>
                    </Field>
                  </div>
                  <div className="mt-4">
                    <Field label="Scoring guide">
                      <Textarea
                        value={criterion.scoringGuide || ""}
                        onChange={(event) => updateCriterion(index, "scoringGuide", event.target.value)}
                        disabled={!canEditCriteria || saving}
                        rows={3}
                        className="resize-y rounded-xl border-lime-900/15 font-mono text-xs leading-relaxed"
                      />
                    </Field>
                  </div>
                </div>
              ))}
            </div>

            {methodologyChanged && (
              <div className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <p>A kritérium tartalma vagy aktív állapota megváltozott. Ez új módszertani verziót igényelhet; a mentés nem indít automatikus teljes AI-újraértékelést.</p>
              </div>
            )}

            {!validation.valid && dirty && (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800" role="alert">
                <p className="font-semibold">A beállítás még nem menthető:</p>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {validation.errors.map((error) => <li key={error}>{error}</li>)}
                </ul>
              </div>
            )}

            <div className="mt-5 flex flex-col-reverse gap-3 border-t border-lime-900/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-forest-700/65" aria-live="polite">
                {canEdit ? (dirty ? "A módosítások még csak helyben láthatók." : "Minden változás mentve.") : "A beállítások megtekintésére van jogosultságod."}
              </div>
              {canEdit && (
                <div className="flex flex-wrap justify-end gap-2">
                  {canEditCriteria && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button type="button" variant="outline" disabled={saving} className="rounded-full border-amber-200 text-amber-900 hover:bg-amber-50">
                          <RotateCcw className="h-4 w-4" /> Alapértékek visszaállítása
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="rounded-3xl border-lime-900/10 bg-white">
                        <AlertDialogHeader>
                          <AlertDialogTitle>Visszaállítod az alapértelmezett kritériumokat?</AlertDialogTitle>
                          <AlertDialogDescription>
                            A szerveren tárolt alapértelmezett kritériumok és súlyok lépnek életbe. A mentetlen helyi változások elvesznek, de a művelet nem indít automatikus teljes AI-újraértékelést.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="rounded-full" disabled={saving}>Mégse</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={onResetDefaults}
                            disabled={saving}
                            className="rounded-full bg-amber-700 text-white hover:bg-amber-800"
                          >
                            {resetting ? "Visszaállítás…" : "Alapértékek visszaállítása"}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                  <Button type="button" variant="outline" onClick={cancel} disabled={!dirty || saving} className="rounded-full border-lime-900/15">
                    <Undo2 className="h-4 w-4" /> Mégse
                  </Button>
                  <Button type="button" onClick={save} disabled={!dirty || !validation.valid || saving} className="rounded-full bg-forest-950 text-lime-50 hover:bg-forest-900">
                    {saving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-lime-100 border-t-transparent" /> : <Save className="h-4 w-4" />}
                    {saving ? "Mentés…" : "Változások mentése"}
                  </Button>
                </div>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </section>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-forest-700/70">{label}</span>
      {children}
    </label>
  );
}

function Meta({ label, value }) {
  return <div><span className="font-semibold text-forest-900">{label}:</span> {value || "—"}</div>;
}

function SettingsSkeleton() {
  return <div className="h-24 animate-pulse rounded-3xl border border-lime-900/10 bg-white/70" aria-label="Beállítások betöltése" />;
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("hu-HU", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatNumber(value) {
  return new Intl.NumberFormat("hu-HU", { maximumFractionDigits: 2 }).format(value || 0);
}
