import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import { AsyncLocalStorage } from "node:async_hooks";

export type PrismaQueryMetrics = {
  count: number;
  durationMs: number;
};

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly queryMetricsStorage = new AsyncLocalStorage<PrismaQueryMetrics>();

  constructor() {
    const diagnosticsEnabled = process.env.PERFORMANCE_DIAGNOSTICS === "1";
    super(diagnosticsEnabled ? { log: [{ emit: "event", level: "query" }] } : {});
    if (diagnosticsEnabled) {
      const registerQueryListener = this.$on as unknown as (
        event: "query",
        callback: (query: Prisma.QueryEvent) => void,
      ) => void;
      registerQueryListener.call(this, "query", (query) => {
        const metrics = this.queryMetricsStorage.getStore();
        if (!metrics) return;
        metrics.count += 1;
        metrics.durationMs += query.duration;
      });
    }
  }

  async measureQueries<T>(
    operation: () => Promise<T>,
  ): Promise<{ result: T; metrics: PrismaQueryMetrics | null }> {
    if (process.env.PERFORMANCE_DIAGNOSTICS !== "1") {
      return { result: await operation(), metrics: null };
    }
    const metrics: PrismaQueryMetrics = { count: 0, durationMs: 0 };
    const result = await this.queryMetricsStorage.run(metrics, operation);
    return {
      result,
      metrics: {
        count: metrics.count,
        durationMs: Number(metrics.durationMs.toFixed(3)),
      },
    };
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
