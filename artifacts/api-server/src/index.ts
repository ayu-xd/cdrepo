import app from "./app";
import { logger } from "./lib/logger";
import cron from "node-cron";
import { runSchedulerForAllUsers } from "./lib/dm-scheduler";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Run daily task generation at midnight UTC every day
  cron.schedule("0 0 * * *", async () => {
    logger.info("Cron: midnight task generation triggered");
    try {
      await runSchedulerForAllUsers();
    } catch (err) {
      logger.error({ err }, "Cron: scheduler run failed");
    }
  });

  logger.info("Cron: daily scheduler registered (runs at 00:00 UTC)");
});
