import type { BrandResolutionRepository } from "./BrandResolutionRepository";
import {
  BRAND_RESOLUTION_RULE_VERSION,
  normalizeBrandCandidate,
} from "./brandResolutionEngine";
import { replacementFor } from "./brandResolutionRules";
import { AppError } from "@/server/lib/errors";

type Repository = typeof BrandResolutionRepository;

export type RegistrySetupInput = {
  projectId: string;
  primary: { name: string; domain: string };
  competitors: Array<{ name: string; domain?: string }>;
};

export async function configureBrandRegistry(
  repository: Repository,
  input: RegistrySetupInput,
  actorId: string,
) {
  const configured = [
    { ...input.primary, isPrimary: true },
    ...input.competitors.map((competitor) => ({
      ...competitor,
      domain: competitor.domain ?? null,
      isPrimary: false,
    })),
  ].map((brand) => ({
    id: crypto.randomUUID(),
    name: brand.name.trim(),
    normalizedName: normalizeBrandCandidate(brand.name),
    domain: brand.domain,
    isPrimary: brand.isPrimary,
  }));
  const normalizedNames = configured.map((brand) => brand.normalizedName);
  if (
    normalizedNames.some((name) => name.length === 0) ||
    new Set(normalizedNames).size !== normalizedNames.length
  ) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Primary and competitor brand names must be distinct",
    );
  }

  const registry = await repository.configureBrands(
    input.projectId,
    configured,
  );
  const activeByName = new Map(
    registry.brands
      .filter((brand) => !brand.archivedAt)
      .map((brand) => [brand.normalizedName, brand]),
  );
  await repository.replaceRules(
    input.projectId,
    configured.map((brand) => {
      const canonical = activeByName.get(brand.normalizedName);
      if (!canonical) {
        throw new Error("Failed to resolve configured canonical AI brand");
      }
      return replacementFor({
        projectId: input.projectId,
        normalizedName: brand.normalizedName,
        createdBy: actorId,
        decision: {
          state: "resolved",
          brandId: canonical.id,
          source: "manual",
          ruleVersion: BRAND_RESOLUTION_RULE_VERSION,
          confidence: 1,
          reason: "Configured in the AI visibility setup wizard",
          evidence: [
            {
              kind: "manual_reason",
              value: "Configured in the AI visibility setup wizard",
            },
          ],
        },
      });
    }),
  );

  return {
    primaryBrand:
      registry.brands.find((brand) => brand.isPrimary && !brand.archivedAt) ??
      null,
    competitors: registry.brands.filter(
      (brand) => !brand.isPrimary && !brand.archivedAt,
    ),
  };
}
