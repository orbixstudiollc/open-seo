import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { projects } from "./app.schema";
import { organization, user } from "./better-auth-schema";

export const reportShares = sqliteTable(
  "report_shares",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    tokenDigest: text("token_digest").notNull(),
    reportVersion: integer("report_version").notNull().default(1),
    windowDays: integer("window_days").notNull(),
    purpose: text("purpose", { enum: ["manual", "digest"] })
      .notNull()
      .default("manual"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    expiresAt: text("expires_at").notNull(),
    revokedAt: text("revoked_at"),
  },
  (table) => [
    uniqueIndex("report_shares_token_digest_idx").on(table.tokenDigest),
    index("report_shares_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
    index("report_shares_expires_idx").on(table.expiresAt),
  ],
);

export const reportDigestSchedules = sqliteTable(
  "report_digest_schedules",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    recipientEmail: text("recipient_email").notNull(),
    windowDays: integer("window_days").notNull().default(30),
    cadence: text("cadence", { enum: ["weekly"] })
      .notNull()
      .default("weekly"),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
    nextSendAt: text("next_send_at"),
    lastSentAt: text("last_sent_at"),
    lastError: text("last_error"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    uniqueIndex("report_digest_schedules_project_user_idx").on(
      table.projectId,
      table.userId,
    ),
    index("report_digest_schedules_due_idx").on(
      table.enabled,
      table.nextSendAt,
    ),
  ],
);
