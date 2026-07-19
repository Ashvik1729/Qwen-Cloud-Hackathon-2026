import {
  askDemoRecallQuestion,
  createSession,
  fastForwardDemo,
  getEchoState,
  resetDemo,
  seedDemoFacts,
} from "@/lib/memory";

export const dynamic = "force-dynamic";

type ActionPayload = {
  action?: "seed" | "recall" | "fastForward" | "reset" | "newSession";
  sessionId?: string;
  days?: number;
};

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as ActionPayload;
    const action = payload.action ?? "seed";
    let selectedSessionId = payload.sessionId ?? "session-1";
    let result: unknown = null;

    if (action === "seed") {
      await seedDemoFacts();
      selectedSessionId = "session-1";
    } else if (action === "recall") {
      result = await askDemoRecallQuestion();
      selectedSessionId = "session-2";
    } else if (action === "fastForward") {
      await fastForwardDemo(payload.days ?? 14);
    } else if (action === "reset") {
      await resetDemo();
      selectedSessionId = "session-1";
    } else if (action === "newSession") {
      const session = await createSession();
      selectedSessionId = session.id;
      result = session;
    }

    const state = await getEchoState(selectedSessionId);
    return Response.json({ result, selectedSessionId, state });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Unable to run EchoDesk action",
      },
      { status: 500 },
    );
  }
}
