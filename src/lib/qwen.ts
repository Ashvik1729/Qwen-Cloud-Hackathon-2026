type QwenMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type QwenChoice = {
  message?: {
    content?: string;
  };
};

type QwenChatResponse = {
  choices?: QwenChoice[];
};

const DEFAULT_QWEN_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";

export function qwenIsConfigured() {
  return Boolean(process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY);
}

export async function qwenChat(messages: QwenMessage[], model = process.env.QWEN_MODEL ?? "qwen-plus") {
  const apiKey = process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY;
  const baseUrl = process.env.QWEN_BASE_URL || DEFAULT_QWEN_BASE_URL;

  if (!apiKey) {
    return null;
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    return null;
  }

  const json = (await response.json()) as QwenChatResponse;
  return json.choices?.[0]?.message?.content?.trim() ?? null;
}

export async function qwenImportanceScore(candidateMemory: string) {
  if (process.env.ENABLE_QWEN_SCORING !== "true") {
    return null;
  }

  const result = await qwenChat([
    {
      role: "system",
      content:
        "You score whether a sentence should become durable assistant memory for a founder chief-of-staff. Reply with only a number from 0 to 1.",
    },
    {
      role: "user",
      content: candidateMemory,
    },
  ]);

  if (!result) {
    return null;
  }

  const parsed = Number.parseFloat(result.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.max(0, Math.min(1, parsed));
}
