import { Router } from "express";
import { getFarmRisk, getRiskHistory, getCurrentWeather, triggerWeatherSync } from "../Controllers/weather.controller";
import { authenticate } from "../Middlewares/auth.middleware";


const router = Router();


router.get(
  "/current",
  authenticate as any,
  getCurrentWeather as any
);

router.get(
  "/risk",
  authenticate as any,
  getFarmRisk as any
);

router.get(
  "/history",
  authenticate as any,
  getRiskHistory as any
);

router.post(
  "/sync",
  authenticate as any,
  triggerWeatherSync as any
);

export default router;
