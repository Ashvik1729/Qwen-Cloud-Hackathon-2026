"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type EchoSession = {
  id: string;
  label: string;
  summary: string;
  simulatedDay: number;
  createdAt: string;
};

type EchoMemory = {
  id: string;
  content: string;
  kind: string;
  createdDay: number;
  lastAccessedDay: number;
  accessCount: number;
  importanceScore: number;
  decayScore: number;
  consolidatedFrom: string[];
  sourceSessionId: string;
  status: string;
};

type EchoMessage = {
  id: string;
  sessionId: string;
  role: string;
  content: string;
  simulatedDay: number;
  retrievedMemoryIds: string[];
};

type EchoEvent = {
  id: string;
  type: string;
  description: string;
  memoryIds: string[];
  simulatedDay: number;
};

type EchoState = {
  currentDay: number;
  sessions: EchoSession[];
  memories: EchoMemory[];
  messages: EchoMessage[];
  events: EchoEvent[];
  tokenBudget: number;
  qwenConfigured: boolean;
};

type BenchmarkResult = {
  precision: string;
  correct: number;
  total: number;
  avgContextTokens: number;
  tokenBudget: number;
  cases: Array<{
    query: string;
    expected: string;
    correct: boolean;
    contextTokens: number;
    retrievedMemoryIds: string[];
  }>;
};

const KIND_COLORS: Record<string, string> = {
  client: "#2dd4bf",
  deadline: "#fb923c",
  preference: "#a78bfa",
  decision: "#60a5fa",
  summary: "#facc15",
  small_talk: "#94a3b8",
  fact: "#38bdf8",
};

function statusLabel(memory: EchoMemory) {
  if (memory.status === "dropped") return "forgotten";
  if (memory.status === "consolidated") return "merged";
  return "active";
}

function memoryOpacity(memory: EchoMemory, highlighted: boolean) {
  if (highlighted) return 1;
  if (memory.status === "dropped") return 0.2;
  if (memory.status === "consolidated") return 0.36;
  return Math.max(0.28, memory.decayScore);
}

function MemoryBrain({ memories, highlightedIds }: { memories: EchoMemory[]; highlightedIds: string[] }) {
  const positions = useMemo(() => {
    const activeCount = Math.max(memories.length, 1);
    return new Map(
      memories.map((memory, index) => {
        const angle = (Math.PI * 2 * index) / activeCount - Math.PI / 2;
        const ring = memory.kind === "summary" ? 68 : 128 + (index % 3) * 30;
        return [
          memory.id,
          {
            x: 260 + Math.cos(angle) * ring,
            y: 205 + Math.sin(angle) * ring,
          },
        ];
      }),
    );
  }, [memories]);

  const highlighted = new Set(highlightedIds);
  const links = memories.flatMap((memory) =>
    memory.consolidatedFrom.map((sourceId) => ({ sourceId, targetId: memory.id })),
  );

  return (
    <div className="rounded-[2rem] border border-white/10 bg-slate-950/80 p-5 shadow-2xl shadow-cyan-950/30">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">Memory Brain</p>
          <h2 className="mt-1 text-2xl font-semibold text-white">Visible memory lifecycle</h2>
        </div>
        <div className="rounded-full border border-cyan-300/30 px-3 py-1 text-xs text-cyan-100">
          nodes brighten on recall
        </div>
      </div>

      <svg viewBox="0 0 520 410" className="mt-4 h-[360px] w-full rounded-3xl bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.18),rgba(15,23,42,0.3)_42%,rgba(2,6,23,0.95))]">
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="4" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle cx="260" cy="205" r="58" fill="rgba(34,211,238,0.08)" stroke="rgba(125,211,252,0.3)" strokeDasharray="5 7" />
        <circle cx="260" cy="205" r="150" fill="none" stroke="rgba(148,163,184,0.15)" strokeDasharray="3 10" />
        <circle cx="260" cy="205" r="205" fill="none" stroke="rgba(148,163,184,0.08)" strokeDasharray="2 12" />

        {links.map((link) => {
          const source = positions.get(link.sourceId);
          const target = positions.get(link.targetId);
          if (!source || !target) return null;
          return (
            <line
              key={`${link.sourceId}-${link.targetId}`}
              x1={source.x}
              y1={source.y}
              x2={target.x}
              y2={target.y}
              stroke="rgba(250,204,21,0.45)"
              strokeWidth="2"
              strokeDasharray="6 6"
            />
          );
        })}

        {memories.map((memory) => {
          const position = positions.get(memory.id) ?? { x: 260, y: 205 };
          const isHighlighted = highlighted.has(memory.id);
          const radius = memory.kind === "summary" ? 17 : 9 + memory.importanceScore * 9;
          const color = KIND_COLORS[memory.kind] ?? KIND_COLORS.fact;
          return (
            <g key={memory.id} filter={isHighlighted ? "url(#glow)" : undefined}>
              {isHighlighted ? <circle cx={position.x} cy={position.y} r={radius + 12} fill={color} opacity="0.18" /> : null}
              <circle
                cx={position.x}
                cy={position.y}
                r={radius}
                fill={color}
                opacity={memoryOpacity(memory, isHighlighted)}
                stroke={isHighlighted ? "#ffffff" : "rgba(255,255,255,0.38)"}
                strokeWidth={isHighlighted ? 3 : 1.2}
              />
              <text x={position.x} y={position.y + radius + 14} textAnchor="middle" className="fill-slate-200 text-[9px]">
                {memory.kind.replace("_", " ")}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-300 sm:grid-cols-4">
        {Object.entries(KIND_COLORS).map(([kind, color]) => (
          <div key={kind} className="flex items-center gap-2 rounded-2xl bg-white/5 px-3 py-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
            {kind.replace("_", " ")}
          </div>
        ))}
      </div>
    </div>
  );
}

function MemoryList({ memories, highlightedIds }: { memories: EchoMemory[]; highlightedIds: string[] }) {
  const highlighted = new Set(highlightedIds);
  return (
    <div className="max-h-[470px] space-y-3 overflow-auto pr-1">
      {memories.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white/70 p-6 text-sm text-slate-500">
          No memories yet. Load the demo or tell EchoDesk a preference, client detail, decision, or deadline.
        </div>
      ) : null}
      {memories.map((memory) => {
        const isHighlighted = highlighted.has(memory.id);
        const color = KIND_COLORS[memory.kind] ?? KIND_COLORS.fact;
        return (
          <article
            key={memory.id}
            className={`rounded-3xl border p-4 transition ${
              isHighlighted ? "border-cyan-300 bg-cyan-50 shadow-lg shadow-cyan-200/40" : "border-slate-200 bg-white/85"
            } ${memory.status === "dropped" ? "opacity-55 grayscale" : ""}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
                {memory.kind.replace("_", " ")}
              </div>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">
                {statusLabel(memory)}
              </span>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-800">{memory.content}</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-slate-500">
              <span>importance {memory.importanceScore.toFixed(2)}</span>
              <span>decay {memory.decayScore.toFixed(2)}</span>
              <span>accesses {memory.accessCount}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-indigo-500"
                style={{ width: `${Math.max(4, Math.round(memory.decayScore * 100))}%` }}
              />
            </div>
            {memory.consolidatedFrom.length > 0 ? (
              <p className="mt-2 text-[11px] text-amber-700">Consolidated from {memory.consolidatedFrom.length} source memories.</p>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

function BenchmarkPanel({ benchmark }: { benchmark: BenchmarkResult | null }) {
  return (
    <section className="rounded-[2rem] border border-emerald-200 bg-emerald-50/80 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Quantitative proof</p>
          <h2 className="mt-1 text-xl font-semibold text-emerald-950">Recall under limited context</h2>
        </div>
        <div className="rounded-2xl bg-white px-4 py-2 text-right shadow-sm">
          <p className="text-[11px] uppercase tracking-[0.14em] text-emerald-700">precision</p>
          <p className="text-2xl font-bold text-emerald-950">{benchmark?.precision ?? "—"}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-2xl bg-white p-3 shadow-sm">
          <p className="text-slate-500">Avg context used</p>
          <p className="text-lg font-semibold text-slate-950">
            {benchmark ? `${benchmark.avgContextTokens}/${benchmark.tokenBudget}` : "Run benchmark"}
          </p>
        </div>
        <div className="rounded-2xl bg-white p-3 shadow-sm">
          <p className="text-slate-500">Budget cap</p>
          <p className="text-lg font-semibold text-slate-950">2K tokens</p>
        </div>
      </div>
      {benchmark ? (
        <div className="mt-4 space-y-2">
          {benchmark.cases.map((item) => (
            <div key={item.query} className="rounded-2xl bg-white p-3 text-sm shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium text-slate-900">{item.query}</p>
                <span className={`rounded-full px-2 py-1 text-xs font-semibold ${item.correct ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                  {item.correct ? "correct" : "miss"}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">Expected: {item.expected}</p>
              <p className="mt-1 text-xs text-slate-400">Context: {item.contextTokens} tokens</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-emerald-900/70">
          The benchmark scores four fixed queries, including one that should not retrieve stale small talk after decay.
        </p>
      )}
    </section>
  );
}

export default function EchoDeskApp() {
  const [state, setState] = useState<EchoState | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState("session-1");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [benchmark, setBenchmark] = useState<BenchmarkResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const highlightedIds = useMemo(() => {
    const assistantMessages = state?.messages.filter((message) => message.role === "assistant") ?? [];
    return assistantMessages.at(-1)?.retrievedMemoryIds ?? [];
  }, [state?.messages]);

  const stats = useMemo(() => {
    const memories = state?.memories ?? [];
    const active = memories.filter((memory) => memory.status === "active");
    const avgDecay = active.length ? active.reduce((sum, memory) => sum + memory.decayScore, 0) / active.length : 0;
    return {
      active: active.length,
      dropped: memories.filter((memory) => memory.status === "dropped").length,
      consolidated: memories.filter((memory) => memory.status === "consolidated").length,
      avgDecay,
    };
  }, [state?.memories]);

  async function loadState(sessionId = selectedSessionId) {
    setError(null);
    const response = await fetch(`/api/memory/state?sessionId=${encodeURIComponent(sessionId)}`);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error ?? "Unable to load state");
    }
    setState(payload as EchoState);
  }

  useEffect(() => {
    loadState().catch((caught) => setError(caught instanceof Error ? caught.message : "Unable to load EchoDesk"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state?.messages.length]);

  async function runAction(action: "seed" | "recall" | "fastForward" | "reset" | "newSession") {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/memory/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, sessionId: selectedSessionId, days: 14 }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Action failed");
      }
      if (action === "reset" || action === "seed") {
        setBenchmark(null);
      }
      setSelectedSessionId(payload.selectedSessionId);
      setState(payload.state as EchoState);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Action failed");
    } finally {
      setLoading(false);
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = input.trim();
    if (!message) return;
    setLoading(true);
    setError(null);
    setInput("");
    try {
      const response = await fetch("/api/memory/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: selectedSessionId, message }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Chat failed");
      }
      setState(payload.state as EchoState);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Chat failed");
    } finally {
      setLoading(false);
    }
  }

  async function switchSession(sessionId: string) {
    setSelectedSessionId(sessionId);
    setLoading(true);
    setError(null);
    try {
      await loadState(sessionId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to switch session");
    } finally {
      setLoading(false);
    }
  }

  async function runBenchmarkAction() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/memory/benchmark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: selectedSessionId }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Benchmark failed");
      }
      setBenchmark(payload.benchmark as BenchmarkResult);
      setState(payload.state as EchoState);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Benchmark failed");
    } finally {
      setLoading(false);
    }
  }

  const currentSession = state?.sessions.find((session) => session.id === selectedSessionId);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#dffcff,transparent_34%),linear-gradient(135deg,#f8fafc,#eef2ff_45%,#ecfeff)] px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px]">
        <header className="overflow-hidden rounded-[2.25rem] border border-white/70 bg-white/75 p-6 shadow-xl shadow-slate-200/70 backdrop-blur md:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-4xl">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white">EchoDesk</span>
                <span className="rounded-full bg-cyan-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-800">Track: MemoryAgent</span>
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-800">2K memory budget</span>
              </div>
              <h1 className="mt-5 text-[clamp(2.6rem,7vw,6.6rem)] font-black leading-[0.86] tracking-[-0.08em] text-slate-950">
                Chief-of-Staff memory that visibly remembers and forgets.
              </h1>
              <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-600">
                A persistent-memory agent demo for solo founders: memories are chunked, scored, embedded, retrieved by relevance + recency + importance + decay, then faded or consolidated over simulated time.
              </p>
            </div>
            <div className="grid min-w-[280px] grid-cols-2 gap-3 text-sm">
              <div className="rounded-3xl bg-slate-950 p-4 text-white">
                <p className="text-slate-400">Simulated day</p>
                <p className="mt-2 text-4xl font-bold">{state?.currentDay ?? "—"}</p>
              </div>
              <div className="rounded-3xl bg-cyan-500 p-4 text-cyan-950">
                <p className="font-medium opacity-75">Qwen adapter</p>
                <p className="mt-2 text-lg font-bold">{state?.qwenConfigured ? "configured" : "fallback"}</p>
              </div>
            </div>
          </div>
        </header>

        {error ? <div className="mt-4 rounded-3xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div> : null}

        <section className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <button disabled={loading} onClick={() => runAction("seed")} className="rounded-3xl bg-slate-950 px-4 py-4 text-left text-sm font-semibold text-white shadow-lg shadow-slate-300 transition hover:-translate-y-0.5 disabled:opacity-60">
            1. Load Session 1 facts
            <span className="block text-xs font-normal text-slate-300">business facts + low-value noise</span>
          </button>
          <button disabled={loading} onClick={() => runAction("recall")} className="rounded-3xl bg-cyan-500 px-4 py-4 text-left text-sm font-semibold text-cyan-950 shadow-lg shadow-cyan-200 transition hover:-translate-y-0.5 disabled:opacity-60">
            2. Ask days-later recall
            <span className="block text-xs font-normal text-cyan-950/70">switches to Session 2</span>
          </button>
          <button disabled={loading} onClick={() => runAction("fastForward")} className="rounded-3xl bg-amber-400 px-4 py-4 text-left text-sm font-semibold text-amber-950 shadow-lg shadow-amber-200 transition hover:-translate-y-0.5 disabled:opacity-60">
            3. Fast-forward + sleep
            <span className="block text-xs font-normal text-amber-950/70">decay, drop, consolidate</span>
          </button>
          <button disabled={loading} onClick={runBenchmarkAction} className="rounded-3xl bg-emerald-500 px-4 py-4 text-left text-sm font-semibold text-emerald-950 shadow-lg shadow-emerald-200 transition hover:-translate-y-0.5 disabled:opacity-60">
            4. Run recall benchmark
            <span className="block text-xs font-normal text-emerald-950/70">precision + avg context</span>
          </button>
        </section>

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(520px,1.05fr)]">
          <section className="rounded-[2rem] border border-white/70 bg-white/80 p-5 shadow-xl shadow-slate-200/70 backdrop-blur">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Chat interface</p>
                <h2 className="mt-1 text-2xl font-bold text-slate-950">Cross-session Chief-of-Staff</h2>
                <p className="mt-1 text-sm text-slate-500">{currentSession?.summary ?? "Persistent memory across independent sessions."}</p>
              </div>
              <button disabled={loading} onClick={() => runAction("newSession")} className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60">
                + New session
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {state?.sessions.map((session) => (
                <button
                  key={session.id}
                  disabled={loading}
                  onClick={() => switchSession(session.id)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    selectedSessionId === session.id ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  } disabled:opacity-60`}
                >
                  {session.label.split("—")[0].trim()}
                </button>
              ))}
            </div>

            <div className="mt-5 h-[560px] overflow-auto rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
              {state?.messages.length ? (
                <div className="space-y-4">
                  {state.messages.map((message) => (
                    <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[88%] rounded-[1.4rem] px-4 py-3 text-sm leading-6 shadow-sm ${
                          message.role === "user" ? "bg-slate-950 text-white" : "bg-white text-slate-800"
                        }`}
                      >
                        <div className="mb-1 flex items-center gap-2 text-[11px] opacity-60">
                          <span>{message.role === "user" ? "Founder" : "EchoDesk"}</span>
                          <span>day {message.simulatedDay}</span>
                          {message.retrievedMemoryIds.length > 0 ? <span>{message.retrievedMemoryIds.length} recalled</span> : null}
                        </div>
                        <p className="whitespace-pre-line">{message.content}</p>
                      </div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
              ) : (
                <div className="grid h-full place-items-center text-center text-slate-500">
                  <div>
                    <p className="text-lg font-semibold text-slate-700">Start by loading the demo facts.</p>
                    <p className="mt-2 max-w-sm text-sm">Then ask from Session 2 to prove cross-session recall under the small context budget.</p>
                  </div>
                </div>
              )}
            </div>

            <form onSubmit={sendMessage} className="mt-4 flex gap-3">
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Tell EchoDesk a fact, or ask what it remembers..."
                className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none ring-cyan-300 transition focus:ring-4"
              />
              <button disabled={loading || !input.trim()} className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-slate-300 disabled:opacity-50">
                Send
              </button>
            </form>
          </section>

          <div className="space-y-6">
            <MemoryBrain memories={state?.memories ?? []} highlightedIds={highlightedIds} />

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="rounded-3xl bg-white/85 p-4 shadow-sm">
                <p className="text-xs text-slate-500">Active memories</p>
                <p className="mt-1 text-3xl font-bold">{stats.active}</p>
              </div>
              <div className="rounded-3xl bg-white/85 p-4 shadow-sm">
                <p className="text-xs text-slate-500">Forgotten</p>
                <p className="mt-1 text-3xl font-bold">{stats.dropped}</p>
              </div>
              <div className="rounded-3xl bg-white/85 p-4 shadow-sm">
                <p className="text-xs text-slate-500">Merged sources</p>
                <p className="mt-1 text-3xl font-bold">{stats.consolidated}</p>
              </div>
              <div className="rounded-3xl bg-white/85 p-4 shadow-sm">
                <p className="text-xs text-slate-500">Avg decay</p>
                <p className="mt-1 text-3xl font-bold">{stats.avgDecay.toFixed(2)}</p>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
              <section className="rounded-[2rem] border border-white/70 bg-white/80 p-5 shadow-xl shadow-slate-200/70 backdrop-blur">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Stored chunks</p>
                    <h2 className="mt-1 text-xl font-bold">Decay curves and status</h2>
                  </div>
                  <button disabled={loading} onClick={() => runAction("reset")} className="rounded-2xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 disabled:opacity-60">
                    Reset
                  </button>
                </div>
                <div className="mt-4">
                  <MemoryList memories={state?.memories ?? []} highlightedIds={highlightedIds} />
                </div>
              </section>

              <div className="space-y-6">
                <BenchmarkPanel benchmark={benchmark} />
                <section className="rounded-[2rem] border border-white/70 bg-white/80 p-5 shadow-xl shadow-slate-200/70 backdrop-blur">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Lifecycle log</p>
                  <h2 className="mt-1 text-xl font-bold">Encode → recall → decay → consolidate</h2>
                  <div className="mt-4 max-h-[360px] space-y-3 overflow-auto pr-1">
                    {state?.events.length ? (
                      state.events.map((event) => (
                        <div key={event.id} className="rounded-2xl bg-slate-50 p-3 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <span className="rounded-full bg-slate-950 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.13em] text-white">{event.type}</span>
                            <span className="text-xs text-slate-400">day {event.simulatedDay}</span>
                          </div>
                          <p className="mt-2 text-slate-700">{event.description}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-slate-500">Lifecycle events will appear here as the demo runs.</p>
                    )}
                  </div>
                </section>
              </div>
            </div>
          </div>
        </div>

        <section className="mt-6 grid gap-4 rounded-[2rem] border border-white/70 bg-white/75 p-5 text-sm text-slate-600 shadow-xl shadow-slate-200/70 backdrop-blur md:grid-cols-5">
          <div className="rounded-3xl bg-slate-950 p-4 text-white md:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Architecture path</p>
            <p className="mt-2 leading-6">Chat UI → memory API service → Qwen-compatible scoring/embeddings adapter → PostgreSQL memory store → decay/consolidation job → Memory Brain.</p>
          </div>
          <div className="rounded-3xl bg-white p-4 shadow-sm">
            <p className="font-semibold text-slate-900">Efficient retrieval</p>
            <p className="mt-1">Top-K memories only, capped to {state?.tokenBudget ?? 2000} estimated tokens.</p>
          </div>
          <div className="rounded-3xl bg-white p-4 shadow-sm">
            <p className="font-semibold text-slate-900">Timely forgetting</p>
            <p className="mt-1">Decay lowers inactive low-importance nodes and drops stale noise.</p>
          </div>
          <div className="rounded-3xl bg-white p-4 shadow-sm">
            <p className="font-semibold text-slate-900">Sleep consolidation</p>
            <p className="mt-1">Related memories merge into summaries with source lineage.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
