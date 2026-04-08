import { LivestockInventory } from '../Models/LivestockManagement';
import Livestock from '../Models/Livestock';
import { Types } from 'mongoose';
import { ILivestockInventory } from '../Types/livestock.types';

export class LivestockInventoryService {
  // ==================== INVENTORY TRANSACTIONS ====================

  async addTransaction(data: Partial<ILivestockInventory> & { farmId: string; userId: string }): Promise<ILivestockInventory> {
    const transaction = await LivestockInventory.create({
      ...data,
      farmId: new Types.ObjectId(data.farmId),
      recordedBy: new Types.ObjectId(data.userId),
      livestockId: data.livestockId ? new Types.ObjectId(data.livestockId as string) : undefined
    });

    // Update livestock status based on transaction type
    if (data.livestockId) {
      if (data.transactionType === 'sale' || data.transactionType === 'death') {
        await Livestock.findByIdAndUpdate(data.livestockId, {
          isActive: false,
          status: data.transactionType === 'death' ? 'deceased' : 'sold'
        });
      }
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
            totalValue: { $sum: '$totalValue' }
          }
        }
      ]),
      Livestock.aggregate([
        { $match: { farmId: farmObjectId, isActive: true } },
        {
          $group: {
            _id: '$species',
            count: { $sum: { $cond: [{ $eq: ['$trackingType', 'batch'] }, '$quantity', 1] } }
          }
        }
      ])
    ]);

    const byType: Record<string, { count: number; value: number }> = {};
    transactions.forEach((t: any) => {
      byType[t._id] = { count: t.count, value: t.totalValue || 0 };
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

    const [deaths, totalLivestock, byCause, bySpecies, byMonth] = await Promise.all([
      LivestockInventory.countDocuments({
        farmId: farmObjectId,
        transactionType: 'death',
        transactionDate: { $gte: startDate }
      }),
      Livestock.countDocuments({ farmId: farmObjectId }),
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
            _id: '$deathCause',
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
      ])
    ]);

    const totalDeaths = deaths;
    const mortalityRate = totalLivestock > 0 ? (totalDeaths / (totalLivestock + totalDeaths)) * 100 : 0;

    return {
      totalDeaths,
      mortalityRate: Math.round(mortalityRate * 100) / 100,
      byCause: byCause.map((c: any) => ({
        cause: c._id || 'Unknown',
        count: c.count,
        percentage: totalDeaths > 0 ? Math.round((c.count / totalDeaths) * 100) : 0
      })),
      bySpecies: bySpecies.map((s: any) => ({
        species: s._id,
        deaths: s.deaths,
        rate: 0 // Would need species count to calculate
      })),
      byMonth: byMonth.map((m: any) => ({
        month: m._id,
        deaths: m.deaths
      }))
    };
  }

  async getFinancialSummary(farmId: string, year?: number): Promise<{
    year: number;
    totalRevenue: number;
    totalExpenses: number;
    netProfit: number;
    byMonth: { month: string; revenue: number; expenses: number; profit: number }[];
    bySpecies: { species: string; revenue: number; expenses: number; profit: number }[];
  }> {
    const farmObjectId = new Types.ObjectId(farmId);
    const targetYear = year || new Date().getFullYear();
    const startDate = new Date(targetYear, 0, 1);
    const endDate = new Date(targetYear, 11, 31, 23, 59, 59);

    const transactions = await LivestockInventory.aggregate([
      {
        $match: {
          farmId: farmObjectId,
          transactionDate: { $gte: startDate, $lte: endDate },
          transactionType: { $in: ['purchase', 'sale'] }
        }
      },
      {
        $group: {
          _id: {
            month: { $dateToString: { format: '%Y-%m', date: '$transactionDate' } },
            type: '$transactionType'
          },
          total: { $sum: '$totalValue' }
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
      } else if (t._id.type === 'purchase') {
        byMonth[month].expenses += t.total || 0;
        totalExpenses += t.total || 0;
      }
    });

    return {
      year: targetYear,
      totalRevenue,
      totalExpenses,
      netProfit: totalRevenue - totalExpenses,
      byMonth: Object.entries(byMonth).map(([month, data]) => ({
        month,
        revenue: data.revenue,
        expenses: data.expenses,
        profit: data.revenue - data.expenses
      })).sort((a, b) => a.month.localeCompare(b.month)),
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
