import mongoose, { Schema, Document } from "mongoose";

export interface INotification extends Document {
  userId: mongoose.Types.ObjectId;
  title: string;
  message: string;
  type: "diagnosis" | "weather" | "system" | "treatment";
  status: "unread" | "read";
  link?: string;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: { 
      type: String, 
      enum: ["diagnosis", "weather", "system", "treatment"], 
      default: "system" 
    },
    status: { type: String, enum: ["unread", "read"], default: "unread" },
    link: { type: String },
  },
  { timestamps: true }
);

NotificationSchema.index({ userId: 1, status: 1 });

export default mongoose.model<INotification>("Notification", NotificationSchema);
