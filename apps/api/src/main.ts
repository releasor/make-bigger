import { buildServer } from "./server";

const server = buildServer();

await server.listen({ host: "127.0.0.1", port: 8787 });
console.log("iTrade API listening on http://127.0.0.1:8787");
