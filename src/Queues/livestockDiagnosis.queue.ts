import { enqueueJob } from './agroJobs.queue';
import logger from '../Utils/logger';
import { livestockDiagnosisService } from '../Services/livestock-diagnosis.service';

// Kept for backward compatibility (previously the BullMQ queue name).
export const LIVESTOCK_DIAGNOSIS_QUEUE = 'livestock-diagnosis-queue';

export const addLivestockDiagnosisJob = async (data: { diagnosisId: string }) => {
  const result = await enqueueJob(
    'process-livestock-diagnosis',
    data as unknown as Record<string, unknown>,
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: true,
    },
    async () => {
      await livestockDiagnosisService.processDiagnosisJob(data.diagnosisId);
    }
  );

  if (result.status === 'queued') {
    logger.debug(`Livestock diagnosis job added for ID: ${data.diagnosisId}`);
  }
};
