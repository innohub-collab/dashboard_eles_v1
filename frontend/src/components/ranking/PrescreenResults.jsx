import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Eye,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import OriginalIdeaPanel from "@/components/ranking/OriginalIdeaPanel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { isReevaluationCommentValid, PRESCREEN_STATUS } from "@/lib/ranking";

const SECTION_DEFINITIONS = [
  { id: "prescreen-close", title: "Lezárásra javasolt ötletek", description: "Emberi döntésre váró, magas bizonyosságú AI-javaslatok.", tone: "amber", matches: (item) => item.workflowState === "CLOSE_RECOMMENDED" },
  { id: "prescreen-clarification", title: "Pontosítandó ötletek", description: "Emberi döntésre váró ötletek, az értékeléshez szükséges kontextusspecifikus kérdésekkel.", tone: "blue", matches: (item) => item.workflowState === "NEEDS_CLARIFICATION" },
  { id: "prescreen-human-review", title: "Emberi felülvizsgálatra váró ötletek", description: "Csak a pontozásig el nem jutott, visszatartott vagy külön szakértői döntést igénylő tételek.", tone: "violet", matches: (item) => item.evaluationCurrent !== true && (item.workflowState === "HELD" || (item.requiresHumanReview === true && !item.humanDecision && !["CLOSE_RECOMMENDED", "NEEDS_CLARIFICATION"].includes(item.workflowState))) },
  { id: "prescreen-closure-accepted", title: "Lezárandó ötletek", description: "Az emberi felülvizsgáló által elfogadott lezárási javaslatok.", tone: "amber", matches: (item) => item.workflowState === "CLOSURE_ACCEPTED" },
  { id: "prescreen-clarification-accepted", title: "Pontosításra visszaküldendő ötletek", description: "Az emberi felülvizsgáló által elfogadott pontosítási igények.", tone: "blue", matches: (item) => item.workflowState === "CLARIFICATION_ACCEPTED" },
  { id: "prescreen-failed", title: "Sikertelen feldolgozások", description: "Legalább öt sikertelen AI-elérési kísérlet vagy belső technikai hiba miatt be nem fejezett feldolgozások.", tone: "red", matches: (item) => item.workflowState === "TECHNICAL_FAILURE" },
];

export default function PrescreenResults({
  items,
  canOverride,
  overriding,
  onOverride,
  canReevaluate,
  reevaluating,
  onReevaluate,
}) {
  const [action, setAction] = useState(null);
  const [comment, setComment] = useState("");
  const [reevaluateTarget, setReevaluateTarget] = useState(null);
  const [reevaluateComment, setReevaluateComment] = useState("");
  const [selected, setSelected] = useState(null);
  const groups = useMemo(
    () => SECTION_DEFINITIONS.map((section) => ({ ...section, items: (items || []).filter(section.matches) })),
    [items],
  );

  const startAction = (item, decision) => {
    setAction({ item, decision });
    setComment("");
  };
  const closeAction = () => {
    if (!overriding) {
      setAction(null);
      setComment("");
    }
  };
  const submitAction = async () => {
    if (!action || comment.trim().length < 5 || overriding) return;
    try {
      await onOverride({ ideaId: action.item.ideaId, decision: action.decision, comment: comment.trim() });
      setAction(null);
      setComment("");
    } catch (_) {
      // A kötelező megjegyzést sikertelen mentéskor megőrizzük.
    }
  };
  const startReevaluation = (item) => {
    setReevaluateTarget(item);
    setReevaluateComment("");
  };
  const closeReevaluation = () => {
    if (!reevaluating) {
      setReevaluateTarget(null);
      setReevaluateComment("");
    }
  };
  const submitReevaluation = async () => {
    if (!reevaluateTarget || !isReevaluationCommentValid(reevaluateComment) || reevaluating) return;
    try {
      await onReevaluate({ ideaId: reevaluateTarget.ideaId, comment: reevaluateComment.trim() });
      setReevaluateTarget(null);
      setReevaluateComment("");
    } catch (_) {
      // A szakmai megjegyzést sikertelen kérésnél megőrizzük.
    }
  };

  return (
    <div className="space-y-6" data-testid="prescreen-results">
      {groups.map((section) => (
        <PrescreenSection
          key={section.id}
          section={section}
          canOverride={canOverride}
          canReevaluate={canReevaluate}
          busy={overriding || reevaluating}
          onOverride={startAction}
          onReevaluate={startReevaluation}
          onOpen={setSelected}
        />
      ))}

      <OverrideDialog action={action} comment={comment} setComment={setComment} busy={overriding} onClose={closeAction} onSubmit={submitAction} />
      <ReevaluationDialog target={reevaluateTarget} comment={reevaluateComment} setComment={setReevaluateComment} busy={reevaluating} onClose={closeReevaluation} onSubmit={submitReevaluation} />
      <PrescreenDetail item={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function PrescreenSection({ section, canOverride, canReevaluate, busy, onOverride, onReevaluate, onOpen }) {
  const tone = {
    amber: "border-amber-200 focus:ring-amber-500",
    blue: "border-blue-200 focus:ring-blue-500",
    violet: "border-violet-200 focus:ring-violet-500",
    red: "border-red-200 focus:ring-red-500",
  }[section.tone];
  return (
    <section id={section.id} tabIndex={-1} className={`scroll-mt-24 overflow-hidden rounded-3xl border bg-white shadow-soft-lg outline-none focus:ring-2 focus:ring-offset-4 ${tone}`} aria-labelledby={`${section.id}-title`} data-testid={section.id}>
      <div className="flex flex-col gap-2 border-b border-lime-900/10 p-5 md:flex-row md:items-center md:justify-between md:p-6">
        <div>
          <h2 id={`${section.id}-title`} className="font-display text-xl font-semibold text-forest-950">{section.title}</h2>
          <p className="mt-1 text-sm text-forest-700/65">{section.description}</p>
        </div>
        <span className="self-start rounded-full border border-lime-900/10 bg-forest-50 px-3 py-1 text-xs font-semibold text-forest-800">{section.items.length} ötlet</span>
      </div>
      <div className="divide-y divide-lime-900/8">
        {section.items.map((item) => (
          <PrescreenCard key={`${section.id}-${item.ideaId}`} item={item} canOverride={canOverride} canReevaluate={canReevaluate} busy={busy} onOverride={onOverride} onReevaluate={onReevaluate} onOpen={onOpen} />
        ))}
        {!section.items.length && <div className="px-6 py-10 text-center text-sm text-forest-700/55">Ebben a szekcióban jelenleg nincs ötlet.</div>}
      </div>
    </section>
  );
}

function PrescreenCard({ item, canOverride, canReevaluate, busy, onOverride, onReevaluate, onOpen }) {
  return (
    <article className="p-5 transition-colors hover:bg-lime-50/30 md:p-6">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={item.workflowState || item.decision} />
            <span className="font-mono text-[10px] text-forest-700/60">{item.ideaId}</span>
            <Confidence value={item.confidencePercent} />
            {item.requiresHumanReview && <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[10px] font-semibold text-violet-800">Emberi felülvizsgálat</span>}
            {item.sourceChanged && <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[10px] font-semibold text-red-800">Az értékelés óta módosult</span>}
          </div>
          <button type="button" onClick={() => onOpen(item)} className="mt-3 text-left font-display text-lg font-semibold leading-snug text-forest-950 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-500">{item.title || "Névtelen ötlet"}</button>
          {item.reasonCategory && <p className="mt-2 text-xs font-semibold text-forest-700">Indokkategória: {item.reasonCategory}</p>}
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-forest-800">{item.reason || "Nincs megadott indoklás."}</p>

          {item.relatedIdeaId && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
              <ExternalLink className="h-3.5 w-3.5" />
              <span className="font-semibold">Kapcsolódó ötlet:</span>
              <span className="font-mono">{item.relatedIdeaId}</span>
              <span>{item.relatedIdeaTitle || "Cím nem állapítható meg"}</span>
            </div>
          )}

          {(item.clarificationQuestions || []).length > 0 && (
            <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-950">
              <div className="text-xs font-semibold">Konkrét pontosítási kérdések</div>
              <ol className="mt-2 list-decimal space-y-1 pl-5">{item.clarificationQuestions.map((question, index) => <li key={`${question}-${index}`} className="whitespace-pre-wrap">{question}</li>)}</ol>
            </div>
          )}
          {item.clarificationQuestionsCurrent === false && item.clarificationQuestionsMessage && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" /><span>{item.clarificationQuestionsMessage}</span></div>
          )}
        </div>

        <div className="flex flex-col items-start gap-3 xl:items-end">
          <div className="text-xs text-forest-700/60">Feldolgozva: {formatDateTime(item.processedAt)}</div>
          {item.humanDecision && <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900"><span className="font-semibold">Emberi döntés:</span> {humanDecisionText(item.humanDecision)}</div>}
          <Button type="button" variant="outline" size="sm" onClick={() => onOpen(item)} className="rounded-full border-lime-900/15"><Eye className="h-3.5 w-3.5" /> AI és eredeti ötlet</Button>
          {(canOverride || (canReevaluate && item.currentlyEligible)) && (
            <div className="flex flex-wrap justify-start gap-2 xl:justify-end">
              {canOverride && <OverrideButtons item={item} disabled={busy} onAction={onOverride} />}
              {canReevaluate && item.currentlyEligible && <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => onReevaluate(item)} className="rounded-full border-blue-200 text-blue-800 hover:bg-blue-50"><RotateCcw className="h-3.5 w-3.5" /> Újraértékelés</Button>}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function PrescreenDetail({ item, onClose }) {
  return (
    <Dialog open={!!item} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl border-lime-900/10 bg-white sm:max-w-4xl" data-testid="prescreen-detail">
        {item && (
          <>
            <DialogHeader>
              <DialogTitle className="pr-8 font-display text-2xl text-forest-950">{item.title || "Névtelen ötlet"}</DialogTitle>
              <DialogDescription>{item.ideaId} · előszűrés és eredeti ötletadatok</DialogDescription>
            </DialogHeader>
            <Tabs defaultValue="ai" className="mt-2">
              <TabsList className="bg-forest-50">
                <TabsTrigger value="ai">AI-előszűrés</TabsTrigger>
                <TabsTrigger value="original">Eredeti ötlet</TabsTrigger>
              </TabsList>
              <TabsContent value="ai" className="mt-5 space-y-4">
                <div className="flex flex-wrap gap-2"><StatusBadge status={item.workflowState || item.decision} /><Confidence value={item.confidencePercent} />{item.requiresHumanReview && <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[10px] font-semibold text-violet-800">Emberi felülvizsgálat szükséges</span>}</div>
                {item.reasonCategory && <DetailField label="Indokkategória" value={item.reasonCategory} />}
                <DetailField label="Rövid indoklás" value={item.reason} />
                {item.relatedIdeaId && <DetailField label="Kapcsolódó ötlet" value={`${item.relatedIdeaId} · ${item.relatedIdeaTitle || "Cím nem állapítható meg"}`} />}
                {(item.clarificationQuestions || []).length > 0 && <DetailList label="Pontosítási kérdések" items={item.clarificationQuestions} />}
                {item.clarificationQuestionsCurrent === false && item.clarificationQuestionsMessage && <DetailField label="Pontosítási kérdések állapota" value={item.clarificationQuestionsMessage} />}
                {(item.evidence || []).length > 0 && <DetailList label="Bizonyítékok" items={item.evidence} />}
                {(item.missingInformation || []).length > 0 && <DetailList label="Hiányzó információ" items={item.missingInformation} />}
                {(item.criticalRiskFlags || []).length > 0 && <DetailList label="Kritikus jelzések" items={item.criticalRiskFlags} />}
                {item.errorType && <DetailField label="Technikai hiba" value={item.errorType} />}
                <p className="text-xs text-forest-700/60">Feldolgozva: {formatDateTime(item.processedAt)}</p>
              </TabsContent>
              <TabsContent value="original" className="mt-5"><OriginalIdeaPanel idea={item.originalIdea} /></TabsContent>
            </Tabs>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function OverrideDialog({ action, comment, setComment, busy, onClose, onSubmit }) {
  return (
    <Dialog open={!!action} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="rounded-3xl border-lime-900/10 bg-white sm:max-w-xl">
        <DialogHeader><DialogTitle>{actionLabel(action?.decision)}</DialogTitle><DialogDescription>{action?.item?.ideaId} · {action?.item?.title}. Az eredeti AI-javaslat auditadatként megmarad.</DialogDescription></DialogHeader>
        <label className="block"><span className="mb-2 block text-xs font-semibold text-forest-900">Kötelező emberi megjegyzés</span><Textarea value={comment} onChange={(event) => setComment(event.target.value)} disabled={busy} rows={5} maxLength={2000} placeholder="Legalább 5 karakterben írd le a döntés szakmai indokát…" className="resize-y rounded-xl border-lime-900/15" autoFocus /><span className="mt-1 block text-right text-[10px] text-forest-700/55">{comment.length}/2000</span></label>
        <DialogFooter><Button type="button" variant="outline" onClick={onClose} disabled={busy} className="rounded-full">Mégse</Button><Button type="button" onClick={onSubmit} disabled={comment.trim().length < 5 || busy} className="rounded-full bg-forest-950 text-lime-50 hover:bg-forest-900">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}{busy ? "Mentés…" : "Döntés mentése"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReevaluationDialog({ target, comment, setComment, busy, onClose, onSubmit }) {
  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="rounded-3xl border-lime-900/10 bg-white sm:max-w-xl">
        <DialogHeader><DialogTitle>Ötlet teljes újraértékelése</DialogTitle><DialogDescription>{target?.ideaId} · {target?.title}. Az ötlet újra lefut az előszűrésen, majd az eredmény szerint rangsorba kerül, lezárásra javasolt vagy pontosítandó lesz. Az új eredmény külön előzményként kerül mentésre.</DialogDescription></DialogHeader>
        {(target?.sourceChanged || target?.requiresReevaluation) && <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" /><span>Az ötlet forrásadata vagy az értékelési módszertan megváltozott.</span></div>}
        <label className="block"><span className="mb-2 block text-xs font-semibold text-forest-900">Kötelező szakmai megjegyzés</span><Textarea value={comment} onChange={(event) => setComment(event.target.value)} disabled={busy} rows={5} maxLength={2000} placeholder="Legalább 5 karakterben indokold az újraértékelést…" className="resize-y rounded-xl border-lime-900/15" autoFocus /><span className="mt-1 block text-right text-[10px] text-forest-700/55">{comment.length}/2000</span></label>
        <DialogFooter><Button type="button" variant="outline" onClick={onClose} disabled={busy} className="rounded-full">Mégse</Button><Button type="button" onClick={onSubmit} disabled={!isReevaluationCommentValid(comment) || busy} className="rounded-full bg-blue-800 text-white hover:bg-blue-900">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}{busy ? "Újraértékelés…" : "Újraértékelés indítása"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OverrideButtons({ item, disabled, onAction }) {
  const workflowState = item.workflowState || item.decision;
  if (item.evaluationCurrent === true || ["CLOSURE_ACCEPTED", "CLARIFICATION_ACCEPTED", "RANKED", "TECHNICAL_FAILURE"].includes(workflowState)) return null;
  const directScoringStates = ["HELD", "AI_RESPONSE_REVIEW_REQUIRED", "SCORING_ALLOWED"];
  const actions = directScoringStates.includes(workflowState)
    ? [{ decision: "ALLOW_SCORING", label: "Közvetlenül pontozásra", icon: UserCheck }]
    : item.decision === "PASS"
      ? [{ decision: "HOLD", label: "Visszatartás", icon: ShieldCheck, variant: "outline" }]
      : !item.humanDecision && !["FAILED", "PENDING"].includes(item.decision)
      ? [
          { decision: "ALLOW_SCORING", label: "Továbbengedés pontozásra", icon: UserCheck },
          { decision: "ACCEPT_RECOMMENDATION", label: "Javaslat elfogadása", icon: CheckCircle2, variant: "outline" },
        ]
      : [];
  if (!actions.length) return null;
  return actions.map(({ decision, label, icon: Icon, variant }) => <Button key={decision} type="button" variant={variant} size="sm" disabled={disabled} onClick={() => onAction(item, decision)} className={variant === "outline" ? "rounded-full border-lime-900/15" : "rounded-full bg-forest-950 text-lime-50 hover:bg-forest-900"}><Icon className="h-3.5 w-3.5" /> {label}</Button>);
}

function StatusBadge({ status }) {
  const workflowStatus = {
    CLOSURE_ACCEPTED: { label: "Lezárandó", tone: "warning" },
    CLARIFICATION_ACCEPTED: { label: "Pontosításra visszaküldendő", tone: "info" },
    HELD: { label: "Emberi felülvizsgálatra visszatartva", tone: "neutral" },
    RANKED: { label: "Rangsorolt", tone: "success" },
    SCORING_ALLOWED: { label: "Pontozásra továbbengedve", tone: "success" },
    AI_RESPONSE_REVIEW_REQUIRED: { label: "AI-válasz ellenőrzendő", tone: "neutral" },
    TECHNICAL_FAILURE: { label: "Feldolgozás sikertelen", tone: "danger" },
  };
  const meta = workflowStatus[status] || PRESCREEN_STATUS[status] || { label: status || "Ismeretlen", tone: "neutral" };
  const tones = { success: "border-emerald-200 bg-emerald-50 text-emerald-800", warning: "border-amber-200 bg-amber-50 text-amber-800", danger: "border-red-200 bg-red-50 text-red-800", info: "border-blue-200 bg-blue-50 text-blue-800", neutral: "border-slate-200 bg-slate-50 text-slate-700" };
  return <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${tones[meta.tone]}`}>{meta.label}</span>;
}

function Confidence({ value }) {
  const label = value === null || value === undefined ? "—" : `${value}%`;
  return <span className="rounded-full border border-lime-200 bg-lime-50 px-2.5 py-1 text-[10px] font-semibold text-forest-800">Bizonyosság: {label}</span>;
}

function DetailField({ label, value }) {
  return <div><h4 className="text-[10px] font-semibold uppercase tracking-[0.13em] text-forest-700/65">{label}</h4><p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-forest-950">{safeText(value) || "—"}</p></div>;
}

function DetailList({ label, items }) {
  return <div><h4 className="text-[10px] font-semibold uppercase tracking-[0.13em] text-forest-700/65">{label}</h4><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-forest-950">{items.map((item, index) => <li key={`${safeText(item)}-${index}`} className="whitespace-pre-wrap">{safeText(item)}</li>)}</ul></div>;
}

function actionLabel(decision) {
  if (decision === "ALLOW_SCORING") return "Továbbengedés pontozásra";
  if (decision === "HOLD") return "Ötlet visszatartása";
  if (decision === "ACCEPT_RECOMMENDATION") return "AI-javaslat elfogadása";
  return "Emberi döntés";
}

function humanDecisionText(value) {
  if (typeof value !== "object" || value === null) return String(value);
  return value.decision || value.status || value.comment || Object.values(value).filter((item) => typeof item !== "object").join(" · ") || "Rögzítve";
}

function safeText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value !== "object") return String(value);
  return value.label || value.name || value.code || Object.values(value).filter((item) => typeof item !== "object").join(": ");
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("hu-HU", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
