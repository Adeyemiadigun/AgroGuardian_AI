import mongoose, { Schema } from "mongoose";
import { IUser } from "../Types/auth.types";

const userSchema = new Schema<IUser>(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String },
    phoneNumber: { type: String },
    role: {
      type: String,
      enum: ["farmer", "admin", "organization"],
      default: "farmer",
    },
    isEmailVerified: { type: Boolean, default: false },
    googleId: { type: String, sparse: true },
    authProvider: {
      type: String,
      enum: ["local", "google"],
      default: "local",
    },
    profilePicture: { type: String },
    emailVerificationToken: { type: String },
    emailVerificationTokenExpires: { type: Date },
    passwordResetToken: { type: String },
    passwordResetTokenExpires: { type: Date },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IUser>("User", userSchema);