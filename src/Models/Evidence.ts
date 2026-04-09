import mongoose, { Schema } from "mongoose";
import { IEvidence } from "../Types/farm.practices.types";

const EvidenceSchema = new Schema<IEvidence>({
  farmId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Farm",
    required: true,
  },
  practiceLogId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "PracticeActivityLogs",
    required: true,
  },
  imageUrl: {
    type: String,
    required: true,
  },
  description: {
    type: String,
  },
  evidenceType: {
    type: String,
    enum: ["start", "end"],
    required: true,
  },
  exifData: {
    latitude: Number,
    longitude: Number,
    takenAt: Date,
    cameraModel: String,
  },
  uploadedAt: {
    type: Date,
    default: Date.now,
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

const Evidence = mongoose.model<IEvidence>("Evidence", EvidenceSchema);

export default Evidence;
