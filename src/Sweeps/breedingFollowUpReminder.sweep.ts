import { LivestockBreeding } from '../Models/LivestockManagement';
import logger from '../Utils/logger';
import { sendBreedingFollowUpReminderEmail } from '../Services/email.service';

const dayKey = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
};

export const runBreedingFollowUpReminderSweep = async (): Promise<{
  remindersQueued: number;
  recordsUpdated: number;
}> => {
  const now = new Date();
  const today = dayKey(now);

  logger.info('Breeding follow-up reminder sweep started');

  const records = await LivestockBreeding.find({
    status: 'confirmed_pregnant',
    followUps: { $elemMatch: { status: 'pending' } },
  })
    .populate('farmId', 'name')
    .populate('damId', 'name tagId species')
    .populate('owner', 'email firstName lastName')
    .limit(200);

  let remindersQueued = 0;
  let recordsUpdated = 0;

  for (const breeding of records) {
    const followUps: any[] = Array.isArray((breeding as any).followUps) ? (breeding as any).followUps : [];
    let touched = false;

    for (const f of followUps) {
      if (!f || f.status !== 'pending' || !f.dueDate) continue;
      if (f.reminderSentAt) continue;

      const due = dayKey(new Date(f.dueDate));
      if (due > today) continue;

      const owner = (breeding as any).owner;
      const to = owner?.email;
      if (!to) continue;

      const farmName = (breeding as any).farmId?.name;
      const damName = (breeding as any).damId?.name || (breeding as any).damId?.tagId;
      const species = (breeding as any).damId?.species;

      await sendBreedingFollowUpReminderEmail(to, {
        title: f.title,
        dueDate: new Date(f.dueDate),
        farmName,
        damName,
        species,
      });

      f.reminderSentAt = now;
      remindersQueued++;
      touched = true;
    }

    if (touched) {
      await breeding.save();
      recordsUpdated++;
    }
  }

  logger.info('Breeding follow-up reminder sweep completed', {
    remindersQueued,
    recordsUpdated,
  });

  return { remindersQueued, recordsUpdated };
};
