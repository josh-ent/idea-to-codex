import { createApp } from "./server/app.js";
import { configuredLogLevel, createLogger } from "./runtime/logging.js";

const port = Number(process.env.PORT ?? "3000");
const host = process.env.HOST ?? "127.0.0.1";
const logger = createLogger("server.startup");

createApp(process.cwd()).listen(port, host, () => {
  logger.info("server listening", {
    cwd: process.cwd(),
    host,
    log_level: configuredLogLevel(),
    node_env: process.env.NODE_ENV ?? "development",
    port,
    url: `http://${host}:${port}`,
  });
});
