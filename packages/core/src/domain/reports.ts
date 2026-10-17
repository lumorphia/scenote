import { and, asc, desc, eq } from "drizzle-orm";
import { schema, type Database } from "@lumorphia-scenote/db";
import type { JobQueue } from "../jobs/queue.ts";
import { recordAdminAction } from "./admin.ts";
import { DomainError } from "./errors.ts";
import { canView, type Visibility } from "./posts.ts";
import { hidePostTx, publishPostTx } from "./review.ts";

export const REPORT_REASONS = ["rights", "depicted", "terms"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export const MAX_REPORT_DETAIL_LENGTH = 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 通報する (ADR-0021)。ログインした人が、見えている (canView) 他人の投稿だけ。
 * 同じ人が同じ投稿を、対応待ちのまま二重に通報できない
 */
export async function createReport(
  { db }: { db: Database },
  reporterId: string,
  postId: string,
  input: { reason: ReportReason; detail?: string | null | undefined },
): Promise<void> {
  if (!REPORT_REASONS.includes(input.reason)) throw new DomainError("validation", "unknown reason");
  const detail = input.detail?.trim() || null;
  if (detail && [...detail].length > MAX_REPORT_DETAIL_LENGTH)
    throw new DomainError("validation", "detail is too long");
  if (!UUID.test(postId)) throw new DomainError("not_found", "post not found");
  const [row] = await db
    .select({ post: schema.posts, authorStatus: schema.users.status })
    .from(schema.posts)
    .innerJoin(schema.users, eq(schema.users.id, schema.posts.userId))
    .where(eq(schema.posts.id, postId));
  if (!row || !canView(row.post, row.authorStatus, reporterId))
    throw new DomainError("not_found", "post not found");
  if (row.post.userId === reporterId)
    throw new DomainError("validation", "you cannot report your own post");
  const inserted = await db
    .insert(schema.reports)
    .values({ postId, reporterId, reason: input.reason, detail })
    .onConflictDoNothing()
    .returning({ id: schema.reports.id });
  if (inserted.length === 0) throw new DomainError("conflict", "already reported");
}

export type OpenReport = {
  id: string;
  postId: string;
  reason: ReportReason;
  detail: string | null;
  createdAt: Date;
  post: {
    status: string;
    visibility: Visibility;
    title: string | null;
    author: { handle: string; name: string };
  };
};

/** 対応待ちの通報を古い順に。通報した人は見せない */
export async function listOpenReports({ db }: { db: Database }): Promise<OpenReport[]> {
  const rows = await db
    .select({
      report: schema.reports,
      post: schema.posts,
      handle: schema.users.handle,
      name: schema.users.name,
    })
    .from(schema.reports)
    .innerJoin(schema.posts, eq(schema.posts.id, schema.reports.postId))
    .innerJoin(schema.users, eq(schema.users.id, schema.posts.userId))
    .where(eq(schema.reports.status, "open"))
    .orderBy(asc(schema.reports.createdAt), asc(schema.reports.id));
  return rows.map(({ report, post, handle, name }) => ({
    id: report.id,
    postId: report.postId,
    reason: report.reason,
    detail: report.detail,
    createdAt: report.createdAt,
    post: {
      status: post.status,
      visibility: post.visibility,
      title: post.title,
      author: { handle, name },
    },
  }));
}

/** 対応待ちの通報を FOR UPDATE で読む。無ければ not_found、閉じていれば conflict */
async function lockOpenReport(tx: Database, reportId: string) {
  if (!UUID.test(reportId)) throw new DomainError("not_found", "report not found");
  const [report] = await tx
    .select()
    .from(schema.reports)
    .where(eq(schema.reports.id, reportId))
    .for("update");
  if (!report) throw new DomainError("not_found", "report not found");
  if (report.status !== "open") throw new DomainError("conflict", "report is already closed");
  return report;
}

/**
 * 通報された投稿を非表示にする。その投稿への対応待ちの通報は全部閉じる。
 * 記録は投稿を非表示にした操作として 1 行 (post_hidden)
 */
export async function hideReportedPost(
  { db, jobs }: { db: Database; jobs: JobQueue },
  adminSub: string,
  reportId: string,
  reason: string,
  now: Date = new Date(),
): Promise<void> {
  await db.transaction(async (tx) => {
    const report = await lockOpenReport(tx, reportId);
    const [post] = await tx
      .select()
      .from(schema.posts)
      .where(eq(schema.posts.id, report.postId))
      .for("update");
    await recordAdminAction(tx, {
      adminSub,
      action: "post_hidden",
      targetType: "post",
      targetId: report.postId,
      reason,
      at: now,
    });
    if (post!.status !== "hidden") await hidePostTx(tx, jobs, post!, now);
    await tx
      .update(schema.reports)
      .set({ status: "hidden", closedAt: now })
      .where(and(eq(schema.reports.postId, report.postId), eq(schema.reports.status, "open")));
  });
}

/** 通報を退ける。その通報だけを閉じ、投稿はそのまま */
export async function dismissReport(
  { db }: { db: Database },
  adminSub: string,
  reportId: string,
  reason: string,
  now: Date = new Date(),
): Promise<void> {
  await db.transaction(async (tx) => {
    await lockOpenReport(tx, reportId);
    await recordAdminAction(tx, {
      adminSub,
      action: "report_dismissed",
      targetType: "report",
      targetId: reportId,
      reason,
      at: now,
    });
    await tx
      .update(schema.reports)
      .set({ status: "dismissed", closedAt: now })
      .where(eq(schema.reports.id, reportId));
  });
}

export type HiddenPost = {
  id: string;
  visibility: Visibility;
  title: string | null;
  author: { handle: string; name: string };
  reviewedAt: Date | null;
};

/** 運営が非表示にした投稿を、新しく非表示にした順に */
export async function listHiddenPosts({ db }: { db: Database }): Promise<HiddenPost[]> {
  const rows = await db
    .select({ post: schema.posts, handle: schema.users.handle, name: schema.users.name })
    .from(schema.posts)
    .innerJoin(schema.users, eq(schema.users.id, schema.posts.userId))
    .where(eq(schema.posts.status, "hidden"))
    .orderBy(desc(schema.posts.reviewedAt), desc(schema.posts.id));
  return rows.map(({ post, handle, name }) => ({
    id: post.id,
    visibility: post.visibility,
    title: post.title,
    author: { handle, name },
    reviewedAt: post.reviewedAt,
  }));
}

/** 非表示を戻す。公開して、画像を公開範囲どおりの置き場所へ移す */
export async function restorePost(
  { db, jobs }: { db: Database; jobs: JobQueue },
  adminSub: string,
  postId: string,
  reason: string,
  now: Date = new Date(),
): Promise<void> {
  if (!UUID.test(postId)) throw new DomainError("not_found", "post not found");
  await db.transaction(async (tx) => {
    const [post] = await tx
      .select()
      .from(schema.posts)
      .where(eq(schema.posts.id, postId))
      .for("update");
    if (!post) throw new DomainError("not_found", "post not found");
    if (post.status !== "hidden") throw new DomainError("conflict", "post is not hidden");
    await recordAdminAction(tx, {
      adminSub,
      action: "post_restored",
      targetType: "post",
      targetId: postId,
      reason,
      at: now,
    });
    await publishPostTx(tx, jobs, post, now);
  });
}
