import { useEffect, useRef, useState } from "react";
import axios from "axios";
import {
  ArrowUp,
  Bot,
  Database,
  LoaderCircle,
  MessageSquareText,
  RefreshCw,
  Sparkles,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import AIDashboardReport from "@/components/ai-dashboard/AIDashboardReport";

const BACKEND_URL =
  process.env.REACT_APP_BACKEND_URL ||
  (window.location.port === "3000"
    ? `${window.location.protocol}//${window.location.hostname}:8000`
    : window.location.origin);
const API = BACKEND_URL + "/api";

const INITIAL_MESSAGE = {
  role: "assistant",
  content: "Írd le, milyen riportot szeretnél az aktuálisan betöltött ötletadatokból.",
  localOnly: true,
};

const SAMPLE_QUESTIONS = [
  "Mutasd az ötletek számát igazgatóságonként.",
  "Készíts KPI-kártyákat, diagramot és táblázatot a státuszokról.",
  "Készíts vezetői összefoglalót az InnoChallenge ötletekről.",
  "Mutasd a 10 legfrissebb, még nyitott ötletet.",
];

export default function AIDashboard() {
  const [messages, setMessages] = useState([INITIAL_MESSAGE]);
  const [draft, setDraft] = useState("");
  const [report, setReport] = useState(null);
  const [schema, setSchema] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastQuestion, setLastQuestion] = useState("");
  const endRef = useRef(null);

  useEffect(() => {
    axios
      .get(API + "/ai-dashboard/schema")
      .then(({ data }) => setSchema(data))
      .catch(() => setSchema(null));
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const submit = async (questionOverride) => {
    const question = (questionOverride ?? draft).trim();
    if (!question || loading) return;

    const history = messages
      .filter((message) => !message.localOnly)
      .slice(-8)
      .map(({ role, content }) => ({ role, content }));
    setMessages((current) => [...current, { role: "user", content: question }]);
    setDraft("");
    setError("");
    setLastQuestion(question);
    setLoading(true);

    try {
      const { data } = await axios.post(
        API + "/ai-dashboard/query",
        { question, history },
        { timeout: 150000 },
      );
      setMessages((current) => [
        ...current,
        { role: "assistant", content: data.message || "A riport elkészült." },
      ]);
      if (data.report) setReport(data.report);
    } catch (requestError) {
      setError(
        requestError?.response?.data?.detail ||
          "A riport most nem készíthető el. Ellenőrizd a kapcsolatot, majd próbáld újra.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div className="pt-6 h-[calc(100vh-112px)] min-h-[620px]" data-testid="ai-dashboard-page">
      <div className="h-full grid grid-cols-1 xl:grid-cols-[390px_minmax(0,1fr)] gap-5">
        <section className="min-h-[580px] rounded-3xl bg-white border border-lime-900/10 shadow-soft-lg overflow-hidden flex flex-col">
          <div className="panel-dark relative px-5 py-4">
            <div className="grain absolute inset-0 opacity-30" />
            <div className="relative z-10 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-lime-400/20 border border-lime-300/40 flex items-center justify-center">
                  <MessageSquareText className="w-5 h-5 text-lime-300" strokeWidth={1.75} />
                </div>
                <div>
                  <h2 className="font-display text-lg font-semibold text-white">Riportbeszélgetés</h2>
                  <p className="text-[11px] text-lime-200/75">A számításokat a backend végzi</p>
                </div>
              </div>
              {schema && (
                <div className="text-right text-[10px] text-lime-200/75" data-testid="ai-schema-status">
                  <Database className="w-3.5 h-3.5 ml-auto mb-0.5" />
                  {schema.recordCount} rekord
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4" aria-live="polite">
            {messages.map((message, index) => (
              <ChatBubble key={message.role + "-" + index} message={message} />
            ))}

            {messages.length === 1 && (
              <div className="pl-11 space-y-2" data-testid="ai-sample-questions">
                <p className="text-[10px] uppercase tracking-[0.16em] font-semibold text-forest-700/55">
                  Mintakérdések
                </p>
                {SAMPLE_QUESTIONS.map((question) => (
                  <button
                    key={question}
                    type="button"
                    onClick={() => setDraft(question)}
                    className="block w-full text-left rounded-xl border border-lime-200/80 bg-forest-50 px-3 py-2 text-xs leading-relaxed text-forest-900 hover:border-lime-500 hover:bg-lime-50 transition-colors"
                  >
                    {question}
                  </button>
                ))}
              </div>
            )}

            {loading && (
              <div className="flex items-start gap-2.5" data-testid="ai-dashboard-loading">
                <ChatAvatar role="assistant" />
                <div className="rounded-2xl rounded-tl-md bg-lime-50 border border-lime-200/70 px-4 py-3 text-xs text-forest-800 flex items-center gap-2">
                  <LoaderCircle className="w-4 h-4 animate-spin" />
                  Terv készítése és adatok számítása…
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div className="border-t border-lime-900/10 bg-forest-50/70 p-4">
            {error && (
              <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700" role="alert">
                <p>{error}</p>
                {lastQuestion && (
                  <button
                    type="button"
                    onClick={() => submit(lastQuestion)}
                    className="mt-2 inline-flex items-center gap-1.5 font-semibold hover:underline"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Ismételt próbálkozás
                  </button>
                )}
              </div>
            )}
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label htmlFor="ai-dashboard-input" className="sr-only">Riportkérés</label>
                <Textarea
                  id="ai-dashboard-input"
                  data-testid="ai-dashboard-input"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Például: Mutasd az ötleteket státuszonként…"
                  maxLength={4000}
                  rows={2}
                  disabled={loading}
                  className="min-h-[58px] max-h-36 resize-none rounded-2xl bg-white border-lime-900/15 focus-visible:ring-lime-500/40 text-sm"
                />
              </div>
              <Button
                type="button"
                onClick={() => submit()}
                disabled={loading || !draft.trim()}
                className="h-[58px] w-[52px] rounded-2xl bg-forest-950 hover:bg-forest-900 text-lime-50"
                aria-label="Riportkérés küldése"
                data-testid="ai-dashboard-send"
              >
                <ArrowUp className="w-5 h-5" strokeWidth={1.8} />
              </Button>
            </div>
            <p className="mt-2 text-[10px] text-center text-forest-700/55">
              Az AI csak tervet készít · minden eredmény az aktuális Excelből számolódik
            </p>
          </div>
        </section>

        <section className="min-h-[580px] overflow-y-auto rounded-3xl border border-lime-900/10 bg-white/55 shadow-soft-lg">
          {report ? <AIDashboardReport report={report} /> : <EmptyReport schema={schema} />}
        </section>
      </div>
    </div>
  );
}

function ChatBubble({ message }) {
  const isUser = message.role === "user";
  const layout = isUser ? " flex-row-reverse" : "";
  const bubble = isUser
    ? " rounded-tr-md bg-forest-950 text-lime-50"
    : " rounded-tl-md bg-lime-50 border border-lime-200/70 text-forest-950";
  return (
    <div className={"flex items-start gap-2.5" + layout}>
      <ChatAvatar role={message.role} />
      <div className={"max-w-[84%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap" + bubble}>
        {message.content}
      </div>
    </div>
  );
}

function ChatAvatar({ role }) {
  const isUser = role === "user";
  const Icon = isUser ? UserRound : Bot;
  const style = isUser ? " bg-lime-200 text-forest-950" : " bg-forest-950 text-lime-300";
  return (
    <div className={"w-8 h-8 flex-shrink-0 rounded-xl flex items-center justify-center" + style}>
      <Icon className="w-4 h-4" strokeWidth={1.75} />
    </div>
  );
}

function EmptyReport({ schema }) {
  return (
    <div className="h-full min-h-[580px] flex items-center justify-center p-8 text-center" data-testid="ai-dashboard-empty">
      <div className="max-w-md">
        <div className="w-16 h-16 mx-auto rounded-3xl bg-lime-100 border border-lime-200 flex items-center justify-center">
          <Sparkles className="w-7 h-7 text-forest-800" strokeWidth={1.5} />
        </div>
        <h3 className="font-display text-xl font-semibold text-forest-950 mt-5">A dinamikus riport itt jelenik meg</h3>
        <p className="text-sm text-forest-700/70 mt-2 leading-relaxed">
          Válassz egy mintakérdést vagy írd le saját szavaiddal, milyen bontást, KPI-t vagy diagramot szeretnél.
        </p>
        {schema && (
          <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-white border border-lime-200 px-4 py-2 text-xs text-forest-800">
            <Database className="w-3.5 h-3.5" />
            {(schema.sheetNames?.join(", ") || "Excel") + " · " + schema.recordCount + " feldolgozott rekord"}
          </div>
        )}
      </div>
    </div>
  );
}
