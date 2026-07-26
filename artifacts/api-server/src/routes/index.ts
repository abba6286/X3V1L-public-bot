import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import botWebhookRouter from "./botWebhook.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(botWebhookRouter);

export default router;
