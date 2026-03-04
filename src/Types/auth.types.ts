import { Document } from "mongoose";
import { Request } from "express";

export interface IUser extends Document {
  firstName: string;
  lastName: string;
  email: string;
  password?: string;
  role: "farmer" | "admin";
  isEmailVerified: boolean;
  googleId?: string;
  authProvider: "local" | "google";
  profilePicture?: string;
  emailVerificationToken?: string;
  emailVerificationTokenExpires?: Date;
  passwordResetToken?: string;
  passwordResetTokenExpires?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IToken extends Document {
  userId: IUser["_id"];
  refreshToken: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface AuthPayload {
  userId: string;
  email: string;
  role: string;
}

export interface AuthRequest extends Request {
  user?: AuthPayload;
}
