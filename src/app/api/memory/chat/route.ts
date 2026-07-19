import { getEchoState, processChat } from "@/lib/memory";

export const dynamic = "force-dynamic";

type ChatPayload = {
  sessionId?: string;
  message?: string;
};

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as ChatPayload;
    const sessionId = payload.sessionId ?? "session-1";
    const message = payload.message?.trim();

    if (!message) {
      return Response.json({ error: "Message is required" }, { status: 400 });
    }

    const result = await processChat(sessionId, message);
    const state = await getEchoState(sessionId);
    return Response.json({ result, state });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Unable to process chat turn",
      },
      { status: 500 },
    );
  }
}
