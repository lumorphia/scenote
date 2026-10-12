import type { Database } from "@lumorphia-scenote/db";

/** ジョブの名前。投入は API、実行は worker (lumorphia/accounts と同じ形) */
export const JOB_NAMES = ["image-process", "image-delete", "upload-cleanup"] as const;
export type JobName = (typeof JOB_NAMES)[number];

export type EnqueueOptions = {
  startAfterSeconds?: number;
  singletonKey?: string;
  retryLimit?: number;
  /** 行の変更とジョブを同じトランザクションで確定させる */
  transaction?: Database;
};

export interface JobQueue {
  enqueue(name: JobName, data: object, opts?: EnqueueOptions): Promise<void>;
}

/** 単体テスト用。DB との原子性は pg-boss の結合テストで確かめる */
export class MemoryJobQueue implements JobQueue {
  readonly jobs: { name: JobName; data: object; opts: Omit<EnqueueOptions, "transaction"> }[] = [];
  async enqueue(name: JobName, data: object, opts: EnqueueOptions = {}) {
    const { transaction: _transaction, ...view } = opts;
    this.jobs.push({ name, data, opts: view });
  }
  ofType(name: JobName) {
    return this.jobs.filter((j) => j.name === name);
  }
}
