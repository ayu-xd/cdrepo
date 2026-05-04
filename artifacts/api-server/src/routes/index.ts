import { Router, type IRouter } from "express";
import healthRouter from "./health";
import schedulerRouter from "./scheduler";

const router: IRouter = Router();

router.use(healthRouter);
router.use(schedulerRouter);

export default router;
