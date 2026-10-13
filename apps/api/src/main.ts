import { buildServer } from "./server";

const server = buildServer({
  autoTradingEnabled: false,
  startAutoTradingLoop: true
});

const host = process.env.ITRADE_HOST ?? "127.0.0.1";
const port = Number(process.env.ITRADE_PORT ?? "8787");

// Graceful shutdown on SIGTERM/SIGINT
const shutdown = async () => {
  console.log("Shutting down gracefully...");
  await server.close();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Top-level error handlers
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});
process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  void shutdown();
});

await server.listen({ host, port });
console.log(`iTrade API listening on http://${host}:${port}`);
