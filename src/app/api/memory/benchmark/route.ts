import { getEchoState, runBenchmark } from "@/lib/memory";

export const dynamic = "force-dynamic";

type BenchmarkPayload = {
  sessionId?: string;
};

export async function POST(request: Request) {
  try {
    const payload = (await request.json().catch(() => ({}))) as BenchmarkPayload;
    const benchmark = await runBenchmark();
    const state = await getEchoState(payload.sessionId ?? "session-2");
    return Response.json({ benchmark, state });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Unable to run benchmark",
      },
      { status: 500 },
    );
  }
}
