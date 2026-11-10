"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { MapPin, Mic, MicOff, Phone, Send, Square, Trash2, Volume2 } from "lucide-react";
import { needsPosition, matchIntent } from "@/lib/ai/intents";
import { quickQuestions, type AssistantAction, type QuickQuestion, type ReplySource } from "@/lib/ai/types";
import { getCurrentPosition, type Coordinates } from "@/lib/geo";
import { useI18n } from "@/lib/i18n/provider";
import { useVoice } from "@/lib/voice/provider";

type Message = { id: string; role: "user" | "assistant"; text: string; actions?: AssistantAction[]; source?: ReplySource };
type AiStatus = "ready" | "not_configured" | "unavailable";

// Per tab only, and gone when the tab closes: the conversation can hold health details.
const STORAGE_KEY = "cm_assistant_chat";
const MAX_HISTORY = 20;

type Recognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function recognitionClass(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

const newId = () => Math.random().toString(36).slice(2);

function readStored(): Message[] {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Message[]) : [];
    return Array.isArray(parsed) ? parsed.slice(-MAX_HISTORY) : [];
  } catch {
    return [];
  }
}

export function AssistantChat({ aiReady }: { aiReady: boolean }) {
  const { t, locale } = useI18n();
  const a = t.assistant;
  const voice = useVoice();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [ai, setAi] = useState<AiStatus>(aiReady ? "ready" : "not_configured");
  const [listening, setListening] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const loaded = useRef(false);

  useEffect(() => {
    // Read after hydration, so the server and the first client render agree.
    const stored = readStored();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from this tab's storage
    if (stored.length) setMessages(stored);
    loaded.current = true;
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_HISTORY)));
    } catch {
      // Storage blocked: the conversation simply is not kept.
    }
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  useEffect(() => () => controller.current?.abort(), []);

  const ask = useCallback(
    async (text: string, quick: QuickQuestion | null) => {
      const question = text.trim();
      if (!question || busy) return;
      voice.stop();
      setNotice(null);
      const userMessage: Message = { id: newId(), role: "user", text: question };
      const history = [...messages, userMessage].slice(-MAX_HISTORY);
      setMessages(history);
      setDraft("");
      setBusy(true);
      const abort = new AbortController();
      controller.current = abort;
      try {
        let origin: Coordinates | null = null;
        const intent = quick ?? matchIntent(question);
        if (intent && needsPosition(intent)) {
          // Used once for this question and never stored.
          origin = await getCurrentPosition()
            .then(({ latitude, longitude }) => ({ latitude, longitude }))
            .catch(() => null);
          if (!origin) setNotice(a.noPosition);
        }
        const response = await fetch("/api/assistant/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: abort.signal,
          body: JSON.stringify({
            locale,
            quick,
            origin,
            messages: history.filter((message) => message.text).map(({ role, text: body }) => ({ role, text: body.slice(0, 1000) })),
          }),
        });
        if (response.status === 401) return setNotice(a.signedOut);
        if (response.status === 429) return setNotice(a.tooMany);
        if (!response.ok) return setNotice(a.failed);
        const data = (await response.json()) as { reply: { text: string; actions: AssistantAction[]; source: ReplySource }; ai: AiStatus };
        setAi(data.ai);
        setMessages((current): Message[] => [...current, { id: newId(), role: "assistant" as const, ...data.reply }].slice(-MAX_HISTORY));
        // Read out automatically only with voice assistance on, and only if health details may be spoken.
        voice.speak(data.reply.text, { auto: true, sensitive: true });
      } catch (error) {
        setNotice(error instanceof DOMException && error.name === "AbortError" ? a.stopped : a.failed);
      } finally {
        setBusy(false);
        controller.current = null;
      }
    },
    [a, busy, locale, messages, voice],
  );

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void ask(draft, null);
  };

  const clear = () => {
    controller.current?.abort();
    voice.stop();
    setMessages([]);
    setNotice(null);
  };

  const toggleListening = () => {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const Speech = recognitionClass();
    if (!Speech) return setNotice(a.micUnsupported);
    voice.stop();
    const instance = new Speech();
    instance.lang = locale === "ru" ? "ru-RU" : "uz-UZ";
    instance.interimResults = false;
    instance.maxAlternatives = 1;
    let heard = "";
    instance.onresult = (event) => {
      heard = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
    };
    instance.onerror = (event) => setNotice(event.error === "not-allowed" || event.error === "service-not-allowed" ? a.micDenied : a.micNothing);
    instance.onend = () => {
      setListening(false);
      recognition.current = null;
      if (heard) void ask(heard, null);
    };
    recognition.current = instance;
    setNotice(null);
    setListening(true);
    try {
      instance.start();
    } catch {
      setListening(false);
      setNotice(a.micUnsupported);
    }
  };

  const actionLabel = (action: AssistantAction) =>
    action.kind === "call" ? a.call(action.label) : action.kind === "open_facility" ? a.openPlace(action.label) : a.pages[action.page];

  const quickSection = (
    <section aria-labelledby="quick-title" className="flex flex-col gap-2">
      <h2 id="quick-title" className="text-[1.1rem]">
        {a.quickTitle}
      </h2>
      <div className="flex flex-wrap gap-2">
        {quickQuestions.map((question) => (
          <button key={question} type="button" className="btn btn-secondary min-h-[48px] text-left" disabled={busy} onClick={() => void ask(a.quick[question], question)}>
            {needsPosition(question) && <MapPin aria-hidden size={20} className="shrink-0" />}
            {a.quick[question]}
          </button>
        ))}
      </div>
    </section>
  );

  return (
    <div className="flex flex-col gap-4">
      {ai !== "ready" && (
        <p className="notice notice-info" data-testid="assistant-ai-status">
          {ai === "not_configured" ? a.aiOff : a.aiUnavailable}
        </p>
      )}

      {/* First the questions to start with; once talking, the answer and the reply box come first. */}
      {messages.length === 0 && quickSection}

      <div role="log" aria-live="polite" aria-label={a.title} className="flex flex-col gap-3" data-testid="assistant-log">
        {messages.map((message) => (
          <article
            key={message.id}
            className={`card flex flex-col gap-2 ${message.role === "user" ? "ml-8 border-brand bg-brand-pale" : "mr-4"}`}
            data-role={message.role}
          >
            <p className="text-[0.85rem] font-bold text-muted">{message.role === "user" ? a.you : a.me}</p>
            <p className="text-[1.15rem] leading-relaxed whitespace-pre-line" data-voice-sensitive>
              {message.text}
            </p>
            {message.role === "assistant" && (
              <div className="flex flex-col gap-2">
                <button type="button" className="btn btn-secondary self-start" onClick={() => voice.speak(message.text, { sensitive: true })}>
                  <Volume2 aria-hidden size={22} className="shrink-0" /> {a.listen}
                </button>
                {message.actions && message.actions.length > 0 && (
                  <nav aria-label={a.actionsLabel} className="flex flex-col gap-2">
                    {message.actions.map((action) =>
                      action.kind === "call" ? (
                        <a key={`call-${action.number}`} className="btn btn-primary" href={`tel:${action.number}`}>
                          <Phone aria-hidden size={22} className="shrink-0" /> {actionLabel(action)}
                        </a>
                      ) : (
                        <Link
                          key={action.kind === "open" ? action.path : action.facilityId}
                          className={action.kind === "open" && action.page === "sos" ? "btn btn-sos" : "btn btn-secondary"}
                          href={action.kind === "open" ? action.path : `/map/${action.facilityId}`}
                        >
                          {actionLabel(action)}
                        </Link>
                      ),
                    )}
                  </nav>
                )}
              </div>
            )}
          </article>
        ))}
        {busy && (
          <p role="status" className="notice">
            {a.thinking}
          </p>
        )}
        <div ref={endRef} />
      </div>

      {notice && (
        <p role="alert" className="notice notice-warn">
          {notice}
        </p>
      )}

      <form onSubmit={onSubmit} className="card flex flex-col gap-3">
        <div className="field">
          <label htmlFor="assistant-question">{a.inputLabel}</label>
          <textarea
            id="assistant-question"
            value={draft}
            maxLength={1000}
            rows={2}
            placeholder={a.placeholder}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void ask(draft, null);
              }
            }}
          />
        </div>
        <div className="flex flex-col gap-2">
          {busy ? (
            <button type="button" className="btn btn-secondary" onClick={() => controller.current?.abort()}>
              <Square aria-hidden size={22} className="shrink-0" /> {a.stop}
            </button>
          ) : (
            <button type="submit" className="btn btn-primary" disabled={!draft.trim()}>
              <Send aria-hidden size={22} className="shrink-0" /> {a.send}
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={toggleListening} aria-pressed={listening} disabled={busy}>
            {listening ? <MicOff aria-hidden size={22} className="shrink-0" /> : <Mic aria-hidden size={22} className="shrink-0" />} {listening ? a.stopListening : a.speak}
          </button>
        </div>
        {listening && (
          <p role="status" className="font-bold">
            {a.listening}
          </p>
        )}
        {messages.length > 0 && (
          <button type="button" className="btn btn-secondary self-start" onClick={clear}>
            <Trash2 aria-hidden size={20} className="shrink-0" /> {a.clear}
          </button>
        )}
      </form>

      {messages.length > 0 && quickSection}
    </div>
  );
}
