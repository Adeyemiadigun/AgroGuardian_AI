import { Router } from "express";
import {
  getLivestockController,
  getSingleLivestockController,
  createLivestockController,
  updateLivestockController,
  addWeightController,
  deleteLivestockController,
  getLivestockStatsController,
  getAllUserLivestockController,
  getLivestockDashboardSummaryController
} from "../Controllers/livestock.controller";
import {
  getLivestockHealthCheckController,
  recomputeLivestockHealthCheckController
} from "../Controllers/livestock-health-check.controller";
import { authenticate } from "../Middlewares/auth.middleware";
import upload from "../Middlewares/upload.middleware";

const router = Router();

// Get all livestock for the authenticated user (across all farms)
router.get(
  "/",
  authenticate as any,
  getAllUserLivestockController as any
);

// Dashboard summary across all farms
router.get(
  "/dashboard-summary",
  authenticate as any,
  getLivestockDashboardSummaryController as any
);

// Get livestock statistics for a farm
router.get(
  "/farms/:farmId/stats",
  authenticate as any,
  getLivestockStatsController as any
);

// Get all livestock for a specific farm
router.get(
  "/farms/:farmId",
  authenticate as any,
  getLivestockController as any
);

// Health-check report (latest)
router.get(
  "/:livestockId/health-check",
  authenticate as any,
  getLivestockHealthCheckController as any
);

// Trigger recompute (async)
router.post(
  "/:livestockId/health-check/recompute",
  authenticate as any,
  recomputeLivestockHealthCheckController as any
);

// Get single livestock by ID
router.get(
  "/:livestockId",
  authenticate as any,
  getSingleLivestockController as any
);

// Create new livestock (with optional image)
router.post(
  "/",
  authenticate as any,
  upload.single("image"),
  createLivestockController as any
);

// Update livestock (with optional image)
router.put(
  "/:livestockId",
  authenticate as any,
  upload.single("image"),
  updateLivestockController as any
);

// Add weight record
router.post(
  "/:livestockId/weight",
  authenticate as any,
  addWeightController as any
);

// Delete livestock
router.delete(
  "/:livestockId",
  authenticate as any,
  deleteLivestockController as any
);

export default router;
