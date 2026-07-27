import { describe, expect, it } from "vitest";
import type {
  AnalyticsBrandRow,
  AnalyticsObservationRow,
  AnalyticsRunRow,
} from "@/server/features/ai-visibility/repositories/AiVisibilityAnalyticsRepository";
import { buildVisibilityOverview } from "./visibilityAnalytics";

const AS_OF = new Date("2026-07-28T00:00:00.000Z");
const PRIMARY_ID = "brand-acme";
const COMPETITOR_ID = "brand-rival";

const BRANDS: AnalyticsBrandRow[] = [
  brand(PRIMARY_ID, "Acme", true, "2026-01-01T00:00:00.000Z"),
  brand(COMPETITOR_ID, "Rival", false, "2026-01-02T00:00:00.000Z"),
];

describe("buildVisibilityOverview", () => {
  it("calculates answer visibility and a percentage-point delta across half-open periods", () => {
    const runs = [
      run("previous", "2026-07-14 00:00:00", 4),
      run("current", "2026-07-21T00:00:00.000Z", 4),
      run("excluded", "2026-07-28T00:00:00.000Z", 1),
    ];
    const observations = [
      ...cohort("previous", "2026-07-14 00:00:00", [true, false, false, false]),
      ...cohort("current", "2026-07-21T00:00:00.000Z", [
        true,
        true,
        false,
        false,
      ]),
      ...answer({
        runId: "excluded",
        runStartedAt: "2026-07-28T00:00:00.000Z",
        answerId: "excluded-answer",
        promptId: "prompt-a",
        model: "chat_gpt",
        mentionedBrandIds: [PRIMARY_ID],
      }),
    ];

    const result = build({ runs, observations });

    expect(result.metric).toMatchObject({
      visibilityPct: 50,
      mentionedAnswers: 2,
      successfulAnswers: 4,
      failedAnswers: 0,
      expectedAnswers: 4,
      coveragePct: 100,
    });
    expect(result.comparison).toEqual({
      status: "available",
      message: "Compared with the previous equivalent period.",
      deltaPctPoints: 25,
      previousVisibilityPct: 25,
    });
    expect(result.period.currentStart).toBe("2026-07-21T00:00:00.000Z");
    expect(result.period.previousStart).toBe("2026-07-14T00:00:00.000Z");
  });

  it("keeps observed zero days and omits missing and failed-only days", () => {
    const runs = [
      run("history", "2026-07-14T00:00:00.000Z", 1),
      run("zero", "2026-07-22T12:00:00.000Z", 1),
      run("mention", "2026-07-24T12:00:00.000Z", 1),
      run("failed", "2026-07-25T12:00:00.000Z", 1),
    ];
    const observations = [
      ...answer({
        runId: "history",
        runStartedAt: "2026-07-14T00:00:00.000Z",
        answerId: "history-answer",
        promptId: "prompt-a",
        model: "chat_gpt",
      }),
      ...answer({
        runId: "zero",
        runStartedAt: "2026-07-22T12:00:00.000Z",
        answerId: "zero-answer",
        promptId: "prompt-a",
        model: "chat_gpt",
      }),
      ...answer({
        runId: "mention",
        runStartedAt: "2026-07-24T12:00:00.000Z",
        answerId: "mention-answer",
        promptId: "prompt-a",
        model: "chat_gpt",
        mentionedBrandIds: [PRIMARY_ID, PRIMARY_ID],
      }),
      ...answer({
        runId: "failed",
        runStartedAt: "2026-07-25T12:00:00.000Z",
        answerId: "failed-answer",
        promptId: "prompt-a",
        model: "chat_gpt",
        status: "error",
      }),
    ];

    const result = build({ runs, observations });

    expect(result.trend).toEqual([
      {
        date: "2026-07-22",
        visibilityPct: 0,
        mentionedAnswers: 0,
        successfulAnswers: 1,
      },
      {
        date: "2026-07-24",
        visibilityPct: 100,
        mentionedAnswers: 1,
        successfulAnswers: 1,
      },
    ]);
    expect(result.metric.failedAnswers).toBe(1);
  });

  it("returns insufficient history instead of a flat delta for a new install", () => {
    const runs = [run("new", "2026-07-25T00:00:00.000Z", 1)];
    const observations = [
      ...answer({
        runId: "new",
        runStartedAt: "2026-07-25T00:00:00.000Z",
        answerId: "new-answer",
        promptId: "prompt-a",
        model: "chat_gpt",
        mentionedBrandIds: [PRIMARY_ID],
      }),
    ];

    const result = build({ runs, observations });

    expect(result.metric.visibilityPct).toBe(100);
    expect(result.comparison).toMatchObject({
      status: "not_enough_elapsed_history",
      deltaPctPoints: null,
      previousVisibilityPct: null,
    });
  });

  it("withholds a delta when the successful prompt-platform cohort changes", () => {
    const runs = [
      run("previous", "2026-07-14T00:00:00.000Z", 1),
      run("current", "2026-07-22T00:00:00.000Z", 1),
    ];
    const observations = [
      ...answer({
        runId: "previous",
        runStartedAt: "2026-07-14T00:00:00.000Z",
        answerId: "previous-answer",
        promptId: "prompt-a",
        model: "claude",
      }),
      ...answer({
        runId: "current",
        runStartedAt: "2026-07-22T00:00:00.000Z",
        answerId: "current-answer",
        promptId: "prompt-a",
        model: "chat_gpt",
      }),
    ];

    expect(build({ runs, observations }).comparison.status).toBe(
      "cohort_changed",
    );
  });

  it("withholds a delta when successful-answer coverage is below 80%", () => {
    const runs = [
      run("previous", "2026-07-14T00:00:00.000Z", 2),
      run("current", "2026-07-22T00:00:00.000Z", 4),
    ];
    const observations = [
      ...answer({
        runId: "previous",
        runStartedAt: "2026-07-14T00:00:00.000Z",
        answerId: "previous-a",
        promptId: "prompt-a",
        model: "chat_gpt",
      }),
      ...answer({
        runId: "previous",
        runStartedAt: "2026-07-14T00:00:00.000Z",
        answerId: "previous-b",
        promptId: "prompt-b",
        model: "chat_gpt",
      }),
      ...answer({
        runId: "current",
        runStartedAt: "2026-07-22T00:00:00.000Z",
        answerId: "current-a",
        promptId: "prompt-a",
        model: "chat_gpt",
      }),
      ...answer({
        runId: "current",
        runStartedAt: "2026-07-22T00:00:00.000Z",
        answerId: "current-b",
        promptId: "prompt-b",
        model: "chat_gpt",
      }),
    ];

    const result = build({ runs, observations });

    expect(result.metric.coveragePct).toBe(50);
    expect(result.comparison.status).toBe("coverage_too_low");
    expect(result.comparison.deltaPctPoints).toBeNull();
  });

  it("seeds Share of Voice competitors and excludes failed-only platforms", () => {
    const duplicateCompetitor = brand(
      "brand-rival-duplicate",
      "RIVAL",
      false,
      "2026-01-03T00:00:00.000Z",
    );
    duplicateCompetitor.normalizedName = "rival";
    const runs = [
      run("history", "2026-07-14T00:00:00.000Z", 1),
      run("current", "2026-07-22T00:00:00.000Z", 3),
    ];
    const observations = [
      ...answer({
        runId: "history",
        runStartedAt: "2026-07-14T00:00:00.000Z",
        answerId: "history-answer",
        promptId: "prompt-a",
        model: "chat_gpt",
      }),
      ...answer({
        runId: "current",
        runStartedAt: "2026-07-22T00:00:00.000Z",
        answerId: "current-chat",
        promptId: "prompt-a",
        model: "chat_gpt",
        mentionedBrandIds: [PRIMARY_ID],
      }),
      ...answer({
        runId: "current",
        runStartedAt: "2026-07-22T00:00:00.000Z",
        answerId: "current-claude",
        promptId: "prompt-a",
        model: "claude",
        mentionedBrandIds: [PRIMARY_ID],
      }),
      ...answer({
        runId: "current",
        runStartedAt: "2026-07-22T00:00:00.000Z",
        answerId: "current-failed",
        promptId: "prompt-a",
        model: "perplexity",
        status: "error",
      }),
    ];

    const result = build({
      runs,
      observations,
      brands: [...BRANDS, duplicateCompetitor],
    });

    expect(result.successfulModels).toEqual(["chat_gpt", "claude"]);
    expect(result.shareOfVoice).toEqual({
      platforms: ["chat_gpt", "claude"],
      entries: [
        {
          brandId: PRIMARY_ID,
          label: "Acme",
          isTarget: true,
          mentions: 2,
          sharePct: 100,
        },
        {
          brandId: COMPETITOR_ID,
          label: "Rival",
          isTarget: false,
          mentions: 0,
          sharePct: 0,
        },
      ],
    });
    expect(
      result.platforms.find((row) => row.key === "perplexity")?.metric,
    ).toMatchObject({ visibilityPct: null, failedAnswers: 1 });
  });

  it.each([7, 30, 90] as const)(
    "uses exact adjacent half-open %i-day windows",
    (windowDays) => {
      const result = buildVisibilityOverview({
        asOf: AS_OF,
        windowDays,
        runs: [],
        observations: [],
        brands: BRANDS,
      });
      const duration =
        new Date(result.period.currentEnd).getTime() -
        new Date(result.period.currentStart).getTime();

      expect(duration).toBe(windowDays * 24 * 60 * 60 * 1000);
      expect(result.period.previousEnd).toBe(result.period.currentStart);
    },
  );
});

function build({
  runs,
  observations,
  brands = BRANDS,
}: {
  runs: AnalyticsRunRow[];
  observations: AnalyticsObservationRow[];
  brands?: AnalyticsBrandRow[];
}) {
  return buildVisibilityOverview({
    asOf: AS_OF,
    windowDays: 7,
    runs,
    observations,
    brands,
  });
}

function run(
  id: string,
  startedAt: string,
  answersExpected: number,
): AnalyticsRunRow {
  return { id, startedAt, answersExpected };
}

function cohort(
  runId: string,
  runStartedAt: string,
  mentioned: boolean[],
): AnalyticsObservationRow[] {
  const dimensions = [
    ["prompt-a", "chat_gpt"],
    ["prompt-a", "claude"],
    ["prompt-b", "chat_gpt"],
    ["prompt-b", "claude"],
  ] as const;
  return dimensions.flatMap(([promptId, model], index) =>
    answer({
      runId,
      runStartedAt,
      answerId: `${runId}-${promptId}-${model}`,
      promptId,
      model,
      mentionedBrandIds: mentioned[index] ? [PRIMARY_ID] : [],
    }),
  );
}

function answer(input: {
  runId: string;
  runStartedAt: string;
  answerId: string;
  promptId: string;
  model: string;
  status?: "success" | "error";
  mentionedBrandIds?: string[];
}): AnalyticsObservationRow[] {
  const base: AnalyticsObservationRow = {
    runId: input.runId,
    runStartedAt: input.runStartedAt,
    answersExpected: 1,
    answerId: input.answerId,
    trackedPromptId: input.promptId,
    promptText:
      input.promptId === "prompt-a"
        ? "Which platform should I choose?"
        : "What is the best analytics tool?",
    model: input.model,
    modelName: `${input.model}-latest`,
    answerStatus: input.status ?? "success",
    topicId: input.promptId === "prompt-a" ? "topic-buying" : null,
    topicName: input.promptId === "prompt-a" ? "Buying guides" : null,
    mentionBrandId: null,
    mentionCount: null,
  };
  const brandIds = input.mentionedBrandIds ?? [];
  if (brandIds.length === 0) return [base];
  return brandIds.map((brandId) => ({
    ...base,
    mentionBrandId: brandId,
    mentionCount: 1,
  }));
}

function brand(
  id: string,
  name: string,
  isPrimary: boolean,
  createdAt: string,
): AnalyticsBrandRow {
  return {
    id,
    name,
    normalizedName: name.toLowerCase(),
    isPrimary,
    createdAt,
    archivedAt: null,
  };
}
