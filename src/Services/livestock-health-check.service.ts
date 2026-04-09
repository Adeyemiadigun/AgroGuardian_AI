import { Types } from 'mongoose';
import Livestock from '../Models/Livestock';
import Farm from '../Models/Farm';
import WeatherData from '../Models/WeatherData';
import logger from '../Utils/logger';
import { LivestockVaccination, LivestockTreatment, LivestockIllness, LivestockDeworming, LivestockDiagnosis } from '../Models/LivestockHealth';
import { LivestockHealthCheckReport } from '../Models/LivestockHealthCheck';
import { chatWithContext, getModelName } from '../Utils/geminiClient';
import { extractJsonFromLLM } from '../Utils/llmJson';
import { z } from 'zod';
import type { ILivestock } from '../Types/livestock.types';

export type HealthCheckStatus = 'ok' | 'warning' | 'critical' | 'unknown';

type RecomputeOptions = {
  reason?: string;
  useAI?: boolean;
};

const HealthCheckAiEnhancementSchema = z.object({
  aiSummary: z.string().optional(),
  overallStatus: z.enum(['ok', 'warning', 'critical', 'unknown']).optional(),
  checks: z
    .array(
      z.object({
        key: z.string(),
        status: z.enum(['ok', 'warning', 'critical', 'unknown']).optional(),
        findings: z.array(z.string()).optional(),
        recommendations: z.array(z.string()).optional(),
      })
    )
    .optional(),
  flags: z.array(z.string()).optional(),
});

const STATUS_RANK: Record<HealthCheckStatus, number> = {
  ok: 0,
  unknown: 1,
  warning: 2,
  critical: 3,
};

const maxStatus = (a: HealthCheckStatus, b: HealthCheckStatus): HealthCheckStatus =>
  STATUS_RANK[a] >= STATUS_RANK[b] ? a : b;

const safeDate = (d: any): Date | undefined => {
  if (!d) return undefined;
  const dt = new Date(d);
  return Number.isFinite(dt.getTime()) ? dt : undefined;
};

const daysBetween = (a: Date, b: Date) => Math.floor((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));

const poultryBroilerExpectedKgByWeek: Array<{ week: number; min: number; max: number }> = [
  { week: 1, min: 0.12, max: 0.22 },
  { week: 2, min: 0.28, max: 0.45 },
  { week: 3, min: 0.55, max: 0.85 },
  { week: 4, min: 0.90, max: 1.30 },
  { week: 5, min: 1.25, max: 1.80 },
  { week: 6, min: 1.60, max: 2.40 },
  { week: 7, min: 2.00, max: 3.00 },
  { week: 8, min: 2.30, max: 3.60 },
];

const poultryNoilerExpectedKgByWeek: Array<{ week: number; min: number; max: number }> = [
  { week: 1, min: 0.07, max: 0.14 },
  { week: 2, min: 0.15, max: 0.25 },
  { week: 3, min: 0.25, max: 0.40 },
  { week: 4, min: 0.40, max: 0.60 },
  { week: 5, min: 0.55, max: 0.80 },
  { week: 6, min: 0.70, max: 1.00 },
  { week: 7, min: 0.85, max: 1.20 },
  { week: 8, min: 1.00, max: 1.40 },
  { week: 9, min: 1.15, max: 1.60 },
  { week: 10, min: 1.30, max: 1.80 },
  { week: 11, min: 1.45, max: 2.00 },
  { week: 12, min: 1.60, max: 2.20 },
];

const getBroilerExpectedRange = (ageWeeks: number) => {
  const w = Math.max(1, Math.min(8, Math.round(ageWeeks)));
  return poultryBroilerExpectedKgByWeek.find((x) => x.week === w);
};

const getNoilerExpectedRange = (ageWeeks: number) => {
  const w = Math.max(1, Math.min(12, Math.round(ageWeeks)));
  return poultryNoilerExpectedKgByWeek.find((x) => x.week === w);
};

const computeTHI = (tempC: number, rh: number) => tempC - (0.55 - 0.0055 * rh) * (tempC - 14.5);


const HEALTHCHECK_AI_SYSTEM_PROMPT = `You are a veterinary and livestock production expert.

You will be given a JSON payload containing ONLY:
- livestock profile (species, trackingType, poultryType/fishType)
- age (days/weeks) if available
- weight (kg) which for batch registrations represents AVERAGE weight per animal
- latest preventive records (vaccination/deworming) and illness/treatment status
- environment snapshot (temperature/humidity) if available
- preliminary rule-based checks

Your job:
1) Validate the rule-based checks; adjust ONLY when the data clearly supports it.
2) Suggest additional health checks that can be inferred strictly from the given data.
3) Provide careful, conservative recommendations.

Hard rules:
- Do NOT hallucinate missing fields.
- If data is insufficient, mark the check status as "unknown" and explicitly list missing data.
- Output STRICT JSON ONLY.
- Do NOT wrap the JSON in markdown or code fences (no triple-backtick fences).

Response JSON schema:
{
  "aiSummary": string,
  "overallStatus": "ok"|"warning"|"critical"|"unknown",
  "checks": [
    {
      "key": string,
      "status": "ok"|"warning"|"critical"|"unknown",
      "findings": string[],
      "recommendations": string[]
    }
  ],
  "flags": string[]
}`;

export class LivestockHealthCheckService {
  async getLatestReport(livestockId: string, userId: string) {
    const livestock = await Livestock.findOne({ _id: livestockId, owner: userId }).select('_id');
    if (!livestock) {
      throw new Error('Livestock not found or you do not have permission');
    }

    return LivestockHealthCheckReport.findOne({ livestockId: new Types.ObjectId(livestockId), owner: new Types.ObjectId(userId) })
      .sort({ generatedAt: -1 });
  }

  async recompute(livestockId: string, opts: RecomputeOptions = {}) {
    const livestock = (await Livestock.findById(livestockId)) as unknown as ILivestock | null;
    if (!livestock) {
      throw new Error('Livestock not found');
    }

    const farm = await Farm.findById(livestock.farmId).select('_id');
    if (!farm) {
      throw new Error('Farm not found');
    }

    const now = new Date();
    const dob = safeDate((livestock as any).dateOfBirth);
    const acquisitionDate = safeDate((livestock as any).acquisitionDate);
    const ageBase = dob || acquisitionDate;
    const ageDays = ageBase ? Math.max(0, daysBetween(now, ageBase)) : undefined;
    const ageWeeks = ageDays != null ? ageDays / 7 : undefined;

    const weather = await WeatherData.findOne({ farmId: livestock.farmId }).sort({ timestamp: -1 }).lean();
    const tempC = weather?.current?.temperature;
    const rh = weather?.current?.humidity;

    const livestockObjectId = new Types.ObjectId(livestockId);

    const [lastVaccination, lastDeworming, activeIllnessCount, ongoingTreatmentCount, unresolvedDiagnoses] = await Promise.all([
      LivestockVaccination.findOne({ livestockId: livestockObjectId }).sort({ dateAdministered: -1 }).lean(),
      LivestockDeworming.findOne({ livestockId: livestockObjectId }).sort({ dateAdministered: -1 }).lean(),
      LivestockIllness.countDocuments({ livestockId: livestockObjectId, status: { $in: ['active', 'under_treatment'] } }),
      LivestockTreatment.countDocuments({ livestockId: livestockObjectId, status: 'ongoing' }),
      LivestockDiagnosis.find({
        livestockId: livestockObjectId,
        userId: (livestock as any).owner,
        status: { $in: ['processing', 'detected', 'treating', 'treated'] },
      })
        .sort({ createdAt: -1 })
        .limit(3)
        .lean(),
    ]);

    const unresolvedDiagnosisList = Array.isArray(unresolvedDiagnoses) ? unresolvedDiagnoses : [];
    const unresolvedDiagnosisCount = unresolvedDiagnosisList.length;
    const hasCriticalUnresolvedDiagnosis = unresolvedDiagnosisList.some(
      (d: any) => d?.severity === 'critical' || d?.urgency === 'immediate'
    );

    const checks: any[] = [];

    // Active AI diagnosis alert (unresolved)
    {
      if (unresolvedDiagnosisCount > 0) {
        const latest = unresolvedDiagnosisList[0];
        const status: HealthCheckStatus = hasCriticalUnresolvedDiagnosis ? 'critical' : 'warning';
        const findings: string[] = [];
        const recommendations: string[] = [];

        const diagnoses = Array.from(
          new Set(
            unresolvedDiagnosisList
              .map((d: any) => String(d?.diagnosis || '').trim())
              .filter(Boolean)
              .map((s) => s.replace(/\s+/g, ' '))
          )
        ).slice(0, 3);

        findings.push(`${unresolvedDiagnosisCount} active AI diagnosis(es) need attention.`);
        if (diagnoses.length) findings.push(`Detected: ${diagnoses.join(' | ')}`);

        const treatedCount = unresolvedDiagnosisList.filter((d: any) => d?.status === 'treated').length;
        const actionableDiagnosisList = unresolvedDiagnosisList.filter((d: any) => d?.status !== 'treated');

        const treatmentSteps = Array.from(
          new Set(
            actionableDiagnosisList
              .flatMap((d: any) => (Array.isArray(d?.treatment) ? d.treatment : []))
              .map((s: any) => String(s).trim())
              .filter(Boolean)
          )
        ).slice(0, 8);

        for (const step of treatmentSteps) {
          findings.push(`Treatment: ${step}`);
        }

        if (treatedCount > 0) {
          findings.push(
            `${treatedCount} diagnosis(es) have treatment plan marked completed. Monitor recovery, then mark the diagnosis as resolved when fully cured.`
          );
        }

        if (treatmentSteps.length === 0 && latest?.status === 'processing') {
          findings.push('Diagnosis is still processing — check back shortly for treatment guidance.');
        }

        if (latest?.vetVisitRecommended || hasCriticalUnresolvedDiagnosis) {
          recommendations.push('If symptoms are severe/worsening, consult a veterinarian urgently.');
        }

        checks.push({
          key: 'ai_diagnosis_alert',
          title: 'Active AI diagnosis alert',
          status,
          findings,
          recommendations,
          data: { unresolvedDiagnosisCount },
        });
      }
    }

    // Data quality
    {
      const missing: string[] = [];
      if (!(livestock as any).species) missing.push('species');
      if (!(livestock as any).trackingType) missing.push('trackingType');
      if ((livestock as any).trackingType === 'batch' && !(livestock as any).quantity) missing.push('quantity');
      if (ageDays == null) missing.push('dateOfBirth/acquisitionDate');
      if ((livestock as any).weight == null) missing.push('weight');

      const status: HealthCheckStatus = missing.length ? 'warning' : 'ok';
      checks.push({
        key: 'data_quality',
        title: 'Data quality',
        status,
        findings: missing.length ? [`Missing: ${missing.join(', ')}`] : ['Key fields present'],
        recommendations: missing.length
          ? ['Complete the missing fields to improve accuracy of health checks.']
          : [],
        data: { missing },
      });
    }

    // Growth / undergrowth (heuristic)
    {
      const weightKg = typeof (livestock as any).weight === 'number' ? (livestock as any).weight : undefined;
      let status: HealthCheckStatus = 'unknown';
      const findings: string[] = [];
      const recommendations: string[] = [];
      const data: any = { weightKg, ageDays, ageWeeks };

      if (weightKg != null && ageWeeks != null) {
        if ((livestock as any).species === 'poultry') {
          const poultryType = (livestock as any).poultryType as string | undefined;

          const isBroiler = poultryType === 'broiler';
          const isNoilerLike = poultryType === 'noiler' || poultryType === 'kuroiler';

          const expected = isBroiler
            ? getBroilerExpectedRange(ageWeeks)
            : isNoilerLike
            ? getNoilerExpectedRange(ageWeeks)
            : undefined;

          if (expected) {
            data.poultryType = poultryType;
            data.expected = expected;
            const label = isBroiler ? 'broiler' : (poultryType || 'poultry');

            if (weightKg < expected.min * 0.85) {
              status = 'warning';
              findings.push(`Average weight (${weightKg}kg) is below expected range for ~week ${expected.week} (${label} heuristic).`);
              recommendations.push('Review feed quality/quantity, water availability, stocking density, and parasite control.');
            } else if (weightKg > expected.max * 1.25) {
              status = 'warning';
              findings.push(`Average weight (${weightKg}kg) is above expected range for ~week ${expected.week} (${label} heuristic).`);
              recommendations.push('Check feeding program and watch for leg problems/overconditioning.');
            } else {
              status = 'ok';
              findings.push(`Weight appears within expected range for age (${label} heuristic).`);
            }
          } else {
            status = 'unknown';
            findings.push('Insufficient poultry-type-specific growth reference data for accurate growth scoring.');
            recommendations.push('Add periodic weight records and ensure poultry type is set (e.g., broiler, noiler, layer) to improve growth assessment.');
          }
        } else {
          // For other species, we avoid pretending precision.
          status = 'unknown';
          findings.push('Insufficient species-specific growth reference data for accurate growth scoring.');
          recommendations.push('Add periodic weight records and, if possible, breed/production type to improve growth assessment.');
        }
      } else {
        findings.push('Missing weight or age; growth check cannot be computed.');
        recommendations.push('Record weight and hatch/birth date (or acquisition date).');
      }

      checks.push({ key: 'growth', title: 'Growth / undergrowth', status, findings, recommendations, data });
    }

    // Preventive care compliance
    {
      const findings: string[] = [];
      const recommendations: string[] = [];
      let status: HealthCheckStatus = 'unknown';

      const lastVaxDate = safeDate((lastVaccination as any)?.dateAdministered);
      const lastDewormDate = safeDate((lastDeworming as any)?.dateAdministered);

      if (lastVaxDate || lastDewormDate) {
        status = 'ok';
        if (lastVaxDate) findings.push(`Last vaccination: ${lastVaxDate.toDateString()}`);
        if (lastDewormDate) findings.push(`Last deworming: ${lastDewormDate.toDateString()}`);
      } else {
        status = ageDays != null && ageDays > 30 ? 'warning' : 'unknown';
        findings.push('No vaccination/deworming records found.');
        recommendations.push('Log vaccinations and deworming schedules to track preventive care.');
      }

      if (unresolvedDiagnosisCount > 0) {
        status = maxStatus(status, hasCriticalUnresolvedDiagnosis ? 'critical' : 'warning');
        findings.push(`${unresolvedDiagnosisCount} unresolved AI diagnosis(es) found.`);

        const preventionSteps = Array.from(
          new Set(
            unresolvedDiagnosisList
              .flatMap((d: any) => (Array.isArray(d?.prevention) ? d.prevention : []))
              .map((s: any) => String(s).trim())
              .filter(Boolean)
          )
        ).slice(0, 5);

        for (const step of preventionSteps) {
          findings.push(`Preventive care: ${step}`);
        }

        if (preventionSteps.length === 0) {
          recommendations.push('Review the unresolved diagnosis and follow its listed prevention guidance (biosecurity, hygiene, isolation, vaccination/deworming as applicable).');
        }
      }

      checks.push({
        key: 'preventive_care',
        title: 'Preventive care',
        status,
        findings,
        recommendations,
        data: {
          lastVaccinationDate: lastVaxDate,
          lastDewormingDate: lastDewormDate,
          unresolvedDiagnosisCount,
        },
      });
    }

    // Illness / treatment activity
    {
      let status: HealthCheckStatus = 'ok';
      const findings: string[] = [];
      const recommendations: string[] = [];

      if (activeIllnessCount > 0) {
        status = 'warning';
        findings.push(`${activeIllnessCount} active/under-treatment illness record(s).`);
        recommendations.push('Review illness records and isolate affected animals if contagious is suspected.');
      }
      if (ongoingTreatmentCount > 0) {
        status = maxStatus(status, 'warning');
        findings.push(`${ongoingTreatmentCount} ongoing treatment(s).`);
        recommendations.push('Ensure treatment completion and follow-up checks.');
      }

      if (unresolvedDiagnosisCount > 0) {
        status = maxStatus(status, hasCriticalUnresolvedDiagnosis ? 'critical' : 'warning');
        const latest = unresolvedDiagnosisList[0];
        const latestLabel = String(latest?.diagnosis || '').trim().replace(/\s+/g, ' ').slice(0, 140);
        findings.push(
          `${unresolvedDiagnosisCount} unresolved AI diagnosis(es) detected${latestLabel ? ` (latest: ${latestLabel})` : ''}.`
        );

        const treatmentSteps = Array.from(
          new Set(
            (Array.isArray(latest?.treatment) ? latest.treatment : [])
              .map((s: any) => String(s).trim())
              .filter(Boolean)
          )
        ).slice(0, 3);

        for (const step of treatmentSteps) {
          recommendations.push(`AI suggested: ${step}`);
        }

        if (latest?.vetVisitRecommended || latest?.severity === 'critical') {
          recommendations.push('If the animal looks critical or symptoms worsen, consult a veterinarian urgently.');
        }
      }

      if (status === 'ok') {
        findings.push('No active illness, ongoing treatment, or unresolved AI diagnosis flagged from records.');
      }

      checks.push({
        key: 'illness_treatment',
        title: 'Illness & treatment signals',
        status,
        findings,
        recommendations,
        data: { activeIllnessCount, ongoingTreatmentCount, unresolvedDiagnosisCount },
      });
    }

    // Heat stress risk (weather-based)
    {
      let status: HealthCheckStatus = 'unknown';
      const findings: string[] = [];
      const recommendations: string[] = [];

      if (typeof tempC === 'number') {
        status = 'ok';
        const humidity = typeof rh === 'number' ? rh : undefined;
        const thi = humidity != null ? computeTHI(tempC, humidity) : undefined;

        if ((livestock as any).species === 'poultry') {
          if (tempC >= 35) status = 'critical';
          else if (tempC >= 30) status = 'warning';
        } else {
          if (thi != null) {
            if (thi >= 84) status = 'critical';
            else if (thi >= 78) status = 'warning';
          } else {
            if (tempC >= 35) status = 'warning';
          }
        }

        findings.push(`Temperature: ${tempC}°C${humidity != null ? `, Humidity: ${humidity}%` : ''}${thi != null ? `, THI: ${thi.toFixed(1)}` : ''}`);
        if (status !== 'ok') {
          recommendations.push('Provide shade/ventilation, cool clean water, and reduce handling during peak heat.');
          recommendations.push('Watch for panting, reduced feed intake, and lethargy.');
        }
      } else {
        findings.push('No recent weather data for this farm.');
        recommendations.push('Enable weather sync for heat-stress risk alerts.');
      }

      checks.push({
        key: 'heat_stress',
        title: 'Heat stress risk',
        status,
        findings,
        recommendations,
        data: { tempC, rh },
      });
    }

    const overallStatus = checks.reduce((acc, c) => maxStatus(acc, c.status), 'ok' as HealthCheckStatus);

    const basePayload = {
      livestock: {
        species: (livestock as any).species,
        trackingType: (livestock as any).trackingType,
        poultryType: (livestock as any).poultryType,
        fishType: (livestock as any).fishType,
        weightKg: (livestock as any).weight,
        quantity: (livestock as any).quantity,
        dateOfBirth: dob,
        acquisitionDate,
      },
      derived: { ageDays, ageWeeks },
      environment: { tempC, rh },
      records: {
        lastVaccination: lastVaccination ? { dateAdministered: (lastVaccination as any).dateAdministered, vaccineName: (lastVaccination as any).vaccineName } : null,
        lastDeworming: lastDeworming ? { dateAdministered: (lastDeworming as any).dateAdministered, product: (lastDeworming as any).dewormerName } : null,
        activeIllnessCount,
        ongoingTreatmentCount,
        unresolvedDiagnosisCount,
      },
      ruleChecks: checks.map((c) => ({ key: c.key, status: c.status, findings: c.findings, recommendations: c.recommendations, data: c.data })),
    };

    let aiEnhancement: any | null = null;
    const useAI = Boolean(opts.useAI);

    if (useAI && process.env.AICCS_API_KEY) {
      const parseAi = (raw: string) => HealthCheckAiEnhancementSchema.parse(JSON.parse(extractJsonFromLLM(raw)));

      try {
        const aiRaw = await chatWithContext(JSON.stringify(basePayload), [], HEALTHCHECK_AI_SYSTEM_PROMPT);
        try {
          aiEnhancement = parseAi(aiRaw);
        } catch (e1: any) {
          const bad = String(aiRaw || '').slice(0, 6000);
          const repairMsg = `Your previous response was not valid JSON or did not match the required schema.\n\nInvalid output (truncated):\n${bad}\n\nReturn ONLY a corrected JSON object that matches the schema. No markdown. No code fences.`;
          const repaired = await chatWithContext(repairMsg, [], HEALTHCHECK_AI_SYSTEM_PROMPT);
          aiEnhancement = parseAi(repaired);
        }
      } catch (e: any) {
        logger.warn(`HealthCheck AI enhancement failed: ${e?.message || e}`);
      }
    }

    const mergedChecks = (() => {
      if (!aiEnhancement?.checks || !Array.isArray(aiEnhancement.checks)) return checks;
      const map = new Map<string, any>();
      checks.forEach((c) => map.set(c.key, c));
      for (const aiCheck of aiEnhancement.checks) {
        if (!aiCheck?.key) continue;
        const existing = map.get(aiCheck.key);
        if (existing) {
          existing.status = aiCheck.status || existing.status;
          if (Array.isArray(aiCheck.findings) && aiCheck.findings.length) existing.findings = aiCheck.findings;
          if (Array.isArray(aiCheck.recommendations) && aiCheck.recommendations.length) existing.recommendations = aiCheck.recommendations;
        } else {
          map.set(aiCheck.key, {
            key: String(aiCheck.key),
            title: String(aiCheck.key),
            status: aiCheck.status || 'unknown',
            findings: Array.isArray(aiCheck.findings) ? aiCheck.findings : [],
            recommendations: Array.isArray(aiCheck.recommendations) ? aiCheck.recommendations : [],
          });
        }
      }
      return Array.from(map.values());
    })();

    const mergedOverallStatus: HealthCheckStatus =
      aiEnhancement?.overallStatus && ['ok', 'warning', 'critical', 'unknown'].includes(aiEnhancement.overallStatus)
        ? aiEnhancement.overallStatus
        : mergedChecks.reduce((acc, c) => maxStatus(acc, c.status), 'ok' as HealthCheckStatus);

    const report = await LivestockHealthCheckReport.create({
      livestockId: new Types.ObjectId(livestockId),
      farmId: livestock.farmId,
      owner: (livestock as any).owner,
      generatedAt: now,
      reason: opts.reason,
      overallStatus: mergedOverallStatus,
      checks: mergedChecks,
      inputs: {
        species: (livestock as any).species,
        trackingType: (livestock as any).trackingType,
        poultryType: (livestock as any).poultryType,
        fishType: (livestock as any).fishType,
        dateOfBirth: dob,
        acquisitionDate,
        weight: (livestock as any).weight,
        quantity: (livestock as any).quantity,
        housingUnit: (livestock as any).housingUnit,
      },
      derived: {
        ageDays,
        ageWeeks,
      },
      ai: {
        used: Boolean(aiEnhancement),
        model: aiEnhancement ? getModelName() : undefined,
        enhancedAt: aiEnhancement ? now : undefined,
        summary: aiEnhancement?.aiSummary,
        flags: Array.isArray(aiEnhancement?.flags) ? aiEnhancement.flags : undefined,
      },
      version: 1,
    });

    logger.info('Livestock health check report generated', {
      livestockId,
      overallStatus: report.overallStatus,
      aiUsed: report.ai?.used,
    });

    return report;
  }
}

export const livestockHealthCheckService = new LivestockHealthCheckService();
