const MODEL_LABELS: Record<string, string> = {
  chat_gpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  perplexity: "Perplexity",
  google: "Google",
};

export function formatVisibilityModel(model: string): string {
  return MODEL_LABELS[model] ?? model.replaceAll(/[_-]+/gu, " ");
}
