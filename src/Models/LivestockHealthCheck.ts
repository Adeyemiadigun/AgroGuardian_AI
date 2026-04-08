import mongoose, { Schema } from 'mongoose';
import type {
  ILivestockHealthCheckReport,
  ILivestockHealthCheckItem,
  LivestockHealthCheckStatus,
} from '../Types/livestock.types';

const checkItemSchema = new Schema<ILivestockHealthCheckItem>(
  {
    key: { type: String, required: true },
    title: { type: String, required: true },
    status: {
      type: String,
      enum: ['ok', 'warning', 'critical', 'unknown'] satisfies LivestockHealthCheckStatus[],
      required: true,
    },
    score: { type: Number },
    findings: [{ type: String }],
    recommendations: [{ type: String }],
    data: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const healthCheckReportSchema = new Schema<ILivestockHealthCheckReport>(
  {
    livestockId: { type: Schema.Types.ObjectId, ref: 'Livestock', required: true, index: true },
    farmId: { type: Schema.Types.ObjectId, ref: 'Farm', required: true, index: true },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    generatedAt: { type: Date, default: Date.now, index: true },
    reason: { type: String },

    overallStatus: {
      type: String,
      enum: ['ok', 'warning', 'critical', 'unknown'] satisfies LivestockHealthCheckStatus[],
      required: true,
      default: 'unknown',
      index: true,
    },

    checks: { type: [checkItemSchema], default: [] },

    inputs: {
      species: { type: String },
      trackingType: { type: String },
      poultryType: { type: String },
      fishType: { type: String },
      dateOfBirth: { type: Date },
      acquisitionDate: { type: Date },
      weight: { type: Number },
      quantity: { type: Number },
      housingUnit: { type: String },
    },

    derived: {
      ageDays: { type: Number },
      ageWeeks: { type: Number },
    },

    ai: {
      used: { type: Boolean, default: false },
      model: { type: String },
      enhancedAt: { type: Date },
      summary: { type: String },
      flags: [{ type: String }],
    },

    version: { type: Number, default: 1 },
  },
  { timestamps: true }
);

healthCheckReportSchema.index({ livestockId: 1, generatedAt: -1 });
healthCheckReportSchema.index({ farmId: 1, generatedAt: -1 });
healthCheckReportSchema.index({ owner: 1, generatedAt: -1 });

export const LivestockHealthCheckReport = mongoose.model<ILivestockHealthCheckReport>(
  'LivestockHealthCheckReport',
  healthCheckReportSchema
);
