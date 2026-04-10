import { LivestockVaccination } from '../Models/LivestockHealth';
import { LivestockBreeding } from '../Models/LivestockManagement';
import Livestock from '../Models/Livestock';
import Notification from '../Models/Notification';
import { createNotification } from './notification.service';

class LivestockAlertsService {
  // Get upcoming vaccination alerts for a farm
  async getVaccinationAlerts(farmId: string, daysAhead: number = 7) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + daysAhead);

    const upcomingVaccinations = await LivestockVaccination.find({
      farmId,
      nextDueDate: { $lte: targetDate, $gte: new Date() }
    })
      .populate('livestockId', 'name tagId species')
      .sort({ nextDueDate: 1 });

    return upcomingVaccinations
      .map(v => {
        const dueDate = v.nextDueDate ? new Date(v.nextDueDate as any) : null;
        if (!dueDate) return null;

        return {
          type: 'vaccination' as const,
          severity: this.getVaccinationSeverity(dueDate),
          livestock: v.livestockId,
          vaccineName: v.vaccineName,
          dueDate,
          message: `${(v.livestockId as any)?.name || (v.livestockId as any)?.tagId || 'Animal'} needs ${v.vaccineName} vaccination`
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));
  }

  // Get upcoming birth alerts
  async getBreedingAlerts(farmId: string, daysAhead: number = 30) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + daysAhead);

    const upcomingBirths = await LivestockBreeding.find({
      farmId,
      status: 'confirmed_pregnant',
      expectedDueDate: { $exists: true, $lte: targetDate, $gte: new Date() }
    })
      .populate('damId', 'name tagId species')
      .sort({ expectedDueDate: 1 });

    return upcomingBirths
      .map(b => {
        const dueDate = b.expectedDueDate ? new Date(b.expectedDueDate as any) : null;
        if (!dueDate) return null;

        return {
          type: 'breeding' as const,
          severity: this.getBreedingSeverity(dueDate),
          livestock: (b as any).damId,
          dueDate,
          message: `${((b as any).damId as any)?.name || ((b as any).damId as any)?.tagId || 'Animal'} expected to give birth`
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));
  }

  // Get all alerts for a farm
  async getAllAlerts(farmId: string) {
    const [vaccinations, breeding] = await Promise.all([
      this.getVaccinationAlerts(farmId, 14),
      this.getBreedingAlerts(farmId, 30)
    ]);

    const allAlerts = [...vaccinations, ...breeding];
    
    // Sort by severity then date
    allAlerts.sort((a, b) => {
      const severityOrder = { critical: 0, warning: 1, info: 2 };
      if (severityOrder[a.severity] !== severityOrder[b.severity]) {
        return severityOrder[a.severity] - severityOrder[b.severity];
      }
      return a.dueDate.getTime() - b.dueDate.getTime();
    });

    return allAlerts;
  }

  // Check and create notifications for overdue items
  async checkAndCreateNotifications(userId: string, farmId: string) {
    const alerts = await this.getAllAlerts(farmId);
    const criticalAlerts = alerts.filter(a => a.severity === 'critical');

    for (const alert of criticalAlerts) {
      // Check if notification already exists for this alert today
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const existingNotification = await Notification.findOne({
        userId,
        type: alert.type === 'vaccination' ? 'treatment' : 'system',
        createdAt: { $gte: today },
        message: { $regex: alert.message }
      });

      if (!existingNotification) {
        const livestockId = (alert.livestock as any)?._id?.toString();
        const link = livestockId ? `/livestock/${livestockId}` : `/livestock?farmId=${farmId}`;

        await createNotification(
          userId,
          alert.type === 'vaccination' ? 'Vaccination Due!' : 'Birth Expected Soon!',
          alert.message,
          alert.type === 'vaccination' ? 'treatment' : 'system',
          link
        );
      }
    }

    return criticalAlerts.length;
  }

  // Get health alerts (sick animals)
  async getHealthAlerts(farmId: string) {
    const sickAnimals = await Livestock.find({
      farmId,
      healthStatus: { $in: ['sick', 'critical', 'under_treatment'] },
      status: { $in: ['active', 'breeding'] }
    }).select('name tagId species healthStatus');

    return sickAnimals.map((animal: any) => ({
      type: 'health',
      severity: animal.healthStatus === 'critical' ? 'critical' : 'warning',
      livestock: animal,
      message: `${animal.name || animal.tagId} is ${animal.healthStatus}`
    }));
  }

  // Get dashboard alert summary
  async getAlertSummary(farmId: string) {
    const [vaccinations, breeding, health] = await Promise.all([
      this.getVaccinationAlerts(farmId, 7),
      this.getBreedingAlerts(farmId, 14),
      this.getHealthAlerts(farmId)
    ]);

    return {
      vaccinationsDue: vaccinations.length,
      upcomingBirths: breeding.length,
      sickAnimals: health.length,
      criticalCount: [...vaccinations, ...breeding, ...health].filter(a => a.severity === 'critical').length,
      alerts: {
        vaccinations: vaccinations.slice(0, 3),
        breeding: breeding.slice(0, 3),
        health: health.slice(0, 3)
      }
    };
  }

  private getVaccinationSeverity(dueDate: Date): 'critical' | 'warning' | 'info' {
    const daysUntil = Math.ceil((new Date(dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysUntil <= 0) return 'critical';
    if (daysUntil <= 3) return 'warning';
    return 'info';
  }

  private getBreedingSeverity(dueDate: Date): 'critical' | 'warning' | 'info' {
    const daysUntil = Math.ceil((new Date(dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysUntil <= 3) return 'critical';
    if (daysUntil <= 7) return 'warning';
    return 'info';
  }
}

export const livestockAlertsService = new LivestockAlertsService();
