import { db } from "@/db";
import { echoDemoState, echoEvents, echoMemories, echoMessages, echoSessions } from "@/db/schema";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { qwenImportanceScore, qwenIsConfigured } from "./qwen";

const EMBEDDING_DIMS = 48;
const CONTEXT_TOKEN_BUDGET = 2_000;
const STOP_WORDS = new Set([
  "a",
  "about",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "i",
  "in",
  "is",
  "it",
  "me",
  "my",
  "of",
  "on",
  "or",
  "our",
  "should",
  "that",
  "the",
  "this",
  "to",
  "what",
  "when",
  "with",
  "you",
]);

export type EchoMemory = typeof echoMemories.$inferSelect;
export type EchoSession = typeof echoSessions.$inferSelect;
export type EchoMessage = typeof echoMessages.$inferSelect;
export type EchoEvent = typeof echoEvents.$inferSelect;

export type RetrievedMemory = EchoMemory & {
  similarity: number;
  retrievalScore: number;
  estimatedTokens: number;
};

export type BenchmarkResult = {
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

function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function now() {
  return new Date();
}

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function tokenize(text: string) {
  return text
    .toLowerCase()
    .replace(/[$]/g, " dollars ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function hashToken(token: string) {
  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return Math.abs(hash >>> 0);
}

export function embedText(text: string) {
  const vector = Array.from({ length: EMBEDDING_DIMS }, () => 0);
  for (const token of tokenize(text)) {
    vector[hashToken(token) % EMBEDDING_DIMS] += 1;
  }
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (magnitude === 0) {
    return vector;
  }
  return vector.map((value) => Number((value / magnitude).toFixed(6)));
}

function cosineSimilarity(left: number[], right: number[]) {
  const limit = Math.min(left.length, right.length);
  let dot = 0;
  for (let index = 0; index < limit; index += 1) {
    dot += left[index] * right[index];
  }
  return clamp(dot, 0, 1);
}

function lexicalOverlap(query: string, content: string) {
  const queryTokens = new Set(tokenize(query));
  const contentTokens = new Set(tokenize(content));
  if (queryTokens.size === 0) {
    return 0;
  }
  let overlap = 0;
  for (const token of queryTokens) {
    if (contentTokens.has(token)) {
      overlap += 1;
    }
  }
  return overlap / queryTokens.size;
}

export function estimateTokens(text: string) {
  return Math.max(8, Math.ceil(text.split(/\s+/).filter(Boolean).length * 1.35));
}

async function getStateValue(key: string, fallback: string) {
  const rows = await db.select().from(echoDemoState).where(eq(echoDemoState.key, key)).limit(1);
  return rows[0]?.value ?? fallback;
}

async function setStateValue(key: string, value: string) {
  await db
    .insert(echoDemoState)
    .values({ key, value, updatedAt: now() })
    .onConflictDoUpdate({
      target: echoDemoState.key,
      set: { value, updatedAt: now() },
    });
}

export async function getCurrentDay() {
  return Number.parseInt(await getStateValue("simulated_day", "0"), 10) || 0;
}

async function setCurrentDay(day: number) {
  await setStateValue("simulated_day", String(Math.max(0, day)));
}

async function getLastDecayDay() {
  return Number.parseInt(await getStateValue("last_decay_day", "0"), 10) || 0;
}

async function setLastDecayDay(day: number) {
  await setStateValue("last_decay_day", String(Math.max(0, day)));
}

async function logEvent(type: string, description: string, memoryIds: string[] = []) {
  await db.insert(echoEvents).values({
    id: id("event"),
    type,
    description,
    memoryIds,
    createdAt: now(),
    simulatedDay: await getCurrentDay(),
  });
}

export async function ensureBaselineData() {
  const createdAt = now();
  await db
    .insert(echoDemoState)
    .values([
      { key: "simulated_day", value: "0", updatedAt: createdAt },
      { key: "last_decay_day", value: "0", updatedAt: createdAt },
    ])
    .onConflictDoNothing();

  await db
    .insert(echoSessions)
    .values([
      {
        id: "session-1",
        label: "Session 1 — founder onboarding",
        summary: "Seed facts, preferences, decisions, and noise.",
        simulatedDay: 0,
        createdAt,
      },
      {
        id: "session-2",
        label: "Session 2 — days later recall",
        summary: "A separate chat proving cross-session memory.",
        simulatedDay: 3,
        createdAt,
      },
    ])
    .onConflictDoNothing();
}

function classifyMemory(sentence: string) {
  const lower = sentence.toLowerCase();
  if (/deadline|due|by\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)|launch|deliver/.test(lower)) {
    return "deadline";
  }
  if (/decision|decided|approved|chose|ship|package/.test(lower)) {
    return "decision";
  }
  if (/prefer|preference|like updates|don't|do not|always|never|tone|style/.test(lower)) {
    return "preference";
  }
  if (/client|customer|budget|invoice|contract|pricing|\$|dollars/.test(lower)) {
    return "client";
  }
  if (/weather|toast|coffee|sourdough|dog|movie|song|small talk|random/.test(lower)) {
    return "small_talk";
  }
  return "fact";
}

function heuristicImportance(sentence: string, kind: string) {
  const lower = sentence.toLowerCase();
  let score = 0.28;

  if (kind === "deadline") score += 0.44;
  if (kind === "decision") score += 0.38;
  if (kind === "preference") score += 0.34;
  if (kind === "client") score += 0.32;
  if (kind === "small_talk") score -= 0.2;
  if (/\$|budget|deadline|due|client|prefer|decision|risk|under|above/.test(lower)) score += 0.12;
  if (/today|weather|toast|coffee|dog|joke|random/.test(lower)) score -= 0.1;
  if (sentence.length > 90) score += 0.04;

  return clamp(Number(score.toFixed(2)), 0.08, 0.98);
}

async function scoreImportance(sentence: string, kind: string) {
  const qwenScore = await qwenImportanceScore(sentence);
  if (qwenScore !== null) {
    return clamp(qwenScore);
  }
  return heuristicImportance(sentence, kind);
}

function extractCandidateSentences(message: string) {
  const looksLikeQuestion = /\?\s*$/.test(message.trim()) || /^(what|when|where|who|how|why|can you|could you|should i)\b/i.test(message.trim());
  if (looksLikeQuestion && !/remember|note|for next time/i.test(message)) {
    return [];
  }

  return message
    .split(/[.!?\n;]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 12)
    .slice(0, 8);
}

export async function storeMemoriesFromMessage(message: string, sessionId: string) {
  const day = await getCurrentDay();
  const createdAt = now();
  const candidates = extractCandidateSentences(message);
  const stored: EchoMemory[] = [];

  for (const sentence of candidates) {
    const kind = classifyMemory(sentence);
    const importance = await scoreImportance(sentence, kind);
    if (importance < 0.1) {
      continue;
    }

    const rows = await db
      .insert(echoMemories)
      .values({
        id: id("mem"),
        content: sentence,
        kind,
        embedding: embedText(sentence),
        createdAt,
        lastAccessed: createdAt,
        createdDay: day,
        lastAccessedDay: day,
        accessCount: 0,
        importanceScore: importance,
        decayScore: importance,
        consolidatedFrom: [],
        sourceSessionId: sessionId,
        status: "active",
      })
      .returning();

    stored.push(...rows);
  }

  if (stored.length > 0) {
    await logEvent(
      "encode",
      `Encoded ${stored.length} candidate ${stored.length === 1 ? "memory" : "memories"} with ${qwenIsConfigured() ? "Qwen-ready" : "local"} importance scoring.`,
      stored.map((memory) => memory.id),
    );
  }

  return stored;
}

async function updateRetrievedMemories(retrieved: RetrievedMemory[]) {
  const day = await getCurrentDay();
  for (const memory of retrieved) {
    await db
      .update(echoMemories)
      .set({
        lastAccessed: now(),
        lastAccessedDay: day,
        accessCount: memory.accessCount + 1,
        decayScore: clamp(memory.decayScore + 0.07),
      })
      .where(eq(echoMemories.id, memory.id));
  }
}

async function rankActiveMemories(query: string, budget = CONTEXT_TOKEN_BUDGET) {
  const currentDay = await getCurrentDay();
  const queryEmbedding = embedText(query);
  const active = await db.select().from(echoMemories).where(eq(echoMemories.status, "active"));

  const ranked = active
    .map((memory) => {
      const similarity = Math.max(cosineSimilarity(queryEmbedding, memory.embedding), lexicalOverlap(query, memory.content));
      const daysSinceAccess = Math.max(0, currentDay - memory.lastAccessedDay);
      const recencyBoost = 1 / (1 + daysSinceAccess * 0.08);
      const importanceBoost = 0.45 + memory.importanceScore * 0.65;
      const decayBoost = 0.25 + memory.decayScore;
      const retrievalScore = similarity * recencyBoost * importanceBoost * decayBoost;
      return {
        ...memory,
        similarity,
        retrievalScore,
        estimatedTokens: estimateTokens(memory.content),
      } satisfies RetrievedMemory;
    })
    .filter((memory) => memory.retrievalScore > 0.015 || memory.similarity > 0.18)
    .sort((left, right) => right.retrievalScore - left.retrievalScore);

  const selected: RetrievedMemory[] = [];
  let usedTokens = 0;
  for (const memory of ranked) {
    if (selected.length >= 8) {
      break;
    }
    if (usedTokens + memory.estimatedTokens > budget) {
      continue;
    }
    selected.push(memory);
    usedTokens += memory.estimatedTokens;
  }

  return selected;
}

export async function retrieveMemories(query: string, budget = CONTEXT_TOKEN_BUDGET, mutate = true) {
  await applyDecayAndConsolidation(false);
  const retrieved = await rankActiveMemories(query, budget);
  if (mutate && retrieved.length > 0) {
    await updateRetrievedMemories(retrieved);
    await logEvent(
      "recall",
      `Recalled ${retrieved.length} memory node${retrieved.length === 1 ? "" : "s"} using ${retrieved.reduce(
        (sum, memory) => sum + memory.estimatedTokens,
        0,
      )}/${budget} tokens.`,
      retrieved.map((memory) => memory.id),
    );
  }
  return retrieved;
}

function detectClusterKey(memory: EchoMemory) {
  const directClient = memory.content.match(/client\s+([A-Z][A-Za-z0-9-]+)/i);
  if (directClient?.[1]) {
    return directClient[1].toLowerCase();
  }
  const knownEntity = memory.content.match(/\b(Meridian|Acme|Nimbus|Northstar|Atlas|Globex|Futura)\b/i);
  if (knownEntity?.[1]) {
    return knownEntity[1].toLowerCase();
  }
  if (["deadline", "decision", "preference"].includes(memory.kind)) {
    return memory.kind;
  }
  return null;
}

function summarizeCluster(clusterKey: string, cluster: EchoMemory[]) {
  const title = clusterKey.charAt(0).toUpperCase() + clusterKey.slice(1);
  const facts = cluster
    .map((memory) => memory.content.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 4)
    .join("; ");
  return `${title} consolidated brief: ${facts}.`;
}

async function consolidateClusters() {
  const currentDay = await getCurrentDay();
  const active = await db
    .select()
    .from(echoMemories)
    .where(and(eq(echoMemories.status, "active")));

  const groups = new Map<string, EchoMemory[]>();
  for (const memory of active) {
    if (memory.kind === "summary" || memory.consolidatedFrom.length > 0) {
      continue;
    }
    if (currentDay - memory.createdDay < 7) {
      continue;
    }
    if (memory.importanceScore < 0.5) {
      continue;
    }
    const key = detectClusterKey(memory);
    if (!key) {
      continue;
    }
    groups.set(key, [...(groups.get(key) ?? []), memory]);
  }

  for (const [clusterKey, cluster] of groups) {
    if (cluster.length < 2) {
      continue;
    }

    const alreadySummarized = active.some(
      (memory) => memory.kind === "summary" && memory.content.toLowerCase().includes(`${clusterKey} consolidated brief`),
    );
    if (alreadySummarized) {
      continue;
    }

    const sourceIds = cluster.map((memory) => memory.id);
    await db
      .update(echoMemories)
      .set({ status: "consolidated", decayScore: clamp(Math.max(...cluster.map((memory) => memory.decayScore)) * 0.75) })
      .where(inArray(echoMemories.id, sourceIds));

    const summary = summarizeCluster(clusterKey, cluster);
    const maxImportance = Math.max(...cluster.map((memory) => memory.importanceScore));
    const maxDecay = Math.max(...cluster.map((memory) => memory.decayScore));
    const inserted = await db
      .insert(echoMemories)
      .values({
        id: id("mem"),
        content: summary,
        kind: "summary",
        embedding: embedText(summary),
        createdAt: now(),
        lastAccessed: now(),
        createdDay: currentDay,
        lastAccessedDay: currentDay,
        accessCount: 0,
        importanceScore: clamp(maxImportance + 0.05),
        decayScore: clamp(maxDecay + 0.1),
        consolidatedFrom: sourceIds,
        sourceSessionId: cluster[0].sourceSessionId,
        status: "active",
      })
      .returning();

    await logEvent(
      "consolidate",
      `Sleep consolidation merged ${cluster.length} related ${clusterKey} memories into one durable summary.`,
      [inserted[0].id, ...sourceIds],
    );
  }
}

async function dropFadedMemories() {
  const faded = await db
    .select()
    .from(echoMemories)
    .where(and(eq(echoMemories.status, "active")));

  const toDrop = faded.filter((memory) => memory.decayScore < 0.18 && memory.importanceScore < 0.38);
  if (toDrop.length === 0) {
    return;
  }

  await db
    .update(echoMemories)
    .set({ status: "dropped", decayScore: 0.05 })
    .where(inArray(echoMemories.id, toDrop.map((memory) => memory.id)));

  await logEvent(
    "forget",
    `Dropped ${toDrop.length} low-importance stale memor${toDrop.length === 1 ? "y" : "ies"} after decay crossed the threshold.`,
    toDrop.map((memory) => memory.id),
  );
}

export async function applyDecayAndConsolidation(consolidate = true) {
  await ensureBaselineData();
  const currentDay = await getCurrentDay();
  const lastDecayDay = await getLastDecayDay();
  const daysElapsed = Math.max(0, currentDay - lastDecayDay);

  if (daysElapsed > 0) {
    const active = await db.select().from(echoMemories).where(eq(echoMemories.status, "active"));
    for (const memory of active) {
      const idleDays = Math.max(0, currentDay - memory.lastAccessedDay);
      if (idleDays === 0) {
        continue;
      }
      const kindPenalty = memory.kind === "small_talk" ? 0.05 : 0;
      const rate = 0.018 + (1 - memory.importanceScore) * 0.055 + kindPenalty;
      const updatedDecay = clamp(memory.decayScore - daysElapsed * rate);
      await db.update(echoMemories).set({ decayScore: updatedDecay }).where(eq(echoMemories.id, memory.id));
    }
    await setLastDecayDay(currentDay);
    await logEvent("decay", `Advanced memory decay by ${daysElapsed} simulated day${daysElapsed === 1 ? "" : "s"}.`);
  }

  if (consolidate) {
    await dropFadedMemories();
    await consolidateClusters();
  }
}

function buildReply(message: string, retrieved: RetrievedMemory[], stored: EchoMemory[]) {
  const contextTokens = retrieved.reduce((sum, memory) => sum + memory.estimatedTokens, 0);
  const top = retrieved[0];

  if (top) {
    const supporting = retrieved
      .slice(0, 3)
      .map((memory) => `• ${memory.content}`)
      .join("\n");
    return `I found the relevant memory without stuffing the whole history.\n\n${supporting}\n\nContext used: ${contextTokens}/${CONTEXT_TOKEN_BUDGET} tokens. Retrieval rank used semantic similarity × recency × decay × importance.`;
  }

  if (stored.length > 0) {
    return `Logged ${stored.length} durable memory candidate${stored.length === 1 ? "" : "s"}. I scored importance, embedded the chunks, and initialized decay from importance.`;
  }

  if (/forget|decay|consolidate|benchmark/i.test(message)) {
    return "Use the demo controls to advance simulated time, run consolidation, and score recall precision under the fixed token budget.";
  }

  return "I do not have a strong matching memory yet. Tell me a fact, preference, client constraint, decision, or deadline and I will encode it with a visible decay curve.";
}

export async function processChat(sessionId: string, message: string) {
  await ensureBaselineData();
  const currentDay = await getCurrentDay();
  const timestamp = now();

  await db.insert(echoMessages).values({
    id: id("msg"),
    sessionId,
    role: "user",
    content: message,
    createdAt: timestamp,
    simulatedDay: currentDay,
    retrievedMemoryIds: [],
  });

  const stored = await storeMemoriesFromMessage(message, sessionId);
  const retrieved = await retrieveMemories(message, CONTEXT_TOKEN_BUDGET, true);
  const reply = buildReply(message, retrieved, stored);

  await db.insert(echoMessages).values({
    id: id("msg"),
    sessionId,
    role: "assistant",
    content: reply,
    createdAt: now(),
    simulatedDay: currentDay,
    retrievedMemoryIds: retrieved.map((memory) => memory.id),
  });

  return {
    reply,
    stored,
    retrieved,
    contextTokens: retrieved.reduce((sum, memory) => sum + memory.estimatedTokens, 0),
    tokenBudget: CONTEXT_TOKEN_BUDGET,
  };
}

export async function resetDemo() {
  await db.delete(echoEvents);
  await db.delete(echoMessages);
  await db.delete(echoMemories);
  await db.delete(echoSessions);
  await db.delete(echoDemoState);
  await ensureBaselineData();
  await logEvent("reset", "Reset the EchoDesk memory store and simulated clock.");
}

export async function seedDemoFacts() {
  await resetDemo();
  const facts = [
    "Client Meridian Labs is budget-sensitive and wants launch options under $8,000.",
    "The Meridian launch memo deadline is next Friday at 3 PM.",
    "I prefer short bullet updates with the risk first and no long preambles.",
    "Decision: package my consulting offer as a two-week sprint called Founder Ops Sprint.",
    "Random small talk: my dog is learning to dance to synthwave.",
    "I had sourdough toast and cloudy weather in Oakland today.",
  ];

  for (const fact of facts) {
    await processChat("session-1", fact);
  }

  await logEvent("demo", "Loaded Session 1 with business facts plus irrelevant low-value noise.");
}

export async function askDemoRecallQuestion() {
  await ensureSeededIfEmpty();
  const day = await getCurrentDay();
  await setCurrentDay(Math.max(day, 3));
  return processChat("session-2", "What budget posture should I take with Meridian Labs for the launch options?");
}

export async function fastForwardDemo(days = 14) {
  await ensureSeededIfEmpty();
  const day = await getCurrentDay();
  await setCurrentDay(day + days);
  await applyDecayAndConsolidation(true);
}

async function ensureSeededIfEmpty() {
  await ensureBaselineData();
  const memories = await db.select({ id: echoMemories.id }).from(echoMemories).limit(1);
  if (memories.length === 0) {
    await seedDemoFacts();
  }
}

export async function createSession() {
  await ensureBaselineData();
  const sessions = await db.select().from(echoSessions);
  const nextNumber = sessions.length + 1;
  const currentDay = await getCurrentDay();
  const newSession = {
    id: `session-${nextNumber}`,
    label: `Session ${nextNumber} — new context`,
    summary: "A fresh chat that still retrieves persistent memory.",
    simulatedDay: currentDay,
    createdAt: now(),
  };
  await db.insert(echoSessions).values(newSession).onConflictDoNothing();
  await logEvent("session", `Created ${newSession.label}.`);
  return newSession;
}

export async function runBenchmark(): Promise<BenchmarkResult> {
  await ensureSeededIfEmpty();
  const cases = [
    {
      query: "What budget constraint matters for Meridian Labs?",
      expected: "Meridian budget under $8,000",
      validator: (memories: RetrievedMemory[]) => memories.some((memory) => /meridian/i.test(memory.content) && /(budget|8,000|8000)/i.test(memory.content)),
    },
    {
      query: "When is the Meridian launch memo due?",
      expected: "Deadline next Friday at 3 PM",
      validator: (memories: RetrievedMemory[]) => memories.some((memory) => /meridian|deadline|friday|3 pm/i.test(memory.content)),
    },
    {
      query: "How do I prefer updates from my chief of staff?",
      expected: "Short bullets with risk first",
      validator: (memories: RetrievedMemory[]) => memories.some((memory) => /bullet|risk first|preambles/i.test(memory.content)),
    },
    {
      query: "What did I eat during the cloudy-weather small talk?",
      expected: "Low-value toast/weather noise should not be recalled after decay",
      validator: (memories: RetrievedMemory[]) => !memories.some((memory) => /sourdough|toast|cloudy|weather|dog|synthwave/i.test(memory.content)),
    },
  ];

  const evaluated = [];
  for (const benchmarkCase of cases) {
    const retrieved = await retrieveMemories(benchmarkCase.query, CONTEXT_TOKEN_BUDGET, false);
    const contextTokens = retrieved.reduce((sum, memory) => sum + memory.estimatedTokens, 0);
    evaluated.push({
      query: benchmarkCase.query,
      expected: benchmarkCase.expected,
      correct: benchmarkCase.validator(retrieved),
      contextTokens,
      retrievedMemoryIds: retrieved.map((memory) => memory.id),
    });
  }

  const correct = evaluated.filter((item) => item.correct).length;
  const avgContextTokens = Math.round(evaluated.reduce((sum, item) => sum + item.contextTokens, 0) / evaluated.length);

  await logEvent(
    "benchmark",
    `Recall precision ${correct}/${evaluated.length}; average context ${avgContextTokens}/${CONTEXT_TOKEN_BUDGET} tokens.`,
    evaluated.flatMap((item) => item.retrievedMemoryIds).slice(0, 12),
  );

  return {
    precision: `${correct}/${evaluated.length}`,
    correct,
    total: evaluated.length,
    avgContextTokens,
    tokenBudget: CONTEXT_TOKEN_BUDGET,
    cases: evaluated,
  };
}

export async function getEchoState(sessionId = "session-1") {
  await ensureBaselineData();
  await applyDecayAndConsolidation(false);
  const [sessions, memories, messages, events] = await Promise.all([
    db.select().from(echoSessions).orderBy(asc(echoSessions.createdAt)),
    db.select().from(echoMemories).orderBy(desc(echoMemories.createdAt)),
    db.select().from(echoMessages).where(eq(echoMessages.sessionId, sessionId)).orderBy(asc(echoMessages.createdAt)),
    db.select().from(echoEvents).orderBy(desc(echoEvents.createdAt)).limit(28),
  ]);

  return {
    currentDay: await getCurrentDay(),
    sessions,
    memories,
    messages,
    events,
    tokenBudget: CONTEXT_TOKEN_BUDGET,
    qwenConfigured: qwenIsConfigured(),
  };
}
