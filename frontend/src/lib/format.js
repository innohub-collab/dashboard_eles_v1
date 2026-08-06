export const fmtNumber = (n) =>
  typeof n === "number"
    ? new Intl.NumberFormat("hu-HU").format(n)
    : n ?? "—";

export const fmtPercent = (n, digits = 0) =>
  typeof n === "number" ? `${n.toFixed(digits)}%` : "—";

export const fmtDate = (iso) => {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("hu-HU", {
      year: "numeric",
      month: "short",
      day: "2-digit",
    }).format(d);
  } catch {
    return iso;
  }
};

export const fmtDateTime = (iso) => {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("hu-HU", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return iso;
  }
};

export const daysBetween = (a, b = new Date()) => {
  if (!a) return null;
  const start = new Date(a);
  const end = b instanceof Date ? b : new Date(b);
  const diff = Math.floor((end - start) / (1000 * 60 * 60 * 24));
  return isFinite(diff) ? diff : null;
};

export const monthKey = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export const monthLabel = (key) => {
  if (!key) return "";
  const [y, m] = key.split("-");
  const names = ["jan", "feb", "márc", "ápr", "máj", "jún", "júl", "aug", "szept", "okt", "nov", "dec"];
  return `${names[parseInt(m, 10) - 1]} ${y}`;
};
