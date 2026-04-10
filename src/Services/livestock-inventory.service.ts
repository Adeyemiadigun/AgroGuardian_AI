import { LivestockInventory } from '../Models/LivestockManagement';
import Livestock from '../Models/Livestock';
import { Types } from 'mongoose';
import { ILivestockInventory } from '../Types/livestock.types';

export class LivestockInventoryService {
  // ==================== INVENTORY TRANSACTIONS ====================

  async addTransaction(data: Partial<ILivestockInventory> & { farmId: string; userId: string }): Promise<ILivestockInventory> {
    const { farmId, userId, livestockId, ...rest } = data as any;

    const httpError = (status: number, message: string) => {
      const err: any = new Error(message);
      err.status = status;
      return err;
    };

    const payload: any = {
      ...rest,
      farmId: new Types.ObjectId(farmId),
      owner: new Types.ObjectId(userId),
      livestockId: livestockId ? new Types.ObjectId(livestockId as string) : undefined
    };

    const qty = Number(payload.quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      throw httpError(400, 'Quantity must be a positive number');
    }
    payload.quantity = qty;

    const livestock = payload.livestockId
      ? await Livestock.findById(payload.livestockId).select('farmId owner species trackingType quantity cost status')
      : null;

    if (payload.livestockId) {
      if (!livestock) throw httpError(404, 'Livestock not found');
      if (String((livestock as any).farmId) !== String(payload.farmId)) {
        throw httpError(403, 'Livestock does not belong to this farm');
      }
      if (String((livestock as any).owner) !== String(payload.owner)) {
        throw httpError(403, 'Not allowed to record transactions for this livestock');
      }

      // Ensure species matches the selected livestock (avoids mismatches from the client)
      payload.species = (livestock as any).species;
    }

    // ===================== Death handling (loss + batch-safe status/quantity) =====================
    if (payload.transactionType === 'death') {
      if (!payload.livestockId || !livestock) {
        throw httpError(400, 'Death transactions require selecting a livestock/batch');
      }

      // Use estimated selling value (Livestock.cost) as the default loss-per-animal.
      if (payload.unitPrice == null) {
        const cost = Number((livestock as any).cost);
        if (!Number.isFinite(cost)) {
          throw httpError(400, 'Estimated selling value (cost) is required to record death loss');
        }

        // For batch livestock, `cost` is stored as TOTAL batch value, so infer per-animal value.
        if ((livestock as any).trackingType === 'batch') {
          const currentQty = Number((livestock as any).quantity || 0);
          if (!Number.isFinite(currentQty) || currentQty <= 0) {
            throw httpError(400, 'This batch has no remaining quantity to infer per-animal value');
          }
          payload.unitPrice = cost / currentQty;
        } else {
          payload.unitPrice = cost;
        }
      }

      if (payload.totalAmount == null && payload.unitPrice != null && payload.quantity != null) {
        payload.totalAmount = Number(payload.unitPrice) * Number(payload.quantity);
      }

      if ((livestock as any).trackingType === 'batch') {
        const currentQty = Number((livestock as any).quantity || 0);
        if (!Number.isFinite(currentQty) || currentQty <= 0) {
          throw httpError(400, 'This batch has no remaining quantity to deduct from');
        }
        if (payload.quantity > currentQty) {
          throw httpError(400, `Death quantity (${payload.quantity}) cannot exceed batch quantity (${currentQty})`);
        }

        const nextQty = currentQty - payload.quantity;
        const update: any = { quantity: nextQty };
        if (nextQty <= 0) update.status = 'deceased';
        await Livestock.findByIdAndUpdate(payload.livestockId, update);
      } else {
        await Livestock.findByIdAndUpdate(payload.livestockId, { status: 'deceased' });
      }
    }

    // Defensive: compute totalAmount if not provided but we have unitPrice + quantity
    if (
      (payload.transactionType === 'purchase' || payload.transactionType === 'sale') &&
      payload.totalAmount == null &&
      payload.unitPrice != null &&
      payload.quantity != null
    ) {
      payload.totalAmount = Number(payload.unitPrice) * Number(payload.quantity);
    }

    const transaction = await LivestockInventory.create(payload);

    // Update livestock status based on transaction type
    if (payload.livestockId && payload.transactionType === 'sale') {
      await Livestock.findByIdAndUpdate(payload.livestockId, {
        status: 'sold'
      });
    }

    return transaction;
  }

  async getTransactions(farmId: string, options: {
    type?: string;
    species?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  } = {}): Promise<ILivestockInventory[]> {
    const query: any = { farmId: new Types.ObjectId(farmId) };
    
    if (options.type) query.transactionType = options.type;
    if (options.species) query.species = options.species;
    
    if (options.startDate || options.endDate) {
      query.transactionDate = {};
      if (options.startDate) query.transactionDate.$gte = options.startDate;
      if (options.endDate) query.transactionDate.$lte = options.endDate;
    }

    return LivestockInventory.find(query)
      .populate('livestockId', 'name tagId species breed')
      .sort({ transactionDate: -1 })
      .limit(options.limit || 100);
  }

  async getInventorySummary(farmId: string): Promise<{
    totalPurchases: number;
    totalSales: number;
    totalBirths: number;
    totalDeaths: number;
    totalTransfers: number;
    netChange: number;
    totalPurchaseCost: number;
    totalSalesRevenue: number;
    profitLoss: number;
    bySpecies: {
      species: string;
      purchases: number;
      sales: number;
      births: number;
      deaths: number;
      current: number;
    }[];
  }> {
    const farmObjectId = new Types.ObjectId(farmId);

    const [transactions, currentBySpecies] = await Promise.all([
      LivestockInventory.aggregate([
        { $match: { farmId: farmObjectId } },
        {
          $group: {
            _id: '$transactionType',
            count: { $sum: '$quantity' },
            totalAmount: { $sum: { $ifNull: ['$totalAmount', 0] } }
          }
        }
      ]),
      Livestock.aggregate([
        {
          $match: {
            farmId: farmObjectId,
            status: { $nin: ['sold', 'deceased'] }
          }
        },
        {
          $group: {
            _id: '$species',
            count: { $sum: { $cond: [{ $eq: ['$trackingType', 'batch'] }, { $ifNull: ['$quantity', 1] }, 1] } }
          }
        }
      ])
    ]);

    const byType: Record<string, { count: number; value: number }> = {};
    transactions.forEach((t: any) => {
      byType[t._id] = { count: t.count, value: t.totalAmount || 0 };
    });

    const purchases = byType['purchase']?.count || 0;
    const sales = byType['sale']?.count || 0;
    const births = byType['birth']?.count || 0;
    const deaths = byType['death']?.count || 0;
    const transfers = (byType['transfer_in']?.count || 0) - (byType['transfer_out']?.count || 0);

    const purchaseCost = byType['purchase']?.value || 0;
    const salesRevenue = byType['sale']?.value || 0;

    // Get species breakdown
    const speciesBreakdown = await LivestockInventory.aggregate([
      { $match: { farmId: farmObjectId } },
      {
        $group: {
          _id: { species: '$species', type: '$transactionType' },
          count: { $sum: '$quantity' }
        }
      }
    ]);

    const speciesMap: Record<string, any> = {};
    speciesBreakdown.forEach((item: any) => {
      const species = item._id.species;
      if (!speciesMap[species]) {
        speciesMap[species] = { species, purchases: 0, sales: 0, births: 0, deaths: 0, current: 0 };
      }
      if (item._id.type === 'purchase') speciesMap[species].purchases = item.count;
      if (item._id.type === 'sale') speciesMap[species].sales = item.count;
      if (item._id.type === 'birth') speciesMap[species].births = item.count;
      if (item._id.type === 'death') speciesMap[species].deaths = item.count;
    });

    currentBySpecies.forEach((item: any) => {
      if (speciesMap[item._id]) {
        speciesMap[item._id].current = item.count;
      } else {
        speciesMap[item._id] = { species: item._id, purchases: 0, sales: 0, births: 0, deaths: 0, current: item.count };
      }
    });

    return {
      totalPurchases: purchases,
      totalSales: sales,
      totalBirths: births,
      totalDeaths: deaths,
      totalTransfers: transfers,
      netChange: purchases + births + transfers - sales - deaths,
      totalPurchaseCost: purchaseCost,
      totalSalesRevenue: salesRevenue,
      profitLoss: salesRevenue - purchaseCost,
      bySpecies: Object.values(speciesMap)
    };
  }

  async getMortalityReport(farmId: string, days: number = 90): Promise<{
    totalDeaths: number;
    mortalityRate: number;
    byCause: { cause: string; count: number; percentage: number }[];
    bySpecies: { species: string; deaths: number; rate: number }[];
    byMonth: { month: string; deaths: number }[];
  }> {
    const farmObjectId = new Types.ObjectId(farmId);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const [totalDeathsAgg, totalLivestockAgg, byCause, bySpeciesDeaths, byMonth, livestockBySpecies] = await Promise.all([
      LivestockInventory.aggregate([
        {
          $match: {
            farmId: farmObjectId,
            transactionType: 'death',
            transactionDate: { $gte: startDate }
          }
        },
        { $group: { _id: null, total: { $sum: '$quantity' } } }
      ]),
      Livestock.aggregate([
        {
          $match: {
            farmId: farmObjectId,
            status: { $nin: ['sold', 'deceased'] }
          }
        },
        {
          $group: {
            _id: null,
            count: { $sum: { $cond: [{ $eq: ['$trackingType', 'batch'] }, { $ifNull: ['$quantity', 1] }, 1] } }
          }
        }
      ]),
      LivestockInventory.aggregate([
        {
          $match: {
            farmId: farmObjectId,
            transactionType: 'death',
            transactionDate: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: '$causeOfDeath',
            count: { $sum: '$quantity' }
          }
        },
        { $sort: { count: -1 } }
      ]),
      LivestockInventory.aggregate([
        {
          $match: {
            farmId: farmObjectId,
            transactionType: 'death',
            transactionDate: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: '$species',
            deaths: { $sum: '$quantity' }
          }
        }
      ]),
      LivestockInventory.aggregate([
        {
          $match: {
            farmId: farmObjectId,
            transactionType: 'death',
            transactionDate: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$transactionDate' } },
            deaths: { $sum: '$quantity' }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      Livestock.aggregate([
        {
          $match: {
            farmId: farmObjectId,
            status: { $nin: ['sold', 'deceased'] }
          }
        },
        {
          $group: {
            _id: '$species',
            count: { $sum: { $cond: [{ $eq: ['$trackingType', 'batch'] }, { $ifNull: ['$quantity', 1] }, 1] } }
          }
        }
      ])
    ]);

    const totalDeaths = totalDeathsAgg?.[0]?.total || 0;
    const totalLivestock = totalLivestockAgg?.[0]?.count || 0;

    const mortalityRate = totalLivestock > 0
      ? (totalDeaths / (totalLivestock + totalDeaths)) * 100
      : 0;

    const livestockCountBySpecies: Record<string, number> = {};
    livestockBySpecies.forEach((s: any) => {
      livestockCountBySpecies[s._id] = s.count || 0;
    });

    return {
      totalDeaths,
      mortalityRate: Math.round(mortalityRate * 100) / 100,
      byCause: byCause.map((c: any) => ({
        cause: c._id || 'Unknown',
        count: c.count,
        percentage: totalDeaths > 0 ? Math.round((c.count / totalDeaths) * 100) : 0
      })),
      bySpecies: bySpeciesDeaths.map((s: any) => {
        const alive = livestockCountBySpecies[s._id] || 0;
        const deaths = s.deaths || 0;
        const rate = alive + deaths > 0 ? (deaths / (alive + deaths)) * 100 : 0;
        return {
          species: s._id,
          deaths,
          rate: Math.round(rate * 100) / 100
        };
      }),
      byMonth: byMonth.map((m: any) => ({
        month: m._id,
        deaths: m.deaths
      }))
    };
  }

  async getFinancialSummary(farmId: string, year?: number): Promise<{
    year: number | null;
    totalRevenue: number;
    totalExpenses: number;
    netProfit: number;
    byMonth: { month: string; revenue: number; expenses: number; profit: number }[];
    bySpecies: { species: string; revenue: number; expenses: number; profit: number }[];
  }> {
    const farmObjectId = new Types.ObjectId(farmId);

    const match: any = {
      farmId: farmObjectId,
      transactionType: { $in: ['purchase', 'sale', 'death'] }
    };

    // If year is provided, filter to that year; otherwise return all-time totals.
    if (year) {
      const startDate = new Date(year, 0, 1);
      const endDate = new Date(year, 11, 31, 23, 59, 59);
      match.transactionDate = { $gte: startDate, $lte: endDate };
    }

    const transactions = await LivestockInventory.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            month: { $dateToString: { format: '%Y-%m', date: '$transactionDate' } },
            type: '$transactionType'
          },
          total: { $sum: { $ifNull: ['$totalAmount', 0] } }
        }
      }
    ]);

    const byMonth: Record<string, { revenue: number; expenses: number }> = {};
    let totalRevenue = 0;
    let totalExpenses = 0;

    transactions.forEach((t: any) => {
      const month = t._id.month;
      if (!byMonth[month]) byMonth[month] = { revenue: 0, expenses: 0 };
      
      if (t._id.type === 'sale') {
        byMonth[month].revenue += t.total || 0;
        totalRevenue += t.total || 0;
      } else if (t._id.type === 'purchase' || t._id.type === 'death') {
        byMonth[month].expenses += t.total || 0;
        totalExpenses += t.total || 0;
      }
    });

    return {
      year: year || null,
      totalRevenue,
      totalExpenses,
      netProfit: totalRevenue - totalExpenses,
      byMonth: Object.entries(byMonth)
        .map(([month, data]) => ({
          month,
          revenue: data.revenue,
          expenses: data.expenses,
          profit: data.revenue - data.expenses
        }))
        .sort((a, b) => a.month.localeCompare(b.month)),
      bySpecies: [] // Would need additional aggregation
    };
  }

  async updateTransaction(transactionId: string, data: Partial<ILivestockInventory>): Promise<ILivestockInventory | null> {
    return LivestockInventory.findByIdAndUpdate(transactionId, { $set: data }, { new: true });
  }

  async deleteTransaction(transactionId: string): Promise<boolean> {
    const result = await LivestockInventory.findByIdAndDelete(transactionId);
    return !!result;
  }
}

export const livestockInventoryService = new LivestockInventoryService();
