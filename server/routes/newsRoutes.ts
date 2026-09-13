import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { LocalFinBERTEngine, NewsCatalystRegistry, NewsIngestionService, NewsArticle } from "../../src/domain/newsEngine";

const analyzeHeadlineSchema = z.object({
  headline: z.string().min(3).max(500),
  summary: z.string().max(2000).optional(),
});

const ingestHeadlineSchema = z.object({
  headline: z.string().min(3).max(500),
  summary: z.string().max(2000).optional(),
  source: z.enum(["BSE_ANNOUNCEMENTS", "NSE_ANNOUNCEMENTS", "GOOGLE_NEWS", "MONEYCONTROL", "ECONOMIC_TIMES", "MANUAL_TEST"]).optional(),
});

export async function registerNewsRoutes(server: FastifyInstance): Promise<void> {
  // 1. Get live news feed
  server.get("/api/news/feed", async (req: FastifyRequest, reply: FastifyReply) => {
    const feed = NewsCatalystRegistry.getRecentFeed(50);
    return reply.send({
      success: true,
      count: feed.length,
      feed,
    });
  });

  // 2. Get specific ticker sentiment and veto status
  server.get("/api/news/ticker/:symbol", async (req: FastifyRequest<{ Params: { symbol: string } }>, reply: FastifyReply) => {
    const { symbol } = req.params;
    if (!symbol) {
      return reply.code(400).send({ error: "Symbol required" });
    }
    const status = NewsCatalystRegistry.getTickerStatus(symbol);
    return reply.send({
      success: true,
      status,
    });
  });

  // 3. Real-time FinBERT headline analysis (Interactive Simulator)
  server.post("/api/news/analyze", async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = analyzeHeadlineSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid payload", details: parsed.error.issues });
    }

    const { headline, summary } = parsed.data;
    const article: NewsArticle = {
      id: "sim_" + Date.now(),
      headline,
      summary,
      source: "MANUAL_TEST",
      publishedAt: Date.now(),
    };

    const analysis = LocalFinBERTEngine.analyze(article);
    return reply.send({
      success: true,
      analysis,
    });
  });

  // 4. Ingest headline into live registry (to test live veto/catalyst execution)
  server.post("/api/news/ingest-test", async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = ingestHeadlineSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid payload", details: parsed.error.issues });
    }

    const { headline, summary, source } = parsed.data;
    const article: NewsArticle = {
      id: "test_" + Date.now(),
      headline,
      summary,
      source: source || "MANUAL_TEST",
      publishedAt: Date.now(),
    };

    const analysis = LocalFinBERTEngine.analyze(article);
    NewsCatalystRegistry.ingest(analysis);

    return reply.send({
      success: true,
      message: "Headline analyzed and ingested into live catalyst registry",
      analysis,
    });
  });

  // 5. Force poll free news feeds
  server.post("/api/news/poll-now", async (req: FastifyRequest, reply: FastifyReply) => {
    const ingested = await NewsIngestionService.pollAllFeeds();
    return reply.send({
      success: true,
      ingestedCount: ingested,
      status: NewsIngestionService.getStatus(),
    });
  });
}
