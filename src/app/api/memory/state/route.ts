import { getEchoState } from "@/lib/memory";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId") ?? "session-1";
    const state = await getEchoState(sessionId);
    return Response.json(state);
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Unable to load EchoDesk state",
      },
      { status: 500 },
    );
  }
}
