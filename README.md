# EchoDesk

EchoDesk is a persistent-memory Chief-of-Staff agent demo for solo founders and freelancers. It proves that assistant memory can be useful without brute-force context stuffing: each memory is chunked, scored, embedded, retrieved under a fixed budget, decayed over time, and consolidated or forgotten when it becomes stale.

Track: MemoryAgent.

## Live Demo
https://resplendent-pika-b3e990.netlify.app/

## What the demo proves

1. **Efficient storage and retrieval** — user facts are stored as individual memory chunks with deterministic embeddings, importance scores, timestamps, access counts, and decay scores. Retrieval ranks by semantic similarity, recency, importance, and decay, then caps retrieved memory to a 2K estimated-token budget.
2. **Timely forgetting** — simulated time advances memory decay. Low-importance small talk fades and is dropped. Related durable memories are consolidated into a summary memory with source lineage.
3. **Recall under limited context** — the benchmark screen reports recall precision and average context tokens across fixed test queries, including a negative test proving stale noise is not recalled after decay.

## Demo flow

1. Click **Load Session 1 facts** to seed business facts, preferences, decisions, deadlines, and irrelevant small talk.
2. Click **Ask days-later recall** to switch to Session 2 and retrieve a specific Meridian Labs budget memory from a separate chat session.
3. Click **Fast-forward + sleep** to advance simulated time, decay low-value memories, drop stale noise, and consolidate related Meridian memories.
4. Click **Run recall benchmark** to show precision and average context usage under the 2K token budget.

## Architecture

See `architecture.png` for the required submission diagram:

Chat UI → FastAPI target service on Alibaba Cloud ECS → Qwen Cloud API for reasoning/scoring and embeddings → Memory store → Decay/consolidation job → Memory Brain visualization.

This sandbox implementation is a full-stack Next.js application using PostgreSQL and Drizzle ORM. The memory service layer includes a Qwen-compatible adapter (`DASHSCOPE_API_KEY` or `QWEN_API_KEY`) and a deterministic local fallback so the demo runs without secrets.

## Tech stack

- Frontend: Next.js App Router, React, Tailwind CSS
- Backend in this repo: Next.js route handlers exposing the memory API contract
- Target backend for hackathon deployment: FastAPI on Alibaba Cloud ECS
- Database: PostgreSQL via Drizzle ORM
- Qwen integration: OpenAI-compatible DashScope/Qwen chat endpoint, optional via environment variables

## Environment variables

The app requires PostgreSQL:

```bash
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/app_db
```

Optional Qwen/DashScope configuration:

```bash
DASHSCOPE_API_KEY=your_key
# or QWEN_API_KEY=your_key
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen-plus
ENABLE_QWEN_SCORING=true
```

If Qwen variables are not present, EchoDesk uses local scoring and hashed embeddings for a deterministic demo.

## Local setup

```bash
npm install
npx drizzle-kit push
npm run build
npm run start
```

Open the app and run the four-step demo using the buttons at the top of the dashboard.

## Required submission artifacts

- `LICENSE` — MIT license.
- `architecture.png` — architecture diagram for the MemoryAgent submission.
- `PROOF.md` — placeholder and checklist for linking a screen recording proving the backend runs on Alibaba Cloud ECS.
- Demo video — recommended script: seed facts, cross-session recall, fast-forward forgetting/consolidation, benchmark screen.
