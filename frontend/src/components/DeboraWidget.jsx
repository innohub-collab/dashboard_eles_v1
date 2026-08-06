import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { BookOpenText, RotateCcw, Send, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const BACKEND_URL =
  process.env.REACT_APP_BACKEND_URL ||
  (window.location.port === "3000"
    ? `${window.location.protocol}//${window.location.hostname}:8000`
    : window.location.origin);
const API = `${BACKEND_URL}/api`;
const STORAGE_KEY = "innolab.debora.widget.v1";
const MAX_STORED_MESSAGES = 60;
const PROFILE_IMAGE = "/debora-profile.png";
const GREETING = {
  role: "assistant",
  content:
    "Szia, Debora vagyok! Kérdezz az Innolab Dashboard KPI-jairól, szűrőiről, adatforrásairól vagy működéséről — a válaszomat a kódbázis alapján adom meg.",
  localOnly: true,
};

function cleanSources(sources) {
  if (!Array.isArray(sources)) return [];
  return sources
    .filter(
      (source) =>
        source &&
        typeof source.path === "string" &&
        Number.isInteger(source.startLine) &&
        Number.isInteger(source.endLine),
    )
    .slice(0, 8)
    .map((source) => ({
      sourceId: typeof source.sourceId === "string" ? source.sourceId : "",
      path: source.path,
      startLine: source.startLine,
      endLine: source.endLine,
      symbol: typeof source.symbol === "string" ? source.symbol : null,
    }));
}

function cleanMessages(messages) {
  if (!Array.isArray(messages)) return [GREETING];
  const cleaned = messages
    .filter(
      (message) =>
        message &&
        ["user", "assistant"].includes(message.role) &&
        typeof message.content === "string" &&
        message.content.trim(),
    )
    .slice(-MAX_STORED_MESSAGES)
    .map((message) => ({
      role: message.role,
      content: message.content.slice(0, 12_000),
      ...(message.localOnly ? { localOnly: true } : {}),
      ...(typeof message.model === "string" ? { model: message.model } : {}),
      ...(message.role === "assistant" ? { sources: cleanSources(message.sources) } : {}),
    }));
  return cleaned.length ? cleaned : [GREETING];
}

function loadWidgetState() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    return {
      open: stored?.open === true,
      messages: cleanMessages(stored?.messages),
    };
  } catch {
    return { open: false, messages: [GREETING] };
  }
}

export default function DeboraWidget() {
  const initialState = useRef(null);
  if (initialState.current === null) initialState.current = loadWidgetState();

  const [open, setOpen] = useState(initialState.current.open);
  const [messages, setMessages] = useState(initialState.current.messages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ open, messages: cleanMessages(messages) }),
      );
    } catch {
      // The widget remains usable when storage is blocked or full.
    }
  }, [messages, open]);

  useEffect(() => {
    if (!open) return;
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open, sending]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  const resetChat = () => {
    if (sending) return;
    setMessages([GREETING]);
    setDraft("");
    setError("");
    inputRef.current?.focus();
  };

  const sendMessage = async () => {
    const content = draft.trim();
    if (!content || sending) return;

    const userMessage = { role: "user", content };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setDraft("");
    setError("");
    setSending(true);

    try {
      const history = nextMessages
        .filter((message) => !message.localOnly)
        .slice(-20)
        .map(({ role, content: text }) => ({ role, content: text }));
      const { data } = await axios.post(
        `${API}/chat`,
        { messages: history },
        { timeout: 180_000 },
      );
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: data.answer,
          model: data.model,
          sources: cleanSources(data.sources),
        },
      ]);
    } catch (requestError) {
      setError(
        requestError?.response?.data?.detail ||
          "Nem sikerült elérni Deborát. Ellenőrizd, hogy fut-e a backend, majd próbáld újra.",
      );
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {open && (
        <section
          id="debora-widget-panel"
          role="dialog"
          aria-label="Debora, Innolab AI-asszisztens"
          data-testid="debora-widget"
          className="fixed bottom-24 right-3 sm:right-5 z-[80] flex min-w-0 h-[min(680px,calc(100vh-116px))] w-[min(420px,calc(100vw-24px))] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-[28px] border border-lime-900/15 bg-white shadow-[0_24px_80px_rgba(20,55,24,0.28)]"
        >
          <header className="panel-dark relative flex items-center justify-between gap-3 px-4 py-4">
            <div className="grain absolute inset-0 opacity-30 pointer-events-none" />
            <div className="relative z-10 flex min-w-0 items-center gap-3">
              <DeboraAvatar className="h-11 w-11" />
              <div className="min-w-0">
                <h2 className="font-display text-lg font-semibold leading-tight text-white">
                  Debora
                </h2>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-lime-200/85">
                  <span className="h-2 w-2 rounded-full bg-lime-400" />
                  Innolab tudásasszisztens
                </div>
              </div>
            </div>
            <div className="relative z-10 flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={resetChat}
                disabled={sending || messages.length === 1}
                className="rounded-full text-lime-100 hover:bg-lime-400/15 hover:text-white"
                aria-label="Új beszélgetés"
                title="Új beszélgetés"
                data-testid="debora-reset"
              >
                <RotateCcw className="h-4 w-4" strokeWidth={1.8} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setOpen(false)}
                className="rounded-full text-lime-100 hover:bg-lime-400/15 hover:text-white"
                aria-label="Debora bezárása"
              >
                <X className="h-4 w-4" strokeWidth={1.8} />
              </Button>
            </div>
          </header>

          <div
            className="min-w-0 flex-1 space-y-4 overflow-x-hidden overflow-y-auto bg-white px-4 py-5"
            aria-live="polite"
            data-testid="debora-messages"
          >
            {messages.map((message, index) => (
              <MessageBubble key={`${message.role}-${index}`} message={message} />
            ))}
            {sending && (
              <div className="flex items-start gap-2.5" data-testid="debora-typing">
                <DeboraAvatar className="h-8 w-8" />
                <div className="flex gap-1.5 rounded-2xl rounded-tl-md border border-lime-200/70 bg-lime-50 px-4 py-3">
                  {[0, 1, 2].map((dot) => (
                    <span
                      key={dot}
                      className="h-1.5 w-1.5 animate-bounce rounded-full bg-forest-700/45"
                      style={{ animationDelay: `${dot * 120}ms` }}
                    />
                  ))}
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          <footer className="min-w-0 border-t border-lime-900/10 bg-forest-50/80 px-4 py-4">
            {error && (
              <div
                className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-700"
                role="alert"
              >
                {error}
              </div>
            )}
            <div className="flex min-w-0 items-end gap-2">
              <label htmlFor="debora-widget-input" className="sr-only">
                Üzenet Deborának
              </label>
              <Textarea
                ref={inputRef}
                id="debora-widget-input"
                data-testid="debora-input"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Kérdezz az Innolab Dashboardról…"
                maxLength={8000}
                rows={2}
                disabled={sending}
                className="min-w-0 max-h-32 min-h-[52px] flex-1 resize-none rounded-2xl border-lime-900/15 bg-white text-sm focus-visible:ring-lime-500/40"
              />
              <Button
                type="button"
                onClick={sendMessage}
                disabled={sending || !draft.trim()}
                className="h-[52px] w-[52px] flex-shrink-0 rounded-2xl bg-forest-950 text-lime-50 shadow-panel-deep hover:bg-forest-900"
                aria-label="Üzenet küldése"
                data-testid="debora-send"
              >
                <Send className="h-5 w-5" strokeWidth={1.75} />
              </Button>
            </div>
            <p className="mt-2 text-center text-[10px] text-forest-700/55">
              Enter: küldés · Shift + Enter: új sor
            </p>
          </footer>
        </section>
      )}

      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={open ? "Debora bezárása" : "Debora megnyitása"}
        aria-expanded={open}
        aria-controls="debora-widget-panel"
        data-testid="debora-launcher"
        className="fixed bottom-4 right-3 sm:bottom-5 sm:right-5 z-[80] h-16 w-16 overflow-hidden rounded-full border-[3px] border-white bg-forest-950 shadow-[0_12px_36px_rgba(20,55,24,0.42)] transition-transform duration-200 hover:scale-105 focus:outline-none focus-visible:ring-4 focus-visible:ring-lime-400/50"
      >
        <img
          src={PROFILE_IMAGE}
          alt=""
          className="h-full w-full object-cover"
          draggable="false"
        />
        <span className="absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-lime-400" />
      </button>
    </>
  );
}

function MessageBubble({ message }) {
  const isUser = message.role === "user";
  const sources = cleanSources(message.sources);
  return (
    <div className={`flex w-full min-w-0 items-start gap-2.5 ${isUser ? "flex-row-reverse" : ""}`}>
      {isUser ? <UserAvatar /> : <DeboraAvatar className="h-8 w-8" />}
      <div className={`min-w-0 max-w-[84%] ${isUser ? "text-right" : ""}`}>
        <div
          data-testid="debora-message-content"
          className={`block w-fit min-w-0 max-w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere] rounded-2xl px-3.5 py-2.5 text-left text-[13px] leading-relaxed ${
            isUser
              ? "ml-auto rounded-tr-md bg-forest-950 text-lime-50"
              : "rounded-tl-md border border-lime-200/70 bg-lime-50 text-forest-950"
          }`}
        >
          {message.content}
        </div>
        {!isUser && sources.length > 0 && (
          <div className="mt-2 min-w-0 max-w-full space-y-1 overflow-hidden text-left" data-testid="debora-sources">
            <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-forest-700/55">
              <BookOpenText className="h-3 w-3" />
              Kódbázis-források
            </div>
            {sources.map((source) => (
              <div
                key={`${source.sourceId}-${source.path}-${source.startLine}`}
                className="rounded-lg border border-forest-900/10 bg-forest-50 px-2.5 py-2 font-mono text-[10px] leading-snug text-forest-800"
                title={`${source.path}:${source.startLine}-${source.endLine}`}
              >
                <div className="break-all font-semibold">{source.path}</div>
                <div className="mt-0.5 text-forest-700/65">
                  {source.symbol ? `${source.symbol} · ` : ""}
                  {source.startLine}.–{source.endLine}. sor
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DeboraAvatar({ className }) {
  return (
    <div
      className={`${className} flex-shrink-0 overflow-hidden rounded-full border-2 border-white/80 bg-forest-950 shadow-sm`}
    >
      <img src={PROFILE_IMAGE} alt="" className="h-full w-full object-cover" draggable="false" />
    </div>
  );
}

function UserAvatar() {
  return (
    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-lime-200 text-forest-950">
      <UserRound className="h-4 w-4" strokeWidth={1.75} />
    </div>
  );
}
