type MentionRegistry = {
  brands: Array<{
    id: string;
    name: string;
    normalizedName: string;
    archivedAt: string | null;
  }>;
  aliases: Array<{
    brandId: string;
    alias: string;
    archivedAt: string | null;
  }>;
};

type DetectedBrandMention = {
  brandId: string;
  rawName: string;
  normalizedName: string;
  mentionCount: number;
  position: number;
  firstOccurrenceStart: number;
  firstOccurrenceEnd: number;
};

type CandidateMatch = {
  brandId: string;
  rawName: string;
  start: number;
  end: number;
};

const TOKEN_CHARACTER = /[\p{L}\p{N}_]/u;

export function detectRegisteredBrandMentions(
  text: string,
  registry: MentionRegistry,
): DetectedBrandMention[] {
  const ignoredRanges = urlRanges(text);
  const activeBrands = registry.brands.filter((brand) => !brand.archivedAt);
  const activeBrandIds = new Set(activeBrands.map((brand) => brand.id));
  const namesByBrand = new Map<string, Set<string>>();
  for (const brand of activeBrands) {
    namesByBrand.set(brand.id, new Set([brand.name]));
  }
  for (const alias of registry.aliases) {
    if (alias.archivedAt || !activeBrandIds.has(alias.brandId)) continue;
    namesByBrand.get(alias.brandId)?.add(alias.alias);
  }

  const matches: CandidateMatch[] = [];
  for (const [brandId, names] of namesByBrand) {
    for (const name of [...names].toSorted((a, b) => b.length - a.length)) {
      if (!name.trim()) continue;
      const pattern = literalMentionPattern(name);
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const start = match.index;
        const end = start + match[0].length;
        if (
          ignoredRanges.some((range) => start < range.end && end > range.start)
        ) {
          continue;
        }
        matches.push({
          brandId,
          rawName: match[0],
          start,
          end,
        });
      }
    }
  }

  const accepted = discardOverlappingMatches(matches);
  const byBrand = new Map<
    string,
    { first: CandidateMatch; mentionCount: number }
  >();
  for (const match of accepted) {
    const current = byBrand.get(match.brandId);
    if (!current) {
      byBrand.set(match.brandId, { first: match, mentionCount: 1 });
    } else {
      current.mentionCount += 1;
    }
  }

  const orderedBrands = [...byBrand.entries()].toSorted((a, b) => {
    const occurrenceOrder = a[1].first.start - b[1].first.start;
    return occurrenceOrder || a[0].localeCompare(b[0]);
  });
  const brandById = new Map(activeBrands.map((brand) => [brand.id, brand]));
  return orderedBrands.flatMap(([brandId, aggregate], index) => {
    const brand = brandById.get(brandId);
    if (!brand) return [];
    return [
      {
        brandId,
        rawName: aggregate.first.rawName,
        normalizedName: normalizeName(brand.normalizedName),
        mentionCount: aggregate.mentionCount,
        position: index + 1,
        firstOccurrenceStart: aggregate.first.start,
        firstOccurrenceEnd: aggregate.first.end,
      },
    ];
  });
}

function discardOverlappingMatches(matches: CandidateMatch[]) {
  const ordered = matches.toSorted((a, b) => {
    const startOrder = a.start - b.start;
    const lengthOrder = b.end - b.start - (a.end - a.start);
    return startOrder || lengthOrder || a.brandId.localeCompare(b.brandId);
  });
  const accepted: CandidateMatch[] = [];
  for (const candidate of ordered) {
    if (
      accepted.some(
        (existing) =>
          candidate.start < existing.end && candidate.end > existing.start,
      )
    ) {
      continue;
    }
    accepted.push(candidate);
  }
  return accepted.toSorted((a, b) => a.start - b.start);
}

function literalMentionPattern(name: string): RegExp {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const first = name[0];
  const last = name.at(-1);
  const leading =
    first && TOKEN_CHARACTER.test(first) ? "(?<![\\p{L}\\p{N}_])" : "";
  const trailing =
    last && TOKEN_CHARACTER.test(last) ? "(?![\\p{L}\\p{N}_])" : "";
  return new RegExp(`${leading}${escaped}${trailing}`, "giu");
}

function normalizeName(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/gu, " ");
}

function urlRanges(text: string): Array<{ start: number; end: number }> {
  return [...text.matchAll(/https?:\/\/[^\s)\]}]+/giu)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
}
