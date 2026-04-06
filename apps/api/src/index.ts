import { buildApp } from "./server.js";
import { env } from "./lib/config.js";

async function main() {
  const app = await buildApp();

  try {
    await app.listen({ port: env.PORT, host: "0.0.0.0" });
    app.log.info(`API listening on http://0.0.0.0:${env.PORT}`);
  } catch (error) {
    app.log.error(error, "failed to start api");
    process.exit(1);
  }
}

void main();

