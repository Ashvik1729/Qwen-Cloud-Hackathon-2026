import { integer, jsonb, pgTable, real, text, timestamp } from "drizzle-orm/pg-core";

export const echoDemoState = pgTable("echo_demo_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const echoSessions = pgTable("echo_sessions", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  summary: text("summary").notNull(),
  simulatedDay: integer("simulated_day").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const echoMemories = pgTable("echo_memories", {
  id: text("id").primaryKey(),
  content: text("content").notNull(),
  kind: text("kind").notNull(),
  embedding: jsonb("embedding").$type<number[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  lastAccessed: timestamp("last_accessed", { withTimezone: true }).notNull(),
  createdDay: integer("created_day").notNull(),
  lastAccessedDay: integer("last_accessed_day").notNull(),
  accessCount: integer("access_count").notNull(),
  importanceScore: real("importance_score").notNull(),
  decayScore: real("decay_score").notNull(),
  consolidatedFrom: jsonb("consolidated_from").$type<string[]>().notNull(),
  sourceSessionId: text("source_session_id").notNull(),
  status: text("status").notNull(),
});

export const echoMessages = pgTable("echo_messages", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  simulatedDay: integer("simulated_day").notNull(),
  retrievedMemoryIds: jsonb("retrieved_memory_ids").$type<string[]>().notNull(),
});

export const echoEvents = pgTable("echo_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  description: text("description").notNull(),
  memoryIds: jsonb("memory_ids").$type<string[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  simulatedDay: integer("simulated_day").notNull(),
});
