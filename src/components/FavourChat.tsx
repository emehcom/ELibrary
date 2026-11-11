import { useEffect, useRef, useState, type FormEvent, type PointerEvent } from "react";
import {
  Bot, GripVertical, MessageCircle, Send, Sparkles, Volume2, VolumeX, X,
} from "lucide-react";
import { supabase } from "../lib/supabase";

type ChatMessage = { id: string; role: "assistant" | "user"; content: string };
type FavourChatProps = {
  userId: string | null;
  readerMode?: boolean;
  controlsVisible?: boolean;
};
type ActiveReadingContext = {
  bookId: string; bookTitle: string; bookAuthor: string; currentPage: number; pageText: string;
};

export default function FavourChat({
  userId, readerMode = false, controlsVisible = true,
}: FavourChatProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [notice, setNotice] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [readingContext, setReadingContext] = useState<ActiveReadingContext | null>(null);
  const [launcherPosition, setLauncherPosition] = useState<{ left: number; top: number } | null>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const dragStartRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const draggedRef = useRef(false);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    function handleReadingContext(event: Event) {
      setReadingContext((event as CustomEvent<ActiveReadingContext | null>).detail);
    }
    window.addEventListener("elibrary:reading-context", handleReadingContext);
    return () => window.removeEventListener("elibrary:reading-context", handleReadingContext);
  }, []);

  useEffect(() => {
    if (!userId) { setMessages([]); return; }
    let cancelled = false;
    async function loadMessages() {
      setLoadingMessages(true);
      setNotice("");
      const { data, error } = await supabase.from("favour_messages")
        .select("id, role, content").eq("user_id", userId)
        .order("created_at", { ascending: true }).limit(200);
      if (cancelled) return;
      if (error) {
        console.error("Could not load Favour messages:", error.message);
        setNotice("Couldn't load your saved conversation. Please refresh.");
      } else setMessages((data ?? []) as ChatMessage[]);
      setLoadingMessages(false);
    }
    void loadMessages();
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => () => {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  useEffect(() => {
    if (!readerMode) setLauncherPosition(null);
  }, [readerMode]);

  if (!userId) return null;

  function handleLauncherPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (!readerMode) return;
    const rect = event.currentTarget.getBoundingClientRect();
    dragStartRef.current = {
      x: event.clientX, y: event.clientY,
      left: rect.left, top: rect.top,
    };
    draggedRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleLauncherPointerMove(event: PointerEvent<HTMLButtonElement>) {
    const start = dragStartRef.current;
    if (!readerMode || !start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (!draggedRef.current && Math.hypot(dx, dy) < 7) return;
    draggedRef.current = true;
    const width = launcherRef.current?.offsetWidth ?? 140;
    const height = launcherRef.current?.offsetHeight ?? 54;
    setLauncherPosition({
      left: Math.max(8, Math.min(window.innerWidth - width - 8, start.left + dx)),
      top: Math.max(8, Math.min(window.innerHeight - height - 8, start.top + dy)),
    });
  }

  function handleLauncherPointerUp() {
    if (draggedRef.current) {
      suppressClickRef.current = true;
      window.setTimeout(() => { suppressClickRef.current = false; }, 0);
    }
    dragStartRef.current = null;
  }

  function speak(message: ChatMessage) {
    if (!("speechSynthesis" in window)) {
      setNotice("Speech is not supported by this browser.");
      return;
    }
    if (speakingId === message.id) {
      window.speechSynthesis.cancel();
      setSpeakingId(null);
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message.content);
    utterance.onstart = () => setSpeakingId(message.id);
    utterance.onend = () => setSpeakingId(null);
    utterance.onerror = () => setSpeakingId(null);
    window.speechSynthesis.speak(utterance);
  }

  async function refreshMessages() {
    if (!userId) return;
    const { data, error } = await supabase.from("favour_messages")
      .select("id, role, content").eq("user_id", userId)
      .order("created_at", { ascending: true }).limit(200);
    if (error) {
      console.error("Could not refresh Favour messages:", error.message);
      return;
    }
    setMessages((data ?? []) as ChatMessage[]);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = input.trim();
    if (!content || sending || !userId) return;
    setSending(true); setNotice(""); setInput("");
    try {
      const { data, error } = await supabase.functions.invoke("favour-chat", {
        body: {
          message: content,
          bookId: readingContext?.bookId ?? null,
          bookTitle: readingContext?.bookTitle ?? "",
          bookAuthor: readingContext?.bookAuthor ?? "",
          currentPage: readingContext?.currentPage ?? null,
          pageText: readingContext?.pageText ?? "",
        },
      });
      if (error || !data) {
        console.error("Favour AI request failed:", error ?? data);
        setNotice(data?.error ?? "Favour couldn't reply just now. Please try again later.");
        await refreshMessages(); return;
      }
      if (data.userMessage) setMessages(current => [...current, data.userMessage as ChatMessage]);
      if (data.assistantMessage) {
        setMessages(current => [...current, data.assistantMessage as ChatMessage]);
        setNotice(data.provider ? `Answered using ${data.provider}.` : "");
        return;
      }
      if (typeof data.reply === "string" && data.reply.trim()) {
        setMessages(current => [...current, {
          id: `temporary-${Date.now()}`, role: "assistant", content: data.reply,
        }]);
        setNotice(data.warning ?? "Favour replied, but the response could not be saved to your history.");
        return;
      }
      setNotice(data.error ?? "Favour could not generate a response. Please try again.");
      await refreshMessages();
    } catch (error) {
      console.error("Unexpected Favour chat error:", error);
      setNotice("A connection error occurred. Check your internet connection and try again.");
      await refreshMessages();
    } finally { setSending(false); }
  }

  const launcherStyle = launcherPosition
    ? { left: launcherPosition.left, top: launcherPosition.top, right: "auto", bottom: "auto" }
    : undefined;

  return (
    <div className={`favour-root${readerMode ? " favour-root-reader" : ""}`}>
      {open && (!readerMode || controlsVisible) && (
        <section className="favour-panel" aria-label="Favour assistant chat" aria-live="polite">
          <header className="favour-header">
            <div className="favour-identity">
              <span className="favour-avatar"><Bot size={22} /></span>
              <div>
                <strong>Favour</strong>
                <span className="favour-subtitle">
                  {readingContext ? `Reading: ${readingContext.bookTitle} · Page ${readingContext.currentPage}` : "Your personal study assistant"}
                </span>
              </div>
            </div>
            <button type="button" className="favour-icon-button" onClick={() => setOpen(false)}
              aria-label="Close Favour chat" title="Close chat"><X size={19} /></button>
          </header>
          <div className="favour-messages">
            {loadingMessages && <p className="favour-subtitle">Loading your conversation…</p>}
            {!loadingMessages && messages.length === 0 && (
              <div className="favour-message favour-message-assistant">
                <p>Hello! I'm Favour, your personal learning assistant. Your conversation will be saved here as we learn together.</p>
                <button type="button" className="favour-speak-button" onClick={() => speak({
                  id: "welcome", role: "assistant",
                  content: "Hello! I'm Favour, your personal learning assistant. Your conversation will be saved here as we learn together.",
                })}>
                  {speakingId === "welcome" ? <VolumeX size={17} /> : <Volume2 size={17} />}
                  <span>{speakingId === "welcome" ? "Stop" : "Read aloud"}</span>
                </button>
              </div>
            )}
            {messages.map(message => (
              <div key={message.id} className={`favour-message favour-message-${message.role}`}>
                <p>{message.content}</p>
                {message.role === "assistant" && (
                  <button type="button" className="favour-speak-button" onClick={() => speak(message)}
                    aria-label={speakingId === message.id ? "Stop reading response" : "Read response aloud"}>
                    {speakingId === message.id ? <VolumeX size={17} /> : <Volume2 size={17} />}
                    <span>{speakingId === message.id ? "Stop" : "Read aloud"}</span>
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="favour-notice" role="status">
            {notice || "Your messages are saved privately to your Elibrary account."}
          </div>
          <form className="favour-composer" onSubmit={handleSubmit}>
            <input value={input} onChange={event => { setInput(event.target.value); setNotice(""); }}
              placeholder={sending ? "Favour is thinking..." : "Ask Favour something..."}
              aria-label="Message Favour" maxLength={4000} disabled={sending || loadingMessages} />
            <button type="submit" disabled={!input.trim() || sending || loadingMessages}
              aria-label="Send message" title="Send message"><Send size={18} /></button>
          </form>
          <p className="favour-footer-note"><Sparkles size={13} />Built for your learning journey</p>
        </section>
      )}

      {(!readerMode || (controlsVisible && !open)) && (
        <button
          ref={launcherRef}
          type="button"
          className={`favour-launcher${readerMode ? " favour-launcher-draggable" : ""}`}
          style={launcherStyle}
          onPointerDown={handleLauncherPointerDown}
          onPointerMove={handleLauncherPointerMove}
          onPointerUp={handleLauncherPointerUp}
          onPointerCancel={handleLauncherPointerUp}
          onClick={() => {
            if (suppressClickRef.current) return;
            setOpen(current => !current);
            setNotice("");
          }}
          aria-label={open ? "Close Favour" : "Open Favour"}
          aria-expanded={open}
          title={readerMode ? "Drag to move or tap to chat with Favour" : "Chat with Favour"}
        >
          {readerMode && <GripVertical className="favour-drag-grip" size={15} />}
          {open ? <X size={23} /> : <MessageCircle size={23} />}
          {!open && <span>Favour</span>}
        </button>
      )}
    </div>
  );
}
