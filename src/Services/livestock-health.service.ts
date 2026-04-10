import { LivestockHealth, LivestockVaccination, LivestockTreatment, LivestockIllness, LivestockCheckup, LivestockDeworming } from '../Models/LivestockHealth';
import Livestock from '../Models/Livestock';
import { Types } from 'mongoose';
import logger from '../Utils/logger';
import {
  ILivestockVaccination,
  ILivestockTreatment,
  ILivestockIllness,
  ILivestockCheckup,
  ILivestockDeworming,
} from '../Types/livestock.types';
import { livestockHealthCheckService } from './livestock-health-check.service';
import { addLivestockHealthCheckJob } from '../Queues/livestockHealthCheck.queue';
import cloudinary from '../Config/cloudinary';
import { Readable } from 'stream';

const safeEnqueueHealthCheck = async (livestockId: string, reason: string) => {
  try {
    await livestockHealthCheckService.recompute(livestockId, { reason, useAI: false });
    await addLivestockHealthCheckJob({ livestockId, reason });
  } catch (e: any) {
    logger.warn(`HealthCheck recompute failed (${reason}): ${e?.message || e}`);
  }
};

// Helper to upload images to Cloudinary
const uploadIllnessImages = async (files: Express.Multer.File[]): Promise<string[]> => {
  const uploadPromises = files.map((file) => {
    return new Promise<string>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'agroguardian/livestock-illnesses', resource_type: 'image' },
        (error, result) => {
          if (error || !result) return reject(error || new Error('Upload failed'));
          resolve(result.secure_url);
        }
      );
      Readable.from(file.buffer).pipe(stream);
    });
  });
  return Promise.all(uploadPromises);
};

export class LivestockHealthService {
  // ==================== VACCINATIONS ====================

  async addVaccination(data: Partial<ILivestockVaccination> & { livestockId: string; userId: string }): Promise<ILivestockVaccination> {
    const livestock = await Livestock.findById(data.livestockId);
    if (!livestock) {
      throw new Error('Livestock not found');
    }

    const vaccination = await LivestockVaccination.create({
      ...data,
      livestockId: new Types.ObjectId(data.livestockId),
      farmId: livestock.farmId,
      administeredBy: new Types.ObjectId(data.userId),
    });

    await safeEnqueueHealthCheck(data.livestockId, 'vaccination_added');

    return vaccination;
  }

  async getVaccinations(livestockId: string): Promise<ILivestockVaccination[]> {
    return LivestockVaccination.find({ livestockId: new Types.ObjectId(livestockId) }).sort({ dateAdministered: -1 });
  }

  async getUpcomingVaccinations(farmId: string, days: number = 30): Promise<ILivestockVaccination[]> {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    return LivestockVaccination.find({
      farmId: new Types.ObjectId(farmId),
      nextDueDate: { $lte: futureDate, $gte: new Date() },
    })
      .populate('livestockId', 'name tagId species breed')
      .sort({ nextDueDate: 1 });
  }

  async updateVaccination(vaccinationId: string, data: Partial<ILivestockVaccination>): Promise<ILivestockVaccination | null> {
    const vaccination = await LivestockVaccination.findByIdAndUpdate(vaccinationId, { $set: data }, { new: true });
    const livestockId = (vaccination as any)?.livestockId?.toString();
    if (livestockId) {
      await safeEnqueueHealthCheck(livestockId, 'vaccination_updated');
    }
    return vaccination;
  }

  async deleteVaccination(vaccinationId: string): Promise<boolean> {
    const existing = await LivestockVaccination.findById(vaccinationId).select('livestockId');
    const result = await LivestockVaccination.findByIdAndDelete(vaccinationId);

    const livestockId = (existing as any)?.livestockId?.toString();
    if (livestockId) {
      await safeEnqueueHealthCheck(livestockId, 'vaccination_deleted');
    }

    return !!result;
  }

  // ==================== TREATMENTS ====================

  async addTreatment(data: Partial<ILivestockTreatment> & { livestockId: string; userId: string }): Promise<ILivestockTreatment> {
    const livestock = await Livestock.findById(data.livestockId);
    if (!livestock) {
      throw new Error('Livestock not found');
    }

    const treatment = await LivestockTreatment.create({
      ...data,
      livestockId: new Types.ObjectId(data.livestockId),
      farmId: livestock.farmId,
      administeredBy: new Types.ObjectId(data.userId),
    });

    // Update livestock health status if critical treatment
    if (data.status === 'ongoing') {
      await Livestock.findByIdAndUpdate(data.livestockId, {
        healthStatus: 'under_treatment',
      });
    }

    await safeEnqueueHealthCheck(data.livestockId, 'treatment_added');

    return treatment;
  }

  async getTreatments(livestockId: string): Promise<ILivestockTreatment[]> {
    return LivestockTreatment.find({ livestockId: new Types.ObjectId(livestockId) }).sort({ startDate: -1 });
  }

  async getActiveTreatments(farmId: string): Promise<ILivestockTreatment[]> {
    return LivestockTreatment.find({
      farmId: new Types.ObjectId(farmId),
      status: 'ongoing',
    })
      .populate('livestockId', 'name tagId species breed healthStatus')
      .sort({ startDate: -1 });
  }

  async updateTreatment(treatmentId: string, data: Partial<ILivestockTreatment>): Promise<ILivestockTreatment | null> {
    const treatment = await LivestockTreatment.findByIdAndUpdate(treatmentId, { $set: data }, { new: true });

    // If treatment completed, update livestock status
    if (treatment && data.status === 'completed') {
      await Livestock.findByIdAndUpdate((treatment as any).livestockId, {
        healthStatus: 'recovering',
      });
    }

    const livestockId = (treatment as any)?.livestockId?.toString();
    if (livestockId) {
      await safeEnqueueHealthCheck(livestockId, 'treatment_updated');
    }

    return treatment;
  }

  async deleteTreatment(treatmentId: string): Promise<boolean> {
    const existing = await LivestockTreatment.findById(treatmentId).select('livestockId');
    const result = await LivestockTreatment.findByIdAndDelete(treatmentId);

    const livestockId = (existing as any)?.livestockId?.toString();
    if (livestockId) {
      await safeEnqueueHealthCheck(livestockId, 'treatment_deleted');
    }

    return !!result;
  }

  // ==================== ILLNESSES ====================

  async reportIllness(
    data: Partial<ILivestockIllness> & { livestockId: string; userId: string },
    files?: Express.Multer.File[]
  ): Promise<ILivestockIllness> {
    const livestock = await Livestock.findById(data.livestockId);
    if (!livestock) {
      throw new Error('Livestock not found');
    }

    // Upload images if provided
    let imageUrls: string[] = [];
    if (files && files.length > 0) {
      imageUrls = await uploadIllnessImages(files);
    }

    const illness = await LivestockIllness.create({
      ...data,
      livestockId: new Types.ObjectId(data.livestockId),
      farmId: livestock.farmId,
      reportedBy: new Types.ObjectId(data.userId),
      imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    });

    // Update livestock health status based on severity
    let healthStatus = 'sick';
    if (data.severity === 'critical') {
      healthStatus = 'critical';
    }

    await Livestock.findByIdAndUpdate(data.livestockId, { healthStatus });

    await safeEnqueueHealthCheck(data.livestockId, 'illness_reported');

    return illness;
  }

  async getIllnesses(livestockId: string): Promise<ILivestockIllness[]> {
    return LivestockIllness.find({ livestockId: new Types.ObjectId(livestockId) }).sort({ dateIdentified: -1 });
  }

  async getActiveIllnesses(farmId: string): Promise<ILivestockIllness[]> {
    return LivestockIllness.find({
      farmId: new Types.ObjectId(farmId),
      status: { $in: ['active', 'under_treatment'] },
    })
      .populate('livestockId', 'name tagId species breed healthStatus')
      .sort({ dateIdentified: -1 });
  }

  async updateIllness(illnessId: string, data: Partial<ILivestockIllness>): Promise<ILivestockIllness | null> {
    const illness = await LivestockIllness.findByIdAndUpdate(illnessId, { $set: data }, { new: true });

    // Update livestock status if illness resolved
    if (illness && data.status === 'resolved') {
      await Livestock.findByIdAndUpdate((illness as any).livestockId, {
        healthStatus: 'healthy',
      });
    }

    const livestockId = (illness as any)?.livestockId?.toString();
    if (livestockId) {
      await safeEnqueueHealthCheck(livestockId, 'illness_updated');
    }

    return illness;
  }

  // ==================== CHECKUPS ====================

  async addCheckup(data: Partial<ILivestockCheckup> & { livestockId: string; userId: string }): Promise<ILivestockCheckup> {
    const livestock = await Livestock.findById(data.livestockId);
    if (!livestock) {
      throw new Error('Livestock not found');
    }

    const checkup = await LivestockCheckup.create({
      ...data,
      livestockId: new Types.ObjectId(data.livestockId),
      farmId: livestock.farmId,
      performedBy: new Types.ObjectId(data.userId),
    });

    // Update weight if provided
    if (data.weight) {
      await Livestock.findByIdAndUpdate(data.livestockId, {
        weight: data.weight,
        $push: {
          weightHistory: {
            weight: data.weight,
            recordedAt: new Date(),
            notes: 'Recorded during checkup',
          },
        },
      });
    }

    await safeEnqueueHealthCheck(data.livestockId, 'checkup_added');

    return checkup;
  }

  async getCheckups(livestockId: string): Promise<ILivestockCheckup[]> {
    return LivestockCheckup.find({ livestockId: new Types.ObjectId(livestockId) }).sort({ checkupDate: -1 });
  }

  async getRecentCheckups(farmId: string, days: number = 30): Promise<ILivestockCheckup[]> {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - days);

    return LivestockCheckup.find({
      farmId: new Types.ObjectId(farmId),
      checkupDate: { $gte: pastDate },
    })
      .populate('livestockId', 'name tagId species breed')
      .sort({ checkupDate: -1 });
  }

  // ==================== DEWORMING ====================

  async addDeworming(data: Partial<ILivestockDeworming> & { livestockId: string; userId: string }): Promise<ILivestockDeworming> {
    const livestock = await Livestock.findById(data.livestockId);
    if (!livestock) {
      throw new Error('Livestock not found');
    }

    const record = await LivestockDeworming.create({
      ...data,
      livestockId: new Types.ObjectId(data.livestockId),
      farmId: livestock.farmId,
      administeredBy: new Types.ObjectId(data.userId)
    });

    try {
      await livestockHealthCheckService.recompute(data.livestockId, { reason: 'deworming_added', useAI: false });
      await addLivestockHealthCheckJob({ livestockId: data.livestockId, reason: 'deworming_added' });
    } catch (e: any) {
      // non-blocking
    }

    return record;
  }

  async getDewormings(livestockId: string): Promise<ILivestockDeworming[]> {
    return LivestockDeworming.find({ livestockId: new Types.ObjectId(livestockId) })
      .sort({ dateAdministered: -1 });
  }

  async getUpcomingDewormings(farmId: string, days: number = 30): Promise<ILivestockDeworming[]> {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    return LivestockDeworming.find({
      farmId: new Types.ObjectId(farmId),
      nextDueDate: { $lte: futureDate, $gte: new Date() }
    })
      .populate('livestockId', 'name tagId species breed')
      .sort({ nextDueDate: 1 });
  }

  async addBulkDewormings(params: {
    farmId: string;
    userId: string;
    scope: 'all' | 'species' | 'selected';
    species?: string[];
    livestockIds?: string[];
    productName: string;
    activeIngredient?: string;
    dosage: string;
    dateAdministered: Date | string;
    nextDueDate?: Date | string;
    targetParasites?: string[];
    cost?: number;
    notes?: string;
  }): Promise<{
    targetedLivestock: number;
    targetedAnimals: number;
    createdCount: number;
    livestockIds: string[];
  }> {
    const farmObjectId = new Types.ObjectId(params.farmId);
    const userObjectId = new Types.ObjectId(params.userId);

    const match: any = {
      farmId: farmObjectId,
      owner: userObjectId,
      status: { $in: ['active', 'breeding'] }
    };

    if (params.scope === 'species') {
      const list = (params.species || []).filter(Boolean);
      match.species = { $in: list };
    }

    if (params.scope === 'selected') {
      const ids = (params.livestockIds || []).filter(Boolean);
      match._id = { $in: ids.map((id) => new Types.ObjectId(id)) };
    }

    const targets = await Livestock.find(match).select('_id trackingType quantity species');

    const targetedLivestock = targets.length;
    const targetedAnimals = targets.reduce((sum: number, item: any) => {
      return sum + (item.trackingType === 'batch' ? (item.quantity || 1) : 1);
    }, 0);

    if (targetedLivestock === 0) {
      return { targetedLivestock: 0, targetedAnimals: 0, createdCount: 0, livestockIds: [] };
    }

    const dateAdministered = new Date(params.dateAdministered);
    const nextDueDate = params.nextDueDate ? new Date(params.nextDueDate) : undefined;

    const docs = targets.map((t: any) => ({
      livestockId: t._id,
      farmId: farmObjectId,
      productName: params.productName,
      activeIngredient: params.activeIngredient,
      dosage: params.dosage,
      dateAdministered,
      administeredBy: userObjectId,
      nextDueDate,
      targetParasites: params.targetParasites,
      cost: params.cost,
      notes: params.notes
    }));

    const created = await LivestockDeworming.insertMany(docs, { ordered: true });

    // Non-blocking health check recompute/queue. (For large farms, don't hold the HTTP response.)
    setImmediate(() => {
      targets.forEach((t: any) => {
        safeEnqueueHealthCheck(t._id.toString(), 'deworming_added');
      });
    });

    return {
      targetedLivestock,
      targetedAnimals,
      createdCount: created.length,
      livestockIds: targets.map((t: any) => t._id.toString())
    };
  }

  // ==================== HEALTH SUMMARY ====================

  async getHealthSummary(farmId: string): Promise<{
    totalAnimals: number;
    healthyCount: number;
    sickCount: number;
    criticalCount: number;
    underTreatmentCount: number;
    upcomingVaccinations: number;
    activeTreatments: number;
    activeIllnesses: number;
  }> {
    const farmObjectId = new Types.ObjectId(farmId);

    const [
      healthCounts,
      upcomingVaccinations,
      activeTreatments,
      activeIllnesses
    ] = await Promise.all([
      Livestock.aggregate([
        { $match: { farmId: farmObjectId, status: { $in: ['active', 'breeding'] } } },

        {
          $group: {
            _id: '$healthStatus',
            count: { $sum: { $cond: [{ $eq: ['$trackingType', 'batch'] }, '$quantity', 1] } }
          }
        }
      ]),
      LivestockVaccination.countDocuments({
        farmId: farmObjectId,
        nextDueDate: { $lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), $gte: new Date() }
      }),
      LivestockTreatment.countDocuments({
        farmId: farmObjectId,
        status: 'ongoing'
      }),
      LivestockIllness.countDocuments({
        farmId: farmObjectId,
        status: { $in: ['active', 'under_treatment'] }
      })
    ]);

    const counts: Record<string, number> = {};
    healthCounts.forEach((item: { _id: string; count: number }) => {
      counts[item._id] = item.count;
    });

    const totalAnimals = Object.values(counts).reduce((a, b) => a + b, 0);

    return {
      totalAnimals,
      healthyCount: counts['healthy'] || 0,
      sickCount: counts['sick'] || 0,
      criticalCount: counts['critical'] || 0,
      underTreatmentCount: counts['under_treatment'] || 0,
      upcomingVaccinations,
      activeTreatments,
      activeIllnesses
    };
  }

  // ==================== COMBINED HEALTH RECORDS ====================

  async getAllHealthRecords(livestockId: string): Promise<{
    vaccinations: ILivestockVaccination[];
    treatments: ILivestockTreatment[];
    illnesses: ILivestockIllness[];
    checkups: ILivestockCheckup[];
    dewormings: ILivestockDeworming[];
  }> {
    const livestockObjectId = new Types.ObjectId(livestockId);

    const [vaccinations, treatments, illnesses, checkups, dewormings] = await Promise.all([
      LivestockVaccination.find({ livestockId: livestockObjectId }).sort({ dateAdministered: -1 }),
      LivestockTreatment.find({ livestockId: livestockObjectId }).sort({ startDate: -1 }),
      LivestockIllness.find({ livestockId: livestockObjectId }).sort({ dateIdentified: -1 }),
      LivestockCheckup.find({ livestockId: livestockObjectId }).sort({ checkupDate: -1 }),
      LivestockDeworming.find({ livestockId: livestockObjectId }).sort({ dateAdministered: -1 })
    ]);

    return { vaccinations, treatments, illnesses, checkups, dewormings };
  }
}

export const livestockHealthService = new LivestockHealthService();
