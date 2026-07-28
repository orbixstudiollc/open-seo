import { and, desc, eq, gt, isNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { projects, reportDigestSchedules, reportShares } from "@/db/schema";

const tables = { projects, reportDigestSchedules, reportShares };

export function createReportRepository(
  database: typeof db,
  schema: typeof tables,
) {
  async function createShare(input: {
    id: string;
    projectId: string;
    organizationId: string;
    tokenDigest: string;
    reportVersion: number;
    windowDays: number;
    purpose: "manual" | "digest";
    createdBy: string;
    createdAt: string;
    expiresAt: string;
  }) {
    const [row] = await database
      .insert(schema.reportShares)
      .values(input)
      .returning();
    return row;
  }

  async function findActiveShareByDigest(input: {
    tokenDigest: string;
    now: string;
  }) {
    const [row] = await database
      .select({
        shareId: schema.reportShares.id,
        windowDays: schema.reportShares.windowDays,
        reportVersion: schema.reportShares.reportVersion,
        expiresAt: schema.reportShares.expiresAt,
        projectId: schema.projects.id,
        projectName: schema.projects.name,
        projectDomain: schema.projects.domain,
      })
      .from(schema.reportShares)
      .innerJoin(
        schema.projects,
        and(
          eq(schema.projects.id, schema.reportShares.projectId),
          eq(
            schema.projects.organizationId,
            schema.reportShares.organizationId,
          ),
        ),
      )
      .where(
        and(
          eq(schema.reportShares.tokenDigest, input.tokenDigest),
          eq(schema.reportShares.reportVersion, 1),
          isNull(schema.reportShares.revokedAt),
          gt(schema.reportShares.expiresAt, input.now),
          isNull(schema.projects.archivedAt),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async function listShares(input: {
    projectId: string;
    organizationId: string;
  }) {
    return database
      .select({
        id: schema.reportShares.id,
        windowDays: schema.reportShares.windowDays,
        purpose: schema.reportShares.purpose,
        createdAt: schema.reportShares.createdAt,
        expiresAt: schema.reportShares.expiresAt,
        revokedAt: schema.reportShares.revokedAt,
      })
      .from(schema.reportShares)
      .where(
        and(
          eq(schema.reportShares.projectId, input.projectId),
          eq(schema.reportShares.organizationId, input.organizationId),
        ),
      )
      .orderBy(
        desc(schema.reportShares.createdAt),
        desc(schema.reportShares.id),
      );
  }

  async function revokeShare(input: {
    shareId: string;
    projectId: string;
    organizationId: string;
    revokedAt: string;
  }) {
    const [row] = await database
      .update(schema.reportShares)
      .set({ revokedAt: input.revokedAt })
      .where(
        and(
          eq(schema.reportShares.id, input.shareId),
          eq(schema.reportShares.projectId, input.projectId),
          eq(schema.reportShares.organizationId, input.organizationId),
          isNull(schema.reportShares.revokedAt),
        ),
      )
      .returning({ id: schema.reportShares.id });
    return row ?? null;
  }

  async function getDigestSchedule(input: {
    projectId: string;
    organizationId: string;
    userId: string;
  }) {
    const [row] = await database
      .select()
      .from(schema.reportDigestSchedules)
      .where(
        and(
          eq(schema.reportDigestSchedules.projectId, input.projectId),
          eq(schema.reportDigestSchedules.organizationId, input.organizationId),
          eq(schema.reportDigestSchedules.userId, input.userId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async function upsertDigestSchedule(input: {
    id: string;
    projectId: string;
    organizationId: string;
    userId: string;
    recipientEmail: string;
    windowDays: number;
    enabled: boolean;
    nextSendAt: string | null;
    updatedAt: string;
  }) {
    const [row] = await database
      .insert(schema.reportDigestSchedules)
      .values({
        ...input,
        cadence: "weekly",
        createdAt: input.updatedAt,
      })
      .onConflictDoUpdate({
        target: [
          schema.reportDigestSchedules.projectId,
          schema.reportDigestSchedules.userId,
        ],
        set: {
          organizationId: input.organizationId,
          recipientEmail: input.recipientEmail,
          windowDays: input.windowDays,
          enabled: input.enabled,
          nextSendAt: input.nextSendAt,
          lastError: null,
          updatedAt: input.updatedAt,
        },
      })
      .returning();
    return row;
  }

  async function getDueDigestSchedules(now: string) {
    return database
      .select({
        id: schema.reportDigestSchedules.id,
        projectId: schema.reportDigestSchedules.projectId,
        organizationId: schema.reportDigestSchedules.organizationId,
        userId: schema.reportDigestSchedules.userId,
        recipientEmail: schema.reportDigestSchedules.recipientEmail,
        windowDays: schema.reportDigestSchedules.windowDays,
        nextSendAt: schema.reportDigestSchedules.nextSendAt,
        projectName: schema.projects.name,
        projectDomain: schema.projects.domain,
      })
      .from(schema.reportDigestSchedules)
      .innerJoin(
        schema.projects,
        and(
          eq(schema.projects.id, schema.reportDigestSchedules.projectId),
          eq(
            schema.projects.organizationId,
            schema.reportDigestSchedules.organizationId,
          ),
        ),
      )
      .where(
        and(
          eq(schema.reportDigestSchedules.enabled, true),
          lte(schema.reportDigestSchedules.nextSendAt, now),
          isNull(schema.projects.archivedAt),
        ),
      )
      .orderBy(schema.reportDigestSchedules.nextSendAt)
      .limit(25);
  }

  async function claimDigestSchedule(input: {
    id: string;
    expectedNextSendAt: string;
    now: string;
    nextSendAt: string;
  }) {
    const [row] = await database
      .update(schema.reportDigestSchedules)
      .set({
        nextSendAt: input.nextSendAt,
        lastError: null,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(schema.reportDigestSchedules.id, input.id),
          eq(schema.reportDigestSchedules.enabled, true),
          eq(schema.reportDigestSchedules.nextSendAt, input.expectedNextSendAt),
          lte(schema.reportDigestSchedules.nextSendAt, input.now),
        ),
      )
      .returning({ id: schema.reportDigestSchedules.id });
    return Boolean(row);
  }

  async function recordDigestSuccess(id: string, sentAt: string) {
    await database
      .update(schema.reportDigestSchedules)
      .set({ lastSentAt: sentAt, lastError: null, updatedAt: sentAt })
      .where(eq(schema.reportDigestSchedules.id, id));
  }

  async function recordDigestFailure(
    id: string,
    failedAt: string,
    errorCode: string,
  ) {
    await database
      .update(schema.reportDigestSchedules)
      .set({
        lastError: errorCode.slice(0, 160),
        updatedAt: failedAt,
      })
      .where(eq(schema.reportDigestSchedules.id, id));
  }

  return {
    createShare,
    findActiveShareByDigest,
    listShares,
    revokeShare,
    getDigestSchedule,
    upsertDigestSchedule,
    getDueDigestSchedules,
    claimDigestSchedule,
    recordDigestSuccess,
    recordDigestFailure,
  } as const;
}

export const ReportRepository = createReportRepository(db, tables);
