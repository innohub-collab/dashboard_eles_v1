const META_FIELDS = [
  ["Státusz", "status"],
  ["Kategória", "category"],
  ["Feladattípus", "taskType"],
  ["Bejelentő", "submitter"],
  ["Hozzárendelt", "assignee"],
  ["Igazgatóság", "directorate"],
  ["Szervezeti egység", "businessUnit"],
  ["Érintett terület", "affectedArea"],
  ["Prioritás", "priority"],
  ["Komplexitás", "complexity"],
  ["Becsült méret", "estimatedSize"],
  ["Program", "program"],
];

export default function OriginalIdeaPanel({ idea }) {
  if (!idea) {
    return <p className="rounded-2xl bg-forest-50 p-4 text-sm text-forest-700/65">Az eredeti ötlet adatai nem érhetők el.</p>;
  }

  const meta = META_FIELDS.filter(([, key]) => hasValue(idea[key]));
  return (
    <div className="space-y-5" data-testid="original-idea-panel">
      <div>
        <div className="font-mono text-[11px] text-forest-700/60">{text(idea.ideaId)}</div>
        <h3 className="mt-1 font-display text-xl font-semibold text-forest-950">{text(idea.title) || "Cím nélküli ötlet"}</h3>
      </div>
      <TextBlock title="Leírás" value={idea.description} />
      <TextBlock title="Elvárt eredmény" value={idea.expectedResult} />
      {hasValue(idea.resolution) && <TextBlock title="Megoldás" value={idea.resolution} />}
      {!!meta.length && (
        <dl className="grid gap-3 rounded-2xl border border-lime-900/10 bg-forest-50/60 p-4 sm:grid-cols-2">
          {meta.map(([label, key]) => (
            <div key={key}>
              <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-forest-700/60">{label}</dt>
              <dd className="mt-1 whitespace-pre-wrap text-sm text-forest-950">{text(idea[key]) || "—"}</dd>
            </div>
          ))}
        </dl>
      )}
      {Array.isArray(idea.tags) && idea.tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {idea.tags.map((tag, index) => <span key={`${text(tag)}-${index}`} className="rounded-full border border-lime-200 bg-lime-50 px-2.5 py-1 text-[10px] font-semibold text-forest-800">{text(tag)}</span>)}
        </div>
      )}
      <div className="grid gap-2 text-xs text-forest-700/65 sm:grid-cols-2">
        <div>Létrehozva: {formatDateTime(idea.createdAt)}</div>
        <div>Frissítve: {formatDateTime(idea.updatedAt)}</div>
      </div>
    </div>
  );
}

function TextBlock({ title, value }) {
  return (
    <section>
      <h4 className="text-[10px] font-semibold uppercase tracking-[0.13em] text-forest-700/65">{title}</h4>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-forest-950">{text(value) || "Nincs megadva."}</p>
    </section>
  );
}

function hasValue(value) {
  return value !== null && value !== undefined && text(value).trim() !== "";
}

function text(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(", ");
  if (typeof value === "object") return Object.values(value).map(text).filter(Boolean).join(" · ");
  return String(value);
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return text(value);
  return new Intl.DateTimeFormat("hu-HU", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
