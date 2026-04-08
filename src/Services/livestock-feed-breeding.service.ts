import { LivestockFeeding, LivestockBreeding } from '../Models/LivestockManagement';
import Livestock from '../Models/Livestock';
import { Types } from 'mongoose';
import { ILivestockFeeding, ILivestockBreeding } from '../Types/livestock.types';

export class LivestockFeedBreedingService {
  // ==================== FEEDING ====================

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
      query.feedingDate = {};
      if (options.startDate) query.feedingDate.$gte = options.startDate;
      if (options.endDate) query.feedingDate.$lte = options.endDate;
    }

    return LivestockFeeding.find(query)
      .populate('livestockId', 'name tagId species')
      .sort({ feedingDate: -1 })
      .limit(options.limit || 100);
  }

  async getFeedingSchedules(farmId: string): Promise<ILivestockFeeding[]> {
    return LivestockFeeding.find({
      farmId: new Types.ObjectId(farmId),
      isScheduled: true
    })
      .populate('livestockId', 'name tagId species')
      .sort({ scheduledTime: 1 });
  }

  async getFeedConsumptionStats(farmId: string, days: number = 30): Promise<{
    totalCost: number;
    totalQuantity: number;
    byFeedType: { feedType: string; quantity: number; cost: number }[];
    bySpecies: { species: string; quantity: number; cost: number }[];
  }> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const stats = await LivestockFeeding.aggregate([
      {
        $match: {
          farmId: new Types.ObjectId(farmId),
          feedingDate: { $gte: startDate }
        }
      },
      {
        $lookup: {
          from: 'livestocks',
          localField: 'livestockId',
          foreignField: '_id',
          as: 'livestock'
        }
      },
      {
        $unwind: { path: '$livestock', preserveNullAndEmptyArrays: true }
      },
      {
        $group: {
          _id: null,
          totalCost: { $sum: '$cost' },
          totalQuantity: { $sum: '$quantity' },
          records: { $push: '$$ROOT' }
        }
      }
    ]);

    const byFeedType = await LivestockFeeding.aggregate([
      {
        $match: {
          farmId: new Types.ObjectId(farmId),
          feedingDate: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$feedType',
          quantity: { $sum: '$quantity' },
          cost: { $sum: '$cost' }
        }
      },
      { $project: { feedType: '$_id', quantity: 1, cost: 1, _id: 0 } }
    ]);

    return {
      totalCost: stats[0]?.totalCost || 0,
      totalQuantity: stats[0]?.totalQuantity || 0,
      byFeedType,
      bySpecies: [] // Would need livestock join
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

  async addBreedingRecord(data: Partial<ILivestockBreeding> & { farmId: string; userId: string }): Promise<ILivestockBreeding> {
    const breeding = await LivestockBreeding.create({
      ...data,
      farmId: new Types.ObjectId(data.farmId),
      owner: new Types.ObjectId(data.userId),
      femaleId: new Types.ObjectId(data.femaleId as string),
      maleId: data.maleId ? new Types.ObjectId(data.maleId as string) : undefined
    });

    // Update female's breeding status
    await Livestock.findByIdAndUpdate(data.femaleId, {
      status: 'breeding',
      lastBreedingDate: data.breedingDate
    });

    return breeding;
  }

  async getBreedingRecords(farmId: string, options: {
    livestockId?: string;
    status?: string;
    limit?: number;
  } = {}): Promise<ILivestockBreeding[]> {
    const query: any = { farmId: new Types.ObjectId(farmId) };
    
    if (options.livestockId) {
      query.$or = [
        { femaleId: new Types.ObjectId(options.livestockId) },
        { maleId: new Types.ObjectId(options.livestockId) }
      ];
    }
    
    if (options.status) {
      query.status = options.status;
    }

    return LivestockBreeding.find(query)
      .populate('femaleId', 'name tagId species breed')
      .populate('maleId', 'name tagId species breed')
      .populate('offspringIds', 'name tagId species')
      .sort({ breedingDate: -1 })
      .limit(options.limit || 50);
  }

  async getActivePregnancies(farmId: string): Promise<ILivestockBreeding[]> {
    return LivestockBreeding.find({
      farmId: new Types.ObjectId(farmId),
      status: 'pregnant',
      expectedBirthDate: { $exists: true }
    })
      .populate('femaleId', 'name tagId species breed')
      .sort({ expectedBirthDate: 1 });
  }

  async getUpcomingBirths(farmId: string, days: number = 30): Promise<ILivestockBreeding[]> {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    return LivestockBreeding.find({
      farmId: new Types.ObjectId(farmId),
      status: 'pregnant',
      expectedBirthDate: { $lte: futureDate, $gte: new Date() }
    })
      .populate('femaleId', 'name tagId species breed')
      .sort({ expectedBirthDate: 1 });
  }

  async updateBreedingRecord(breedingId: string, data: Partial<ILivestockBreeding>): Promise<ILivestockBreeding | null> {
    const breeding = await LivestockBreeding.findByIdAndUpdate(
      breedingId,
      { $set: data },
      { new: true }
    );

    // If status changed to 'delivered', update female status
    if (breeding && data.status === 'delivered') {
      await Livestock.findByIdAndUpdate(breeding.femaleId, {
        status: 'active',
        lastBirthDate: data.actualBirthDate || new Date()
      });
    }

    return breeding;
  }

  async recordBirth(breedingId: string, birthData: {
    actualBirthDate: Date;
    numberOfOffspring: number;
    offspringIds?: string[];
    birthNotes?: string;
    complications?: string;
  }): Promise<ILivestockBreeding | null> {
    const breeding = await LivestockBreeding.findByIdAndUpdate(
      breedingId,
      {
        $set: {
          status: 'delivered',
          actualBirthDate: birthData.actualBirthDate,
          numberOfOffspring: birthData.numberOfOffspring,
          offspringIds: birthData.offspringIds?.map(id => new Types.ObjectId(id)),
          birthNotes: birthData.birthNotes,
          complications: birthData.complications
        }
      },
      { new: true }
    );

    if (breeding) {
      // Update parent livestock
      await Livestock.findByIdAndUpdate(breeding.femaleId, {
        status: 'active',
        lastBirthDate: birthData.actualBirthDate
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
      LivestockBreeding.countDocuments({ farmId: farmObjectId, status: 'pregnant' }),
      LivestockBreeding.countDocuments({ farmId: farmObjectId, status: 'delivered' }),
      LivestockBreeding.countDocuments({
        farmId: farmObjectId,
        status: 'pregnant',
        expectedBirthDate: { $lte: thirtyDaysAhead, $gte: new Date() }
      }),
      LivestockBreeding.aggregate([
        { $match: { farmId: farmObjectId, status: 'delivered', numberOfOffspring: { $gt: 0 } } },
        { $group: { _id: null, avg: { $avg: '$numberOfOffspring' } } }
      ])
    ]);

    return {
      totalBreedings: total,
      activePregnancies: pregnant,
      successfulBirths: delivered,
      upcomingBirths: upcoming,
      averageOffspring: avgOffspring[0]?.avg || 0
    };
  }

  async deleteBreedingRecord(breedingId: string): Promise<boolean> {
    const result = await LivestockBreeding.findByIdAndDelete(breedingId);
    return !!result;
  }
}

export const livestockFeedBreedingService = new LivestockFeedBreedingService();
