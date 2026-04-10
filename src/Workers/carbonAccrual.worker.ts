import logger from "../Utils/logger";
import { accrueActivePracticeCredits } from "../Services/carbon-accrual.service";

const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

export const initCarbonAccrualWorker = () => {
  const intervalMs = Number(process.env.CARBON_ACCRUAL_INTERVAL_MS || DEFAULT_INTERVAL_MS);

  const run = async () => {
    try {
      const res = await accrueActivePracticeCredits(new Date());
      logger.info("Carbon accrual run completed", res);
    } catch (e) {
      logger.error("Carbon accrual run failed", e);
    }
  };

  // Run once on startup
  run();

  setInterval(run, intervalMs);
  logger.info(`Carbon accrual worker started (interval: ${intervalMs}ms)`);
};
