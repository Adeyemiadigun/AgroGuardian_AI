import { LivestockFeeding, LivestockFeedingSchedule, LivestockBreeding } from '../Models/LivestockManagement';
import Livestock from '../Models/Livestock';
import { Types } from 'mongoose';
import type { IBreedingFollowUp, ILivestockFeeding, ILivestockFeedingSchedule, ILivestockBreeding } from '../Types/livestock.types';

export class LivestockFeedBreedingService {
  // ==================== FEEDING ====================

  private getDefaultGestationDays(species?: string): number {
    switch (String(species || '').toLowerCase()) {
      case 'cattle':
        return 283;
      case 'goat':
        return 150;
      case 'sheep':
        return 152;
      case 'pig':
        return 114;
      case 'rabbit':
        return 31;
      case 'poultry':
        return 21;
      default:
        return 150;
    }
  }

  private clampDate(d: Date): Date {
    const t = new Date(d);
    if (Number.isNaN(t.getTime())) return new Date();
    return t;
  }

  private generateFollowUps(args: {
    breedingDate: Date;
    expectedDueDate: Date;
    confirmedAt: Date;
  }): IBreedingFollowUp[] {
    const breedingDate = this.clampDate(args.breedingDate);
    const expectedDueDate = this.clampDate(args.expectedDueDate);
    const confirmedAt = this.clampDate(args.confirmedAt);

    const totalMs = Math.max(0, expectedDueDate.getTime() - breedingDate.getTime());
    const atPct = (pct: number) => new Date(breedingDate.getTime() + totalMs * pct);

    return [
      {
        title: 'Confirm pregnancy',
        type: 'confirm_pregnancy',
        dueDate: confirmedAt,
        status: 'done',
        completedAt: confirmedAt,
      },
      {
        title: 'Antenatal check (mid-pregnancy)',
        type: 'antenatal_check',
        dueDate: atPct(0.5),
        status: 'pending',
      },
      {
        title: 'Nutrition & body condition check',
        type: 'nutrition_check',
        dueDate: atPct(0.65),
        status: 'pending',
      },
      {
        title: 'Antenatal check (late pregnancy)',
        type: 'antenatal_check',
        dueDate: atPct(0.8),
        status: 'pending',
      },
      {
        title: 'Prepare birthing area & supplies',
        type: 'prepare_birth',
        dueDate: new Date(expectedDueDate.getTime() - 14 * 24 * 60 * 60 * 1000),
        status: 'pending',
      },
      {
        title: 'Close monitoring for labor signs',
        type: 'monitor_labor',
        dueDate: new Date(expectedDueDate.getTime() - 3 * 24 * 60 * 60 * 1000),
        status: 'pending',
      },
    ];
  }

  async addFeedingRecord(data: Partial<ILivestockFeeding> & { farmId: string; userId: string }): Promise<ILivestockFeeding> {
    const feeding = await LivestockFeeding.create({
      ...data,
      farmId: new Types.ObjectId(data.farmId),
      owner: new Types.ObjectId(data.userId),
      livestockId: data.livestockId ? new Types.ObjectId(data.livestockId as string) : undefined
    });
    return feeding;
  }

  async getFeedingRecords(farmId: string, options: {
    livestockId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  } = {}): Promise<ILivestockFeeding[]> {
    const query: any = { farmId: new Types.ObjectId(farmId) };

    if (options.livestockId) {
      query.livestockId = new Types.ObjectId(options.livestockId);
    }

    if (options.startDate || options.endDate) {
      query.feedingTime = {};
      if (options.startDate) query.feedingTime.$gte = options.startDate;
      if (options.endDate) query.feedingTime.$lte = options.endDate;
    }

    return LivestockFeeding.find(query)
      .populate('livestockId', 'name tagId species')
      .sort({ feedingTime: -1 })
      .limit(options.limit || 100);
  }

  async createFeedingSchedule(data: Partial<ILivestockFeedingSchedule> & { farmId: string; userId: string }): Promise<ILivestockFeedingSchedule> {
    const schedule = await LivestockFeedingSchedule.create({
      ...data,
      farmId: new Types.ObjectId(data.farmId),
      owner: new Types.ObjectId(data.userId),
      livestockId: data.livestockId ? new Types.ObjectId(data.livestockId as string) : undefined,
    });
    return schedule;
  }

  async getFeedingSchedules(farmId: string, userId: string): Promise<ILivestockFeedingSchedule[]> {
    return LivestockFeedingSchedule.find({
      farmId: new Types.ObjectId(farmId),
      owner: new Types.ObjectId(userId),
    })
      .populate('livestockId', 'name tagId species')
      .sort({ createdAt: -1 })
      .limit(200);
  }

  async updateFeedingSchedule(scheduleId: string, userId: string, data: Partial<ILivestockFeedingSchedule>): Promise<ILivestockFeedingSchedule | null> {
    const update: any = { ...data };
    if ((data as any).livestockId) {
      update.livestockId = new Types.ObjectId((data as any).livestockId);
    }

    return LivestockFeedingSchedule.findOneAndUpdate(
      { _id: new Types.ObjectId(scheduleId), owner: new Types.ObjectId(userId) },
      { $set: update },
      { new: true }
    );
  }

  async deleteFeedingSchedule(scheduleId: string, userId: string): Promise<boolean> {
    const result = await LivestockFeedingSchedule.findOneAndDelete({
      _id: new Types.ObjectId(scheduleId),
      owner: new Types.ObjectId(userId),
    });
    return !!result;
  }

  async getFeedConsumptionStats(farmId: string, days: number = 30): Promise<{
    totalCost: number;
    totalQuantity: number;
    totalRecords: number;
    dailyAverage: number;
    byFeedType: { feedType: string; quantity: number; cost: number }[];
    bySpecies: { species: string; quantity: number; cost: number }[];
  }> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const stats = await LivestockFeeding.aggregate([
      {
        $match: {
          farmId: new Types.ObjectId(farmId),
          feedingTime: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: null,
          totalCost: { $sum: { $ifNull: ['$totalCost', 0] } },
          totalQuantity: { $sum: { $ifNull: ['$quantity', 0] } },
          totalRecords: { $sum: 1 }
        }
      }
    ]);

    const byFeedType = await LivestockFeeding.aggregate([
      {
        $match: {
          farmId: new Types.ObjectId(farmId),
          feedingTime: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$feedType',
          quantity: { $sum: { $ifNull: ['$quantity', 0] } },
          cost: { $sum: { $ifNull: ['$totalCost', 0] } }
        }
      },
      { $project: { feedType: '$_id', quantity: 1, cost: 1, _id: 0 } }
    ]);

    const totalCost = stats[0]?.totalCost || 0;
    const totalQuantity = stats[0]?.totalQuantity || 0;
    const totalRecords = stats[0]?.totalRecords || 0;

    return {
      totalCost,
      totalQuantity,
      totalRecords,
      dailyAverage: days > 0 ? totalQuantity / days : 0,
      byFeedType,
      bySpecies: [] // optional enhancement later (requires livestock join)
    };
  }

  async updateFeedingRecord(feedingId: string, data: Partial<ILivestockFeeding>): Promise<ILivestockFeeding | null> {
    return LivestockFeeding.findByIdAndUpdate(feedingId, { $set: data }, { new: true });
  }

  async deleteFeedingRecord(feedingId: string): Promise<boolean> {
    const result = await LivestockFeeding.findByIdAndDelete(feedingId);
    return !!result;
  }

  // ==================== BREEDING ====================

  private normalizeBreedingStatus(status?: string): ILivestockBreeding['status'] | undefined {
    const s = String(status || '').toLowerCase().trim();
    if (!s) return undefined;

    // Frontend/UI aliases
    if (s === 'pending' || s === 'bred') return 'bred';
    if (s === 'pregnant' || s === 'confirmed' || s === 'confirmed_pregnant') return 'confirmed_pregnant';
    if (s === 'successful' || s === 'delivered') return 'delivered';
    if (s === 'failed') return 'failed';
    if (s === 'aborted') return 'aborted';

    return status as any;
  }

  private addDays(date: Date, days: number): Date {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  private httpError(status: number, message: string, extra?: Record<string, any>) {
    const err: any = new Error(message);
    err.status = status;
    if (extra) Object.assign(err, extra);
    return err;
  }

  async addBreedingRecord(data: Partial<ILivestockBreeding> & { farmId: string; userId: string }): Promise<ILivestockBreeding> {
    const rawDamId = (data as any).damId || (data as any).femaleId;
    const rawSireId = (data as any).sireId || (data as any).maleId;

    if (!rawDamId) {
      throw new Error('damId is required (mother livestock id)');
    }

    const { femaleId, maleId, expectedBirthDate, ...rest } = data as any;

    // Prevent overlapping breeding cycles + enforce postpartum cooldown (60 days after birth)
    const farmObjectId = new Types.ObjectId(data.farmId);
    const ownerObjectId = new Types.ObjectId(data.userId);
    const damObjectId = new Types.ObjectId(rawDamId as string);

    const activeExisting = await LivestockBreeding.findOne({
      farmId: farmObjectId,
      owner: ownerObjectId,
      damId: damObjectId,
      $or: [{ status: { $in: ['bred', 'confirmed_pregnant'] } }, { isPregnant: true }],
    })
      .sort({ breedingDate: -1 })
      .lean();

    if (activeExisting) {
      throw this.httpError(
        409,
        'This female already has an active breeding record. Record the outcome (birth/failed) before adding a new one.',
        { reason: 'active_breeding' }
      );
    }

    const lastDelivered = await LivestockBreeding.findOne({
      farmId: farmObjectId,
      owner: ownerObjectId,
      damId: damObjectId,
      status: 'delivered',
      birthDate: { $exists: true, $ne: null },
    })
      .sort({ birthDate: -1 })
      .lean();

    if (lastDelivered?.birthDate) {
      const nextEligible = this.addDays(new Date(lastDelivered.birthDate as any), 60);
      if (Date.now() < nextEligible.getTime()) {
        throw this.httpError(
          409,
          `Post-birth rest period: this female can be bred again on ${nextEligible
            .toISOString()
            .slice(0, 10)} (60 days after birth).`,
          { reason: 'postpartum_cooldown', nextEligibleDate: nextEligible.toISOString() }
        );
      }
    }

    const breeding = await LivestockBreeding.create({
      ...rest,
      farmId: new Types.ObjectId(data.farmId),
      owner: new Types.ObjectId(data.userId),
      damId: new Types.ObjectId(rawDamId as string),
      sireId: rawSireId ? new Types.ObjectId(rawSireId as string) : undefined,
      breedingDate: (data as any).breedingDate ? new Date((data as any).breedingDate) : undefined,
      expectedDueDate: (data as any).expectedDueDate
        ? new Date((data as any).expectedDueDate)
        : expectedBirthDate
          ? new Date(expectedBirthDate)
          : undefined,
      status: this.normalizeBreedingStatus((data as any).status) || undefined,
    } as any);

    // Update dam's breeding status
    await Livestock.findByIdAndUpdate(rawDamId, {
      status: 'breeding',
      lastBreedingDate: (breeding as any).breedingDate,
    });

    return breeding;
  }

  async getBreedingRecords(
    farmId: string,
    options: {
      livestockId?: string;
      status?: string;
      limit?: number;
    } = {}
  ): Promise<ILivestockBreeding[]> {
    const query: any = { farmId: new Types.ObjectId(farmId) };

    if (options.livestockId) {
      query.$or = [{ damId: new Types.ObjectId(options.livestockId) }, { sireId: new Types.ObjectId(options.livestockId) }];
    }

    if (options.status) {
      const normalized = this.normalizeBreedingStatus(options.status);
      if (String(options.status).toLowerCase().trim() === 'failed') {
        query.status = { $in: ['failed', 'aborted'] };
      } else if (normalized) {
        query.status = normalized;
      }
    }

    return LivestockBreeding.find(query)
      .populate('damId', 'name tagId species breed gender')
      .populate('sireId', 'name tagId species breed gender')
      .populate('offspringIds', 'name tagId species')
      .sort({ breedingDate: -1 })
      .limit(options.limit || 50);
  }

  async getActivePregnancies(farmId: string): Promise<ILivestockBreeding[]> {
    return LivestockBreeding.find({
      farmId: new Types.ObjectId(farmId),
      status: 'confirmed_pregnant',
      expectedDueDate: { $exists: true },
    })
      .populate('damId', 'name tagId species breed')
      .sort({ expectedDueDate: 1 });
  }

  async getUpcomingBirths(farmId: string, days: number = 30): Promise<ILivestockBreeding[]> {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    return LivestockBreeding.find({
      farmId: new Types.ObjectId(farmId),
      status: 'confirmed_pregnant',
      expectedDueDate: { $lte: futureDate, $gte: new Date() },
    })
      .populate('damId', 'name tagId species breed')
      .sort({ expectedDueDate: 1 });
  }

  async confirmPregnancy(
    breedingId: string,
    payload: {
      confirmedAt?: string | Date;
      gestationDays?: number;
      expectedDueDate?: string | Date;
      notes?: string;
      regenerateFollowUps?: boolean;
    }
  ): Promise<ILivestockBreeding | null> {
    const breeding = await LivestockBreeding.findById(breedingId);
    if (!breeding) return null;

    const dam = await Livestock.findById((breeding as any).damId);
    const species = (dam as any)?.species;

    const breedingDate = this.clampDate((breeding as any).breedingDate);
    const gestationDays =
      payload.gestationDays && Number.isFinite(payload.gestationDays)
        ? Number(payload.gestationDays)
        : (breeding as any).gestationDays || this.getDefaultGestationDays(species);

    const expectedDueDate = payload.expectedDueDate
      ? this.clampDate(new Date(payload.expectedDueDate as any))
      : new Date(breedingDate.getTime() + gestationDays * 24 * 60 * 60 * 1000);

    const confirmedAt = payload.confirmedAt ? this.clampDate(new Date(payload.confirmedAt as any)) : new Date();

    (breeding as any).isPregnant = true;
    (breeding as any).pregnancyConfirmedAt = confirmedAt;
    (breeding as any).gestationDays = gestationDays;
    (breeding as any).expectedDueDate = expectedDueDate;
    (breeding as any).status = 'confirmed_pregnant';
    if (payload.notes) (breeding as any).notes = payload.notes;

    const existing = Array.isArray((breeding as any).followUps) ? (breeding as any).followUps : [];
    if (existing.length === 0 || payload.regenerateFollowUps) {
      (breeding as any).followUps = this.generateFollowUps({ breedingDate, expectedDueDate, confirmedAt });
    }

    await breeding.save();
    return breeding;
  }

  async getBreedingFollowUps(breedingId: string): Promise<IBreedingFollowUp[]> {
    const breeding = await LivestockBreeding.findById(breedingId).lean();
    const followUps = (breeding as any)?.followUps || [];
    return Array.isArray(followUps)
      ? followUps.sort((a: any, b: any) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
      : [];
  }

  async updateBreedingFollowUp(
    breedingId: string,
    followUpId: string,
    patch: { status?: 'pending' | 'done' | 'skipped'; notes?: string }
  ): Promise<IBreedingFollowUp | null> {
    const breeding = await LivestockBreeding.findById(breedingId);
    if (!breeding) return null;

    const followUps = ((breeding as any).followUps || []) as any[];
    const item = followUps.find((f) => String(f?._id) === String(followUpId));
    if (!item) return null;

    if (patch.status) {
      if (patch.status === 'done') {
        const now = new Date();
        const nowDay = new Date(now);
        nowDay.setHours(0, 0, 0, 0);

        const due = new Date(item.dueDate);
        const dueDay = new Date(due);
        dueDay.setHours(0, 0, 0, 0);

        if (nowDay.getTime() < dueDay.getTime()) {
          const err: any = new Error('You can only mark this follow-up done on or after the due date.');
          err.status = 400;
          throw err;
        }

        item.status = 'done';
        item.completedAt = now;
      } else {
        item.status = patch.status;
        item.completedAt = undefined;
      }
    }
    if (patch.notes != null) item.notes = patch.notes;

    await breeding.save();
    return item as any;
  }

  async updateBreedingRecord(breedingId: string, data: Partial<ILivestockBreeding>): Promise<ILivestockBreeding | null> {
    const update: any = { ...(data as any) };

    // Back-compat payload aliases
    if (update.expectedBirthDate && !update.expectedDueDate) {
      update.expectedDueDate = new Date(update.expectedBirthDate);
      delete update.expectedBirthDate;
    }
    if (update.actualBirthDate && !update.birthDate) {
      update.birthDate = new Date(update.actualBirthDate);
      delete update.actualBirthDate;
    }
    if (update.numberOfOffspring != null && update.offspringCount == null) {
      update.offspringCount = update.numberOfOffspring;
      delete update.numberOfOffspring;
    }
    if (update.birthNotes && !update.birthComplications) {
      update.birthComplications = update.birthNotes;
      delete update.birthNotes;
    }

    const normalizedStatus = this.normalizeBreedingStatus(update.status);
    if (normalizedStatus) update.status = normalizedStatus;

    if (update.isPregnant === true && !update.status) {
      update.status = 'confirmed_pregnant';
    }

    const breeding = await LivestockBreeding.findByIdAndUpdate(breedingId, { $set: update }, { new: true });

    // If status changed to 'delivered', update dam status
    if (breeding && update.status === 'delivered') {
      await Livestock.findByIdAndUpdate((breeding as any).damId, {
        status: 'active',
        lastBirthDate: update.birthDate || new Date(),
      });
    }

    return breeding;
  }

  async recordBirth(
    breedingId: string,
    birthData: {
      birthDate?: Date | string;
      actualBirthDate?: Date | string;
      numberOfOffspring: number;
      maleCount?: number;
      femaleCount?: number;
      stillborn?: number;
      birthWeight?: number;
      offspringIds?: string[];
      notes?: string;
      complications?: string;
    }
  ): Promise<ILivestockBreeding | null> {
    const birthDate = birthData.birthDate || birthData.actualBirthDate || new Date();

    const breeding = await LivestockBreeding.findByIdAndUpdate(
      breedingId,
      {
        $set: {
          status: 'delivered',
          birthDate: new Date(birthDate as any),
          offspringCount: birthData.numberOfOffspring,
          offspringIds: birthData.offspringIds?.map((id) => new Types.ObjectId(id)),
          birthComplications: birthData.complications,
          notes: birthData.notes,
          birthOutcome: {
            numberOfOffspring: birthData.numberOfOffspring,
            maleCount: birthData.maleCount,
            femaleCount: birthData.femaleCount,
            stillborn: birthData.stillborn,
            birthWeight: birthData.birthWeight,
            notes: birthData.notes,
          },
        },
      },
      { new: true }
    );

    if (breeding) {
      await Livestock.findByIdAndUpdate((breeding as any).damId, {
        status: 'active',
        lastBirthDate: new Date(birthDate as any),
      });
    }

    return breeding;
  }

  async getBreedingStats(farmId: string): Promise<{
    totalBreedings: number;
    activePregnancies: number;
    successfulBirths: number;
    upcomingBirths: number;
    averageOffspring: number;
  }> {
    const farmObjectId = new Types.ObjectId(farmId);
    const thirtyDaysAhead = new Date();
    thirtyDaysAhead.setDate(thirtyDaysAhead.getDate() + 30);

    const [total, pregnant, delivered, upcoming, avgOffspring] = await Promise.all([
      LivestockBreeding.countDocuments({ farmId: farmObjectId }),
      LivestockBreeding.countDocuments({ farmId: farmObjectId, status: 'confirmed_pregnant' }),
      LivestockBreeding.countDocuments({ farmId: farmObjectId, status: 'delivered' }),
      LivestockBreeding.countDocuments({
        farmId: farmObjectId,
        status: 'confirmed_pregnant',
        expectedDueDate: { $lte: thirtyDaysAhead, $gte: new Date() },
      }),
      LivestockBreeding.aggregate([
        { $match: { farmId: farmObjectId, status: 'delivered', offspringCount: { $gt: 0 } } },
        { $group: { _id: null, avg: { $avg: '$offspringCount' } } },
      ]),
    ]);

    return {
      totalBreedings: total,
      activePregnancies: pregnant,
      successfulBirths: delivered,
      upcomingBirths: upcoming,
      averageOffspring: avgOffspring[0]?.avg || 0,
    };
  }

  async deleteBreedingRecord(breedingId: string): Promise<boolean> {
    const result = await LivestockBreeding.findByIdAndDelete(breedingId);
    return !!result;
  }
}

export const livestockFeedBreedingService = new LivestockFeedBreedingService();
