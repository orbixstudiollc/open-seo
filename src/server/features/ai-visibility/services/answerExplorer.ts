import { AiAnswerExplorerRepository } from "@/server/features/ai-visibility/repositories/AiAnswerExplorerRepository";
import {
  AI_ANSWER_EXPLORER_PAGE_SIZE,
  type AnswerExplorerResult,
  type RunnableTrackedPrompt,
} from "@/types/schemas/ai-answer-explorer";

export async function getAnswerExplorer(input: {
  projectId: string;
  answerId?: string;
  trackedPromptId?: string;
  model?: string;
  page: number;
}): Promise<AnswerExplorerResult> {
  const page = Math.max(1, Math.floor(input.page));
  const [promptRows, answerResult] = await Promise.all([
    AiAnswerExplorerRepository.getRunnablePrompts(input.projectId),
    AiAnswerExplorerRepository.getAnswers({
      ...input,
      limit: AI_ANSWER_EXPLORER_PAGE_SIZE,
      offset: (page - 1) * AI_ANSWER_EXPLORER_PAGE_SIZE,
    }),
  ]);
  const answerIds = answerResult.rows.map((answer) => answer.id);
  const [mentionRows, citationRows] = await Promise.all([
    AiAnswerExplorerRepository.getMentions(answerIds),
    AiAnswerExplorerRepository.getCitations(answerIds),
  ]);

  const prompts = groupRunnablePrompts(promptRows);
  const mentionsByAnswer = new Map<string, typeof mentionRows>();
  for (const mention of mentionRows) {
    mentionsByAnswer.set(mention.answerId, [
      ...(mentionsByAnswer.get(mention.answerId) ?? []),
      mention,
    ]);
  }
  const citationsByAnswer = new Map<string, typeof citationRows>();
  for (const citation of citationRows) {
    citationsByAnswer.set(citation.answerId, [
      ...(citationsByAnswer.get(citation.answerId) ?? []),
      citation,
    ]);
  }

  return {
    page,
    pageSize: AI_ANSWER_EXPLORER_PAGE_SIZE,
    total: answerResult.total,
    totalPages: Math.ceil(answerResult.total / AI_ANSWER_EXPLORER_PAGE_SIZE),
    prompts,
    models: Array.from(new Set(promptRows.map((row) => row.model))).toSorted(),
    answers: answerResult.rows.flatMap((answer) =>
      answer.responseText == null
        ? []
        : [
            {
              ...answer,
              responseText: answer.responseText,
              mentions: (mentionsByAnswer.get(answer.id) ?? []).map(
                (mention) => ({
                  id: mention.id,
                  brandId: mention.brandId,
                  brandName: mention.brandName ?? mention.rawName,
                  rawName: mention.rawName,
                  mentionCount: mention.mentionCount,
                  sentiment: mention.sentiment,
                  position: mention.position,
                  start: mention.start,
                  end: mention.end,
                }),
              ),
              citations: citationsByAnswer.get(answer.id) ?? [],
            },
          ],
    ),
  };
}

function groupRunnablePrompts(
  rows: Awaited<
    ReturnType<typeof AiAnswerExplorerRepository.getRunnablePrompts>
  >,
): RunnableTrackedPrompt[] {
  const prompts = new Map<string, RunnableTrackedPrompt>();
  for (const row of rows) {
    const prompt = prompts.get(row.trackedPromptId) ?? {
      promptSetId: row.promptSetId,
      promptSetName: row.promptSetName,
      trackedPromptId: row.trackedPromptId,
      promptText: row.promptText,
      enabledModels: [],
    };
    if (!prompt.enabledModels.includes(row.model)) {
      prompt.enabledModels.push(row.model);
    }
    prompts.set(row.trackedPromptId, prompt);
  }
  return Array.from(prompts.values());
}
