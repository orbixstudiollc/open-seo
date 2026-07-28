import { describe, expect, it } from "vitest";
import {
  buildGscPromptSuggestions,
  buildTopicGapSuggestions,
  gscQueryToPrompt,
} from "./aiPromptSuggestions";

const definition = {
  topics: [
    {
      id: "topic_crm",
      name: "CRM",
      normalizedName: "crm",
      archivedAt: null,
    },
  ],
  prompts: [
    {
      topicId: "topic_crm",
      normalizedPrompt: "What are the best options for CRM?",
      state: "rejected" as const,
      archivedAt: null,
    },
  ],
};

describe("AI prompt suggestion shaping", () => {
  it("turns only question and comparison-shaped GSC queries into prompts", () => {
    expect(gscQueryToPrompt("how to choose a crm")).toBe(
      "How to choose a crm?",
    );
    expect(gscQueryToPrompt("acme vs contoso")).toBe(
      "Compare options for acme vs contoso.",
    );
    expect(gscQueryToPrompt("best crm for agencies")).toBe(
      "What are the best crm for agencies?",
    );
    expect(gscQueryToPrompt("acme login")).toBeNull();
  });

  it("ranks GSC demand, maps topics, and never repeats a rejected prompt", () => {
    const suggestions = buildGscPromptSuggestions(
      [
        {
          keys: ["what are the best options for crm"],
          clicks: 5,
          impressions: 500,
          ctr: 0.01,
          position: 8,
        },
        {
          keys: ["crm vs spreadsheets"],
          clicks: 3,
          impressions: 300,
          ctr: 0.01,
          position: 6,
        },
        {
          keys: ["crm login"],
          clicks: 50,
          impressions: 1_000,
          ctr: 0.05,
          position: 1,
        },
        {
          keys: ["how does crm work"],
          clicks: 2,
          impressions: 200,
          ctr: 0.01,
          position: 9,
        },
      ],
      definition,
    );

    expect(suggestions).toEqual([
      {
        prompt: "Compare options for crm vs spreadsheets.",
        topicId: "topic_crm",
        source: "gsc",
      },
      {
        prompt: "How does crm work?",
        topicId: "topic_crm",
        source: "gsc",
      },
    ]);
  });

  it("fills topic coverage without resurfacing rejected templates", () => {
    expect(buildTopicGapSuggestions(definition)).toEqual([
      {
        prompt: "How do buyers compare solutions for CRM?",
        topicId: "topic_crm",
        source: "topic_gap",
      },
      {
        prompt:
          "What should someone consider when choosing a solution for CRM?",
        topicId: "topic_crm",
        source: "topic_gap",
      },
    ]);
  });
});
