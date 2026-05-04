import { Router } from "express";
import { runSchedulerForAllUsers } from "../lib/dm-scheduler";

const router = Router();

// POST /api/scheduler/run — secured with SCHEDULER_SECRET header
// Used for manual triggers or external cron pings (e.g. UptimeRobot, cron-job.org)
router.post("/scheduler/run", async (req, res) => {
  const secret = process.env["SCHEDULER_SECRET"];
  const provided = req.headers["x-scheduler-secret"] ?? req.body?.secret;

  if (!secret || provided !== secret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    await runSchedulerForAllUsers();
    res.json({ ok: true });
  } catch (err: any) {
    req.log.error({ err }, "Scheduler run failed");
    res.status(500).json({ error: err.message });
  }
});

export default router;
