import { useState, useEffect, useRef, useCallback } from "react";

const PLANS = {
  free: { name: "Free", zar: "R0", usd: "$0", period: "/mo" },
  pro: { name: "Pro Monthly", zar: "R46", usd: "$2.50", period: "/mo" },
  annual: { name: "Pro Annual", zar: "R33", usd: "$1.80", period: "/mo" },
};

const MODES = {
  writing: {
    label: "Writing", icon: "✏️",
    sugs: ["Help me write an email", "Improve this paragraph", "Write a cover letter", "Summarize this text"],
    sys: "You are SmartBuddy, a professional AI writing assistant. Help users write, edit, and improve text. Be concise and practical. Keep responses under 150 words unless writing a full document.",
  },
  research: {
    label: "Research", icon: "🔍",
    sugs: ["Explain machine learning", "Compare React vs Vue", "What is blockchain?", "Latest AI trends 2026"],
    sys: "You are SmartBuddy, a professional AI research assistant. Help users research topics and understand complex subjects. Be clear, factual, and organized. Keep responses under 150 words.",
  },
  coding: {
    label: "Coding", icon: "💻",
    sugs: ["Debug this code", "Write a Python function", "Explain async/await", "Review my code"],
    sys: "You are SmartBuddy, a professional AI coding assistant. Help users write, debug, and review code. Use code blocks for snippets. Be precise. Keep responses under 150 words unless writing code.",
  },
};

const FREE_SECS = 2 * 60 * 60; // 2 hours
const FREE_FILES = 10;

function formatTime(s) {
  if (s <= 0) return "0m left";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h}h ${m}m left`;
  if (m > 0) return `${m}m ${sec}s left`;
  return `${sec}s left`;
}

function Toast({ msg, type, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2400); return () => clearTimeout(t); }, []);
  const colors = { ok: "#166534", info: "#1e40af", warn: "#92400e", danger: "#991b1b" };
  const bgs = { ok: "#dcfce7", info: "#dbeafe", warn: "#fef3c7", danger: "#fee2e2" };
  return (
    <div style={{ position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)", padding: "6px 16px", borderRadius: 20, fontSize: 12, whiteSpace: "nowrap", zIndex: 99, background: bgs[type] || bgs.info, color: colors[type] || colors.info, border: `0.5px solid ${colors[type] || colors.info}33`, pointerEvents: "none" }}>
      {msg}
    </div>
  );
}

function UsageBar({ label, used, total, color = "var(--fill-accent)" }) {
  const pct = Math.max(0, Math.min(100, Math.round(((total - used) / total) * 100)));
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-secondary)", marginBottom: 3 }}>
        <span>{label}</span>
        <span style={{ fontWeight: 500, color: pct < 20 ? "var(--text-danger)" : "var(--text-primary)" }}>{total - used} / {total} left</span>
      </div>
      <div style={{ height: 4, background: "var(--surface-0)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: pct < 20 ? "var(--fill-danger)" : color, borderRadius: 4, transition: "width 0.5s" }} />
      </div>
    </div>
  );
}

export default function SmartBuddy() {
  const [view, setView] = useState("chat");
  const [mode, setMode] = useState("writing");
  const [plan, setPlan] = useState("free");
  const [messages, setMessages] = useState([]);
  const [convHistory, setConvHistory] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [webSearch, setWebSearch] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [selectedPreset, setSelectedPreset] = useState(0);
  const [chatHistory, setChatHistory] = useState([]);
  const [fileContent, setFileContent] = useState(null);
  const [fileName, setFileName] = useState(null);
  const [fileUploadsUsed, setFileUploadsUsed] = useState(0);
  const [timeUsedSecs, setTimeUsedSecs] = useState(0);
  const [sessionActive, setSessionActive] = useState(false);
  const [toast, setToast] = useState(null);
  const [notifications, setNotifications] = useState([
    { id: 1, type: "info", icon: "🌐", title: "Web search available", desc: "Toggle web search in the chat bar for real-time results. Requires Pro plan.", time: "Just now", read: false },
    { id: 2, type: "ok", icon: "📄", title: "PDF export ready", desc: "Export any chat as a PDF using the Export PDF button in the top bar.", time: "2 min ago", read: false },
    { id: 3, type: "warn", icon: "⏱️", title: "Free plan: 2 hrs/day", desc: "You have 2 hours of AI access per day on the free plan. Upgrade for unlimited.", time: "5 min ago", read: false },
    { id: 4, type: "pro", icon: "👑", title: "Upgrade to Pro", desc: "R46/month unlocks everything: unlimited time, web search, PDF export, and more.", time: "1h ago", read: true },
  ]);
  const [unreadCount, setUnreadCount] = useState(3);
  const msgsRef = useRef(null);
  const inputRef = useRef(null);
  const timerRef = useRef(null);
  const fileRef = useRef(null);

  // Timer for free plan
  useEffect(() => {
    if (sessionActive && plan === "free") {
      timerRef.current = setInterval(() => {
        setTimeUsedSecs(s => {
          if (s >= FREE_SECS) { clearInterval(timerRef.current); setSessionActive(false); showToast("Daily time limit reached — upgrade to Pro for unlimited access", "warn"); return s; }
          return s + 1;
        });
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [sessionActive, plan]);

  useEffect(() => { if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight; }, [messages]);

  function showToast(msg, type = "info") { setToast({ msg, type, id: Date.now() }); }

  function navTo(v) {
    setView(v);
  }

  async function sendMsg() {
    const text = input.trim();
    if (!text && !fileContent) return;
    if (plan === "free" && timeUsedSecs >= FREE_SECS) { showToast("Daily limit reached — upgrade to Pro", "warn"); navTo("plans"); return; }

    let userContent = text;
    let apiContent = text;
    let newFileUsed = fileUploadsUsed;

    if (fileContent) {
      if (plan === "free" && fileUploadsUsed >= FREE_FILES) { showToast("Daily file limit reached (10/day) — upgrade to Pro", "warn"); navTo("plans"); return; }
      const snip = fileContent.slice(0, 3000);
      apiContent = (text ? text + "\n\n" : "") + "File: " + fileName + "\n\n" + snip + (fileContent.length > 3000 ? "\n[truncated]" : "");
      userContent = (text ? text + " · " : "") + "[" + fileName + "]";
      newFileUsed = fileUploadsUsed + 1;
      setFileUploadsUsed(newFileUsed);
      clearFile();
    }

    setInput("");
    setMessages(m => [...m, { role: "user", content: userContent, mode }]);
    const newConv = [...convHistory, { role: "user", content: apiContent }];
    setConvHistory(newConv);
    setLoading(true);
    setSessionActive(true);

    const sys = (customPrompt || MODES[mode].sys) + (webSearch ? " The user has web search enabled — you have real-time web access." : "");
    const body = { model: "claude-sonnet-4-6", max_tokens: 1000, system: sys, messages: newConv };
    if (webSearch) body.tools = [{ type: "web_search_20250305", name: "web_search" }];

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      const reply = data.content?.filter(b => b.type === "text").map(b => b.text).join("") || "Something went wrong.";
      const usedWeb = data.content?.some(b => b.type === "tool_use");
      const fullReply = reply + (usedWeb ? "\n\n[Web search used]" : "");
      setMessages(m => [...m, { role: "assistant", content: fullReply, mode, webUsed: usedWeb }]);
      setConvHistory(c => [...c, { role: "assistant", content: reply }]);
    } catch {
      setMessages(m => [...m, { role: "assistant", content: "Connection error. Please try again.", mode }]);
    }
    setLoading(false);
    inputRef.current?.focus();
  }

  function newChat() {
    setMessages([]); setConvHistory([]); setSessionActive(false);
  }

  function saveChat() {
    const userMsgs = messages.filter(m => m.role === "user");
    if (!userMsgs.length) { showToast("Nothing to save yet", "info"); return; }
    const title = userMsgs[0].content.slice(0, 40);
    setChatHistory(h => [{ id: Date.now(), title, mode, time: new Date().toLocaleString(), messages: [...convHistory] }, ...h].slice(0, 20));
    showToast("Chat saved", "ok");
  }

  function loadChat(entry) {
    newChat();
    setMode(entry.mode);
    setConvHistory(entry.messages);
    setMessages(entry.messages.map(m => ({ role: m.role, content: m.content, mode: entry.mode })));
    navTo("chat");
  }

  function exportPDF() {
    if (plan === "free") { showToast("PDF export requires Pro plan", "info"); navTo("plans"); return; }
    if (!messages.length) { showToast("No chat to export", "info"); return; }
    let txt = "SmartBuddy Chat Export\n" + "=".repeat(30) + "\nDate: " + new Date().toLocaleString() + "\nMode: " + MODES[mode].label + "\n\n";
    messages.forEach(m => { txt += (m.role === "user" ? "You" : "SmartBuddy") + ": " + m.content + "\n\n"; });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([txt], { type: "text/plain" }));
    a.download = "smartbuddy-" + Date.now() + ".txt";
    a.click();
    showToast("Chat exported", "ok");
  }

  function toggleWeb() {
    if (plan === "free") { showToast("Web search requires Pro plan", "info"); navTo("plans"); return; }
    setWebSearch(w => !w);
    showToast(webSearch ? "Web search off" : "Web search on", webSearch ? "info" : "ok");
  }

  function handleFile(e) {
    const file = e.target.files[0]; if (!file) return;
    if (plan === "free" && fileUploadsUsed >= FREE_FILES) { showToast("Daily file limit reached (10/day) — upgrade to Pro", "warn"); return; }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = ev => setFileContent(ev.target.result);
    reader.readAsText(file);
    e.target.value = "";
  }

  function clearFile() { setFileContent(null); setFileName(null); }

  function selectPlan(p) {
    if (p === plan) return;
    setPlan(p);
    setWebSearch(false);
    const n = PLANS[p].name;
    showToast("Switched to " + n + " plan", "ok");
    setNotifications(ns => [{ id: Date.now(), type: "ok", icon: "✅", title: "Plan activated: " + n, desc: "All " + (p === "free" ? "free" : "Pro") + " features are now active.", time: "Just now", read: false }, ...ns]);
    setUnreadCount(c => c + 1);
  }

  function markAllRead() { setNotifications(ns => ns.map(n => ({ ...n, read: true }))); setUnreadCount(0); }
  function readNotif(id) { setNotifications(ns => ns.map(n => n.id === id ? { ...n, read: true } : n)); setUnreadCount(c => Math.max(0, c - 1)); }

  function applyPreset(idx, prompt) { setSelectedPreset(idx); setCustomPrompt(prompt); showToast("Prompt applied", "ok"); }

  const presets = [
    ["Default — balanced assistant", ""],
    ["Ultra-concise answers", "Be extremely concise. Answer in 1-3 sentences maximum. No fluff."],
    ["Senior engineer", "You are a senior software engineer. Always show code examples. Use best practices and explain your choices."],
    ["Professional editor", "You are a professional editor. Focus on clarity, grammar, and tone. Give specific suggestions."],
    ["Step-by-step thinker", "Think step by step. Break down every problem into clear numbered steps before answering."],
  ];

  const timeLeft = FREE_SECS - timeUsedSecs;
  const timePct = Math.round(((FREE_SECS - timeUsedSecs) / FREE_SECS) * 100);
  const isFree = plan === "free";

  const S = {
    root: { display: "flex", height: 660, background: "var(--surface-0)", border: "0.5px solid var(--border)", borderRadius: 12, overflow: "hidden", fontFamily: "var(--font-sans)", position: "relative" },
    side: { width: 210, background: "var(--surface-1)", borderRight: "0.5px solid var(--border)", display: "flex", flexDirection: "column", flexShrink: 0 },
    logo: { display: "flex", alignItems: "center", gap: 8, padding: "13px 13px 11px", borderBottom: "0.5px solid var(--border)" },
    logoIcon: { width: 30, height: 30, background: "var(--fill-accent)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--on-accent)", fontSize: 15, flexShrink: 0 },
    nav: { padding: "8px 5px", flex: 1, overflowY: "auto" },
    nl: { fontSize: 10, color: "var(--text-muted)", padding: "7px 8px 3px", letterSpacing: ".06em", textTransform: "uppercase" },
    ni: (active) => ({ display: "flex", alignItems: "center", gap: 7, padding: "6px 8px", borderRadius: 6, cursor: "pointer", color: active ? "var(--text-accent)" : "var(--text-secondary)", background: active ? "var(--bg-accent)" : "transparent", fontSize: 12, marginBottom: 1 }),
    main: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 },
    topbar: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 14px", borderBottom: "0.5px solid var(--border)", background: "var(--surface-2)", gap: 8, flexShrink: 0 },
    tab: (active) => ({ display: "flex", alignItems: "center", gap: 4, padding: "4px 9px", borderRadius: 5, fontSize: 11, cursor: "pointer", color: active ? "var(--text-primary)" : "var(--text-secondary)", background: active ? "var(--surface-2)" : "transparent" }),
    bsm: { display: "flex", alignItems: "center", gap: 3, padding: "4px 8px", borderRadius: 6, border: "0.5px solid var(--border-strong)", background: "var(--surface-2)", fontSize: 11, color: "var(--text-secondary)", cursor: "pointer", whiteSpace: "nowrap" },
    msgs: { flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 12 },
    bubble: (isUser) => ({ padding: "8px 12px", fontSize: 12, lineHeight: 1.6, background: isUser ? "var(--fill-accent)" : "var(--surface-2)", color: isUser ? "var(--on-accent)" : "var(--text-primary)", border: isUser ? "none" : "0.5px solid var(--border)", borderRadius: isUser ? "10px 2px 10px 10px" : "2px 10px 10px 10px", maxWidth: "85%", alignSelf: isUser ? "flex-end" : "flex-start", wordBreak: "break-word" }),
    planCard: (featured, current) => ({ border: featured ? "2px solid var(--border-accent)" : "0.5px solid var(--border)", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 8, background: "var(--surface-2)", opacity: current ? 1 : 1 }),
  };

  function MsgBubble({ msg }) {
    const isUser = msg.role === "user";
    const parts = msg.content.split(/(```[\s\S]*?```)/g);
    return (
      <div style={S.bubble(isUser)}>
        {!isUser && <div style={{ fontSize: 10, marginBottom: 4, display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 7px", borderRadius: 20, background: msg.mode === "coding" ? "var(--bg-pro)" : msg.mode === "research" ? "var(--bg-success)" : "var(--bg-accent)", color: msg.mode === "coding" ? "var(--text-pro)" : msg.mode === "research" ? "var(--text-success)" : "var(--text-accent)", fontWeight: 500 }}>{MODES[msg.mode]?.label}</div>}
        {parts.map((p, i) => {
          if (p.startsWith("```")) {
            const code = p.replace(/```\w*\n?/, "").replace(/```$/, "").trim();
            return <pre key={i} style={{ background: "var(--surface-0)", border: "0.5px solid var(--border)", borderRadius: 5, padding: "7px 9px", marginTop: 7, fontSize: 11, fontFamily: "var(--font-mono)", overflowX: "auto", color: "var(--text-primary)" }}>{code}</pre>;
          }
          if (p === "[Web search used]") return <div key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 6, fontSize: 10, padding: "2px 7px", borderRadius: 20, background: "var(--bg-warning)", color: "var(--text-warning)" }}>🌐 Web search used</div>;
          return <span key={i} style={{ whiteSpace: "pre-wrap" }}>{p}</span>;
        })}
      </div>
    );
  }

  return (
    <div style={S.root}>
      {/* SIDEBAR */}
      <div style={S.side}>
        <div style={S.logo}>
          <div style={S.logoIcon}>🧠</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>SmartBuddy</div>
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>AI Assistant</div>
          </div>
          <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 10, fontWeight: 500, background: isFree ? "var(--surface-0)" : "var(--bg-accent)", color: isFree ? "var(--text-muted)" : "var(--text-accent)", border: isFree ? "0.5px solid var(--border)" : "none", flexShrink: 0 }}>{PLANS[plan].name.split(" ")[0]}</span>
        </div>

        {isFree && (
          <div style={{ padding: "10px 10px 6px", borderBottom: "0.5px solid var(--border)" }}>
            <UsageBar label="Daily time" used={timeUsedSecs} total={FREE_SECS} />
            <div style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "right", marginTop: -2, marginBottom: 6 }}>{formatTime(timeLeft)}</div>
            <UsageBar label="File uploads" used={fileUploadsUsed} total={FREE_FILES} color="var(--fill-success)" />
          </div>
        )}

        <div style={S.nav}>
          <div style={S.nl}>Workspace</div>
          {[["chat", "💬", "Chat"], ["history", "🕐", "History", chatHistory.length], ["notifs", "🔔", "Notifications", unreadCount]].map(([v, ic, label, badge]) => (
            <div key={v} style={S.ni(view === v)} onClick={() => navTo(v)}>
              <span>{ic}</span>
              <span style={{ flex: 1 }}>{label}</span>
              {badge > 0 && <span style={{ fontSize: 9, background: v === "notifs" ? "var(--bg-danger)" : "var(--bg-success)", color: v === "notifs" ? "var(--text-danger)" : "var(--text-success)", padding: "1px 5px", borderRadius: 10 }}>{badge}</span>}
            </div>
          ))}
          <div style={S.nl}>Settings</div>
          {[["prompt", "⚙️", "Prompt editor"], ["plans", "👑", "Subscription"]].map(([v, ic, label]) => (
            <div key={v} style={S.ni(view === v)} onClick={() => navTo(v)}><span>{ic}</span><span>{label}</span></div>
          ))}
        </div>

        <div style={{ padding: "9px 13px", borderTop: "0.5px solid var(--border)", display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--fill-success)", flexShrink: 0 }} />
          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>AI online · {PLANS[plan].name}</span>
        </div>
      </div>

      {/* MAIN */}
      <div style={S.main}>
        {/* TOPBAR */}
        <div style={S.topbar}>
          <div style={{ display: "flex", gap: 2, background: "var(--surface-1)", border: "0.5px solid var(--border)", borderRadius: 6, padding: 2 }}>
            {Object.entries(MODES).map(([k, v]) => (
              <div key={k} style={S.tab(mode === k)} onClick={() => setMode(k)}>{v.icon} {v.label}</div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
            <div style={S.bsm} onClick={newChat}>＋ New</div>
            <div style={S.bsm} onClick={saveChat}>🔖 Save</div>
            <div style={{ ...S.bsm, color: isFree ? "var(--text-muted)" : "var(--text-secondary)" }} onClick={exportPDF}>⬇ Export PDF</div>
            <div style={{ ...S.bsm, position: "relative" }} onClick={() => navTo("notifs")}>
              🔔
              {unreadCount > 0 && <span style={{ position: "absolute", top: 2, right: 2, width: 6, height: 6, borderRadius: "50%", background: "var(--fill-danger)", border: "1.5px solid var(--surface-2)" }} />}
            </div>
          </div>
        </div>

        {/* CHAT VIEW */}
        {view === "chat" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div ref={msgsRef} style={S.msgs}>
              {messages.length === 0 && (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 20 }}>
                  <div style={{ fontSize: 32 }}>🧠</div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>SmartBuddy is ready</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", textAlign: "center" }}>Choose a suggestion or type anything below</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center", maxWidth: 400 }}>
                    {MODES[mode].sugs.map(s => (
                      <div key={s} onClick={() => { setInput(s); inputRef.current?.focus(); }} style={{ padding: "5px 10px", borderRadius: 20, border: "0.5px solid var(--border-accent)", background: "var(--bg-accent)", color: "var(--text-accent)", fontSize: 11, cursor: "pointer" }}>{s}</div>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((m, i) => <MsgBubble key={i} msg={m} />)}
              {loading && (
                <div style={{ display: "flex", gap: 5, alignItems: "center", padding: "8px 12px", background: "var(--surface-2)", border: "0.5px solid var(--border)", borderRadius: "2px 10px 10px 10px", alignSelf: "flex-start" }}>
                  {[0, 200, 400].map(d => <div key={d} style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--text-muted)", animation: `pulse 1.2s ${d}ms ease-in-out infinite` }} />)}
                </div>
              )}
            </div>

            {/* INPUT */}
            <div style={{ padding: "9px 14px", borderTop: "0.5px solid var(--border)", background: "var(--surface-2)", flexShrink: 0 }}>
              {fileName && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 9px", background: "var(--bg-success)", border: "0.5px solid var(--border-success)", borderRadius: 6, fontSize: 11, color: "var(--text-success)", marginBottom: 6 }}>
                  📎 {fileName}
                  <span onClick={clearFile} style={{ marginLeft: "auto", cursor: "pointer", opacity: 0.7 }}>✕</span>
                </div>
              )}
              <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMsg(); } }}
                  placeholder={mode === "coding" ? "Ask about code..." : mode === "research" ? "Research a topic..." : "Ask SmartBuddy anything..."}
                  style={{ flex: 1, resize: "none", padding: "7px 10px", borderRadius: 6, border: "0.5px solid var(--border-strong)", background: "var(--surface-2)", fontSize: 12, color: "var(--text-primary)", fontFamily: "var(--font-sans)", lineHeight: 1.5, height: 34, outline: "none" }}
                />
                <input type="file" ref={fileRef} style={{ display: "none" }} accept=".txt,.md,.js,.py,.html,.css,.json,.csv" onChange={handleFile} />
                <div onClick={() => fileRef.current?.click()} title={isFree ? `${FREE_FILES - fileUploadsUsed} uploads left today` : "Upload file"} style={{ width: 30, height: 30, borderRadius: 6, border: "0.5px solid var(--border-strong)", background: "var(--surface-2)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 14 }}>📎</div>
                <div onClick={toggleWeb} title={isFree ? "Requires Pro plan" : webSearch ? "Web search on" : "Web search off"} style={{ width: 30, height: 30, borderRadius: 6, border: webSearch ? "0.5px solid var(--border-warning)" : "0.5px solid var(--border-strong)", background: webSearch ? "var(--bg-warning)" : "var(--surface-2)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 14 }}>🌐</div>
                <button onClick={sendMsg} disabled={loading || (!input.trim() && !fileContent)} style={{ width: 30, height: 30, borderRadius: 6, background: "var(--fill-accent)", color: "var(--on-accent)", border: "none", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", opacity: loading ? 0.5 : 1 }}>➤</button>
              </div>
              {isFree && <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 5, display: "flex", justifyContent: "space-between" }}><span>⏱ {formatTime(timeLeft)} remaining today</span><span>📎 {FREE_FILES - fileUploadsUsed}/{FREE_FILES} uploads</span></div>}
            </div>
          </div>
        )}

        {/* HISTORY VIEW */}
        {view === "history" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", borderBottom: "0.5px solid var(--border)", flexShrink: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>Chat history</span>
              <div style={{ ...S.bsm, color: "var(--text-danger)" }} onClick={() => setChatHistory([])}>🗑 Clear all</div>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 10 }}>
              {chatHistory.length === 0 ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 8, color: "var(--text-muted)" }}>
                  <div style={{ fontSize: 28 }}>🕐</div>
                  <div style={{ fontSize: 12 }}>No saved chats yet</div>
                </div>
              ) : chatHistory.map(h => (
                <div key={h.id} onClick={() => loadChat(h)} style={{ padding: "8px 10px", borderRadius: 6, border: "0.5px solid var(--border)", background: "var(--surface-2)", marginBottom: 6, cursor: "pointer" }}>
                  <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.title}</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{MODES[h.mode]?.label} · {h.time}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* NOTIFICATIONS VIEW */}
        {view === "notifs" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", borderBottom: "0.5px solid var(--border)", flexShrink: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>Notifications</span>
              <div style={S.bsm} onClick={markAllRead}>✓ Mark all read</div>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 10 }}>
              {notifications.map(n => (
                <div key={n.id} onClick={() => readNotif(n.id)} style={{ display: "flex", gap: 9, padding: "9px 10px", borderRadius: 6, border: n.read ? "0.5px solid var(--border)" : "0.5px solid var(--border-accent)", background: n.read ? "var(--surface-2)" : "var(--bg-accent)", marginBottom: 6, cursor: "default" }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, background: "var(--surface-1)", flexShrink: 0 }}>{n.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 500, color: n.read ? "var(--text-primary)" : "var(--text-accent)" }}>{n.title}</div>
                    <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 1, lineHeight: 1.4 }}>{n.desc}</div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{n.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PLANS VIEW */}
        {view === "plans" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", borderBottom: "0.5px solid var(--border)", flexShrink: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>Subscription plans</span>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Current: {PLANS[plan].name}</span>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 10, alignContent: "start" }}>
              {[
                { id: "free", name: "Free", usd: "$0", zar: "R0/month", billing: "No card needed", desc: "Try SmartBuddy with daily limits.", feats: ["2 hours AI access per day", "10 file uploads per day", "Writing, research and coding modes"], locked: ["Web search", "PDF export", "Chat history", "Custom prompt editor"], btn: "Free plan", primary: false },
                { id: "pro", name: "Pro Monthly", usd: "$2.50", zar: "≈ R46/month", billing: "Billed monthly", desc: "Unlimited access to all features.", feats: ["Unlimited AI access", "Unlimited file uploads", "All 3 AI modes", "Web search (real-time)", "PDF export", "Full chat history", "Custom prompt editor", "Notifications"], locked: [], btn: "Get Pro — R46/mo", primary: true, featured: true },
                { id: "annual", name: "Pro Annual", usd: "$1.80", zar: "≈ R33/month", billing: "Billed R396/year · save 28%", desc: "All Pro features at a lower rate.", feats: ["Everything in Pro Monthly", "Unlimited AI access", "All features unlocked", "Priority support", "Early access to new features", "28% saving vs monthly"], locked: [], btn: "Get Annual — R396/yr", primary: false },
              ].map(p => (
                <div key={p.id} style={S.planCard(p.featured, p.id === plan)}>
                  {p.featured && <span style={{ fontSize: 9, background: "var(--bg-accent)", color: "var(--text-accent)", padding: "2px 8px", borderRadius: 10, fontWeight: 500, display: "inline-block", marginBottom: 4, width: "fit-content" }}>Most popular</span>}
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)" }}>{p.name}</div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 3, margin: "3px 0 1px" }}>
                      <span style={{ fontSize: 20, fontWeight: 500, color: "var(--text-primary)" }}>{p.usd}</span>
                      <span style={{ fontSize: 10, color: "var(--text-muted)" }}>/mo</span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 2 }}>{p.zar}</div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>{p.billing}</div>
                    <div style={{ fontSize: 10, color: "var(--text-secondary)", lineHeight: 1.4 }}>{p.desc}</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
                    {p.feats.map(f => <div key={f} style={{ display: "flex", alignItems: "flex-start", gap: 5, fontSize: 10, color: "var(--text-secondary)", lineHeight: 1.4 }}><span style={{ color: "var(--fill-success)", flexShrink: 0 }}>✓</span>{f}</div>)}
                    {p.locked.map(f => <div key={f} style={{ display: "flex", alignItems: "flex-start", gap: 5, fontSize: 10, color: "var(--text-muted)", lineHeight: 1.4 }}><span style={{ flexShrink: 0 }}>✕</span>{f}</div>)}
                  </div>
                  <button onClick={() => selectPlan(p.id)} style={{ width: "100%", padding: 7, borderRadius: 6, fontSize: 11, cursor: p.id === plan ? "default" : "pointer", fontFamily: "var(--font-sans)", border: p.id === plan ? "0.5px solid var(--border)" : p.primary ? "none" : "0.5px solid var(--border-strong)", background: p.id === plan ? "var(--surface-0)" : p.primary ? "var(--fill-accent)" : "var(--surface-1)", color: p.id === plan ? "var(--text-muted)" : p.primary ? "var(--on-accent)" : "var(--text-primary)", marginTop: 4 }}>
                    {p.id === plan ? "Current plan" : p.btn}
                  </button>
                </div>
              ))}
            </div>
            <div style={{ textAlign: "center", fontSize: 11, color: "var(--text-muted)", padding: "10px 0 12px" }}>One subscription = full access. <span style={{ color: "var(--text-accent)", fontWeight: 500 }}>No feature tiers. No upsells.</span> Cancel anytime.</div>
          </div>
        )}

        {/* PROMPT EDITOR VIEW */}
        {view === "prompt" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", borderBottom: "0.5px solid var(--border)", flexShrink: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>Prompt editor</span>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Customize AI behavior</span>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: ".05em" }}>Presets</div>
              {presets.map(([label, prompt], i) => (
                <div key={i} onClick={() => applyPreset(i, prompt)} style={{ padding: "7px 10px", borderRadius: 6, border: selectedPreset === i ? "0.5px solid var(--border-accent)" : "0.5px solid var(--border)", background: selectedPreset === i ? "var(--bg-accent)" : "var(--surface-2)", color: selectedPreset === i ? "var(--text-accent)" : "var(--text-secondary)", fontSize: 11, cursor: "pointer", marginBottom: 5 }}>{label}</div>
              ))}
              <div style={{ fontSize: 10, color: "var(--text-muted)", margin: "14px 0 6px", textTransform: "uppercase", letterSpacing: ".05em" }}>Custom prompt</div>
              <textarea value={customPrompt} onChange={e => setCustomPrompt(e.target.value)} placeholder="Write a custom system prompt..." style={{ width: "100%", resize: "vertical", padding: "8px 10px", borderRadius: 6, border: "0.5px solid var(--border-strong)", background: "var(--surface-2)", fontSize: 11, color: "var(--text-primary)", fontFamily: "var(--font-sans)", lineHeight: 1.5, minHeight: 90, outline: "none" }} />
              <button onClick={() => { setSelectedPreset(-1); showToast("Prompt applied", "ok"); }} style={{ width: "100%", padding: 8, borderRadius: 6, background: "var(--fill-accent)", color: "var(--on-accent)", border: "none", fontSize: 12, cursor: "pointer", fontFamily: "var(--font-sans)", marginTop: 8 }}>Apply prompt</button>
            </div>
          </div>
        )}
      </div>

      {toast && <Toast key={toast.id} msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}

      <style>{`@keyframes pulse{0%,80%,100%{opacity:.3;transform:scale(.8)}40%{opacity:1;transform:scale(1)}}`}</style>
    </div>
  );
}
