export const mentionRegistryFixture = {
  brands: [
    {
      id: "clay",
      name: "Clay",
      normalizedName: "clay",
      archivedAt: null,
    },
    {
      id: "orbix",
      name: "Orbix",
      normalizedName: "orbix",
      archivedAt: null,
    },
    {
      id: "figma",
      name: "Figma",
      normalizedName: "figma",
      archivedAt: null,
    },
    {
      id: "wavespace",
      name: "Wavespace",
      normalizedName: "wavespace",
      archivedAt: null,
    },
    {
      id: "lazarev",
      name: "Lazarev",
      normalizedName: "lazarev",
      archivedAt: null,
    },
  ],
  aliases: [
    { brandId: "clay", alias: "Clay Global", archivedAt: null },
    { brandId: "orbix", alias: "Orbix Studio", archivedAt: null },
    {
      brandId: "wavespace",
      alias: "Wavespace Digital Agency",
      archivedAt: null,
    },
    { brandId: "lazarev", alias: "Lazarev.agency", archivedAt: null },
  ],
};

export const listicleAnswerFixture = `Here are three strong options:

1. **Clay Global** — The most dependable choice for focused product teams. Clay has consistently excellent craft.
2. **Orbix Studio** — Promising visual work, although its portfolio is narrower.
3. **Figma** — A neutral collaboration reference rather than an agency recommendation.

Sources include https://wavespace.agency/research.`;

export const tableAnswerFixture = `| Studio | Assessment |
| --- | --- |
| Wavespace Digital Agency | A reliable partner with excellent delivery. |
| Lazarev.agency | The team is expensive and support can be frustrating. |
| Clay Global | Clay is listed for comparison without a recommendation. |`;

export const sentimentGoldenFixture = [
  {
    mentionId: "positive",
    brandName: "Wavespace",
    answer:
      "Wavespace is a reliable partner with excellent delivery and is the strongest recommendation here.",
    sentiment: "positive" as const,
  },
  {
    mentionId: "negative",
    brandName: "Lazarev",
    answer:
      "Lazarev is expensive, support is frustrating, and I would not recommend it.",
    sentiment: "negative" as const,
  },
  {
    mentionId: "neutral",
    brandName: "Clay",
    answer:
      "Clay was founded in 2016 and appears in this comparison alongside two other agencies.",
    sentiment: "neutral" as const,
  },
];
