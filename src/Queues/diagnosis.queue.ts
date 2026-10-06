import { enqueueJob } from './agroJobs.queue';
import logger from '../Utils/logger';
import { processCropDiagnosisJob, type CropDiagnosisJobData } from '../Services/diagnosisJob.service';

// Kept for backward compatibility (previously the BullMQ queue name).
export const DIAGNOSIS_QUEUE = 'diagnosis-queue';

export const addDiagnosisJob = async (data: CropDiagnosisJobData) => {
  const result = await enqueueJob(
    'process-diagnosis',
    data as unknown as Record<string, unknown>,
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: true,
    },
    // Inline mode / Upstash quota fallback: run in-process rather than
    // leaving the diagnosis stuck in "processing".
    async () => {
      await processCropDiagnosisJob(data);
    }
  );

  if (result.status === 'queued') {
    logger.debug(`Diagnosis job added for ID: ${data.diagnosisId}`);
  }
};
