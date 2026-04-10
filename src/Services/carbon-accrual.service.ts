import CarbonCredits from "../Models/CarbonCredits";
import PracticeActivityLog from "../Models/PracticeActivityLogs";
import CarbonFactor from "../Models/CarbonFactor";
import Crop from "../Models/Crop";
import Farm from "../Models/Farm";
import FarmPractice from "../Models/FarmPractice";
import logger from "../Utils/logger";

type CreditStatus = "pending-verification" | "verified" | "issued" | "retired";

type CreditType = "accrual" | "final";

const DAY_MS = 1000 * 60 * 60 * 24;

const monthKey = (d: Date) => {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
};

const monthStartUTC = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
const nextMonthStartUTC = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 0, 0, 0, 0));

const clampDate = (d: Date, min: Date, max: Date) => {
  const t = d.getTime();
  return new Date(Math.max(min.getTime(), Math.min(max.getTime(), t)));
};

const diffDaysCeil = (a: Date, b: Date) => {
  // Days between [a,b) rounded up to include partial days
  const raw = (b.getTime() - a.getTime()) / DAY_MS;
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.ceil(raw));
};

const ensureFarmClimateZone = async (farm: any) => {
  if (farm.climateZone) return farm.climateZone;

  const lat = farm.location?.coordinates?.latitude;
  let zone: "tropical" | "arid" | "temperate" | "continental" | "polar" = "tropical";

  if (lat !== undefined) {
    const absLat = Math.abs(lat);
    if (absLat <= 23.5) zone = "tropical";
    else if (absLat <= 35) zone = "arid";
    else if (absLat <= 50) zone = "temperate";
    else if (absLat <= 66.5) zone = "continental";
    else zone = "polar";
  }

  farm.climateZone = zone;
  await farm.save();
  logger.info(`Auto-set climate zone to ${zone} for farm ${farm._id}`);
  return zone;
};

const resolveCarbonFactor = async (log: any, farm: any) => {
  const climateZone = await ensureFarmClimateZone(farm);

  let carbonFactor = 0.8; // Default base rate: tons/hectare/year

  const factor = await CarbonFactor.findOne({
    practiceId: log.practiceId,
    cropId: log.cropId,
    soilType: log.soilType,
    climateZone: climateZone || "tropical",
  });

  if (factor) return factor.carbonFactorPerHectarePerYear;

  // Dynamic fallback matching carbon.service.ts
  if (String(log.soilType || "").includes("clay") || String(log.soilType || "").includes("loamy")) carbonFactor *= 1.2;
  if (String(log.soilType || "").includes("sandy")) carbonFactor *= 0.9;

  const zone = String(farm.climateZone || "tropical").toLowerCase();
  if (zone === "tropical") carbonFactor *= 1.25;
  if (zone === "arid") carbonFactor *= 0.8;

  return carbonFactor;
};

const areaInHectares = (log: any) => (log.sizeUnit === "acres" ? Number(log.size || 0) * 0.404686 : Number(log.size || 0));

const computeCreditsForDays = (log: any, crop: any, carbonFactorPerYear: number, days: number) => {
  const years = days / 365.25;
  const hectares = areaInHectares(log);
  const cropMultiplier = Number(crop?.carbonMultiplier || 1.0);

  // Keep same buffer pool logic as carbon.service.ts
  const bufferMultiplier = 0.8;

  const carbonSequestered = hectares * carbonFactorPerYear * cropMultiplier * (years || 0);
  const creditsToIssue = carbonSequestered * bufferMultiplier;
  return Number(creditsToIssue.toFixed(6));
};

const listMonthlySpans = (start: Date, end: Date) => {
  const spans: Array<{ month: string; overlapStart: Date; overlapEnd: Date; days: number }> = [];

  let cursor = monthStartUTC(start);
  const endMonthStart = monthStartUTC(end);

  while (cursor.getTime() <= endMonthStart.getTime()) {
    const mStart = cursor;
    const mEnd = nextMonthStartUTC(cursor);

    const overlapStart = clampDate(start, mStart, mEnd);
    const overlapEnd = clampDate(end, mStart, mEnd);

    const days = diffDaysCeil(overlapStart, overlapEnd);

    spans.push({
      month: monthKey(mStart),
      overlapStart,
      overlapEnd,
      days,
    });

    cursor = mEnd;
  }

  return spans.filter((s) => s.days > 0);
};

export const upsertMonthlyAccrualForPracticeLog = async (practiceLogId: string, now = new Date()) => {
  const log = await PracticeActivityLog.findById(practiceLogId);
  if (!log) return;

  // Only accrue for not-failed logs that have started
  if (log.status === "failed") return;

  const effectiveEnd = new Date(Math.min(now.getTime(), new Date(log.endDate).getTime()));
  const start = new Date(log.startDate);
  if (start.getTime() > effectiveEnd.getTime()) return;

  const farm = await Farm.findById(log.farmId);
  if (!farm) return;

  const crop = await Crop.findById(log.cropId);
  if (!crop) return;

  const practice = await FarmPractice.findById(log.practiceId);
  if (!practice) return;

  // Additionality check (match carbon.service.ts)
  if (Array.isArray((farm as any).baselinePractices) && (farm as any).baselinePractices.includes(practice.name)) {
    return;
  }

  const factor = await resolveCarbonFactor(log, farm);

  // Accrue within the current month only (lightweight on creation); worker can backfill others.
  const currentMonthStart = monthStartUTC(effectiveEnd);
  const currentMonthEnd = nextMonthStartUTC(effectiveEnd);

  const overlapStart = clampDate(start, currentMonthStart, currentMonthEnd);
  const overlapEnd = clampDate(effectiveEnd, currentMonthStart, currentMonthEnd);
  const days = diffDaysCeil(overlapStart, overlapEnd);
  if (days <= 0) return;

  const creditsEarned = computeCreditsForDays(log, crop, factor, days);

  const mk = monthKey(currentMonthStart);

  const baseFilter = { practiceLogId: log._id, monthKey: mk, creditType: "accrual" as CreditType };

  // 1) Ensure the doc exists (and has required fields) without touching already verified/issued entries.
  await CarbonCredits.updateOne(
    baseFilter,
    {
      $setOnInsert: {
        farmId: log.farmId,
        practiceLogId: log._id,
        monthKey: mk,
        creditType: "accrual" as CreditType,
        status: "pending-verification" as CreditStatus,
        isEstimated: true,
        creditsEarned,
        periodStart: overlapStart,
        periodEnd: overlapEnd,
        issuedDate: overlapEnd,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    },
    { upsert: true }
  );

  // 2) Only update amounts while still pending-verification (never overwrite verified/issued credits).
  await CarbonCredits.updateOne(
    { ...baseFilter, status: "pending-verification" },
    {
      $set: {
        creditsEarned,
        periodStart: overlapStart,
        periodEnd: overlapEnd,
        issuedDate: overlapEnd,
        isEstimated: true,
        updatedAt: new Date(),
      },
    }
  );
};

export const backfillAccrualForPracticeLog = async (
  practiceLogId: string,
  opts: { targetStatus: CreditStatus; isEstimated: boolean; endOverride?: Date } = {
    targetStatus: "pending-verification",
    isEstimated: true,
  }
) => {
  const log = await PracticeActivityLog.findById(practiceLogId);
  if (!log) return { updated: 0 };
  if (log.status === "failed") return { updated: 0 };

  const start = new Date(log.startDate);
  const end = opts.endOverride ? new Date(opts.endOverride) : new Date(log.endDate);
  if (start.getTime() > end.getTime()) return { updated: 0 };

  const farm = await Farm.findById(log.farmId);
  if (!farm) return { updated: 0 };

  const crop = await Crop.findById(log.cropId);
  if (!crop) return { updated: 0 };

  const practice = await FarmPractice.findById(log.practiceId);
  if (!practice) return { updated: 0 };

  if (Array.isArray((farm as any).baselinePractices) && (farm as any).baselinePractices.includes(practice.name)) {
    return { updated: 0 };
  }

  const factor = await resolveCarbonFactor(log, farm);
  const spans = listMonthlySpans(start, end);
  if (spans.length === 0) return { updated: 0 };

  const allowedStatuses: CreditStatus[] =
    opts.targetStatus === "pending-verification"
      ? ["pending-verification"]
      : opts.targetStatus === "verified"
        ? ["pending-verification", "verified"]
        : ["pending-verification", "verified", "issued", "retired"];

  const ops: any[] = [];

  for (const s of spans) {
    const creditsEarned = computeCreditsForDays(log, crop, factor, s.days);
    const baseFilter = { practiceLogId: log._id, monthKey: s.month, creditType: "accrual" as CreditType };

    // Ensure the doc exists (no status condition) so we never create duplicates.
    ops.push({
      updateOne: {
        filter: baseFilter,
        update: {
          $setOnInsert: {
            farmId: log.farmId,
            practiceLogId: log._id,
            monthKey: s.month,
            creditType: "accrual" as CreditType,
            creditsEarned,
            status: opts.targetStatus,
            isEstimated: opts.isEstimated,
            periodStart: s.overlapStart,
            periodEnd: s.overlapEnd,
            issuedDate: s.overlapEnd,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
        upsert: true,
      },
    });

    // Only update if the current status is allowed (never downgrade issued/retired).
    ops.push({
      updateOne: {
        filter: { ...baseFilter, status: { $in: allowedStatuses } },
        update: {
          $set: {
            creditsEarned,
            status: opts.targetStatus,
            isEstimated: opts.isEstimated,
            periodStart: s.overlapStart,
            periodEnd: s.overlapEnd,
            issuedDate: s.overlapEnd,
            updatedAt: new Date(),
          },
        },
      },
    });
  }

  if (!ops.length) return { updated: 0 };
  const result = await CarbonCredits.bulkWrite(ops as any, { ordered: false });
  return { updated: (result as any).modifiedCount || 0 };
};

export const accrueActivePracticeCredits = async (now = new Date()) => {
  const activeLogs = await PracticeActivityLog.find({
    status: { $in: ["active", "pending_start", "pending_end"] },
    startDate: { $lte: now },
  }).select("_id");

  let processed = 0;
  for (const l of activeLogs) {
    try {
      await upsertMonthlyAccrualForPracticeLog(String((l as any)._id), now);
      processed += 1;
    } catch (e) {
      logger.error("Accrual failed for practice log", { practiceLogId: String((l as any)._id), error: e });
    }
  }

  return { processed };
};
