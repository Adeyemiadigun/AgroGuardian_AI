import User from "../Models/User";
import Token from "../Models/Token";
import { hashPassword, comparePassword } from "../Utils/hashPassword";
import {  generateAccessToken,  generateRefreshToken,  verifyRefreshToken,} from "../Utils/generateToken";
import {  generateRandomToken,  hashToken,} from "../Utils/generateRandomToken";
import {  sendVerificationEmail,  sendPasswordResetEmail,} from "./email.service";
import { RegisterInput } from "../Validators/auth.validator";
import { IUser } from "../Types/auth.types";
import { Profile } from "passport-google-oauth20";
import logger from "../Utils/logger";

export const registerUser = async (data: RegisterInput) => {
  const { firstName, lastName, email, password, role } = data;

  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    throw new Error("User with this email already exists");
  }

  const hashedPassword = await hashPassword(password);
  const verificationToken = generateRandomToken();
  const hashedVerificationToken = hashToken(verificationToken);

  const user = await User.create({
    firstName,
    lastName,
    email: email.toLowerCase(),
    password: hashedPassword,
    role: role || "farmer",
    emailVerificationToken: hashedVerificationToken,
    emailVerificationTokenExpires: new Date(Date.now() + 24 * 60 * 60 * 1000), 
  });

  await sendVerificationEmail(email, verificationToken);

  logger.info(`User registered: ${email}`);

  return {
    id: user._id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
    isEmailVerified: user.isEmailVerified,
  };
};

export const verifyUserEmail = async (token: string) => {
  const hashedToken = hashToken(token);

  const user = await User.findOne({
    emailVerificationToken: hashedToken,
    emailVerificationTokenExpires: { $gt: new Date() },
  });

  if (!user) {
    logger.error("Invalid or expired verification token");
    throw new Error("Invalid or expired verification token");
  }

  user.isEmailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationTokenExpires = undefined;
  await user.save();

  logger.info(`Email verified for: ${user.email}`);

  return { message: "Email verified successfully" };
};

export const loginUser = async (email: string, password: string) => {
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    throw new Error("Invalid email or password");
  }

  if (user.authProvider === "google" && !user.password) {
    throw new Error("This account uses Google sign-in. Please login with Google.");
  }

  const isMatch = await comparePassword(password, user.password!);
  if (!isMatch) {
    throw new Error("Invalid email or password");
  }

  if (!user.isEmailVerified) {
    throw new Error("Please verify your email before logging in");
  }

  const payload = {
    userId: user._id.toString(),
    email: user.email,
    role: user.role,
  };

  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  await Token.create({
    userId: user._id,
    refreshToken,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), 
  });

  logger.info(`User logged in: ${email}`);

  return {
    accessToken,
    refreshToken,
    user: {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
    },
  };
};

export const refreshUserToken = async (token: string) => {
  const storedToken = await Token.findOne({ refreshToken: token });
  if (!storedToken) {
    throw new Error("Invalid refresh token");
  }

  if (storedToken.expiresAt < new Date()) {
    await Token.deleteOne({ _id: storedToken._id });
    throw new Error("Refresh token expired");
  }

  const decoded = verifyRefreshToken(token);

  const accessToken = generateAccessToken({
    userId: decoded.userId,
    email: decoded.email,
    role: decoded.role,
  });

  logger.info(`Token refreshed for user: ${decoded.email}`);

  return { accessToken };
};

export const forgotUserPassword = async (email: string) => {
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    return { message: "If an account with that email exists, a password reset link has been sent" };
  }

  const resetToken = generateRandomToken();
  const hashedResetToken = hashToken(resetToken);

  user.passwordResetToken = hashedResetToken;
  user.passwordResetTokenExpires = new Date(Date.now() + 60 * 60 * 1000); 
  await user.save();

  await sendPasswordResetEmail(email, resetToken);

  logger.info(`Password reset email sent to: ${email}`);

  return { message: "If an account with that email exists, a password reset link has been sent" };
};

export const resetUserPassword = async (
  token: string,
  newPassword: string
) => {
  const hashedToken = hashToken(token);

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetTokenExpires: { $gt: new Date() },
  });

  if (!user) {
    throw new Error("Invalid or expired reset token");
  }

  user.password = await hashPassword(newPassword);
  user.passwordResetToken = undefined;
  user.passwordResetTokenExpires = undefined;
  await user.save();
  await Token.deleteMany({ userId: user._id });

  logger.info(`Password reset for: ${user.email}`);

  return { message: "Password reset successfully" };
};

export const logoutUser = async (userId: string) => {
  await Token.deleteMany({ userId });
  logger.info(`User logged out: ${userId}`);
  return { message: "Logged out successfully" };
};

export const handleGoogleUser = async (profile: Profile) => {
  const email = profile.emails?.[0]?.value;
  if (!email) {
    throw new Error("No email found in Google profile");
  }

  let user = await User.findOne({ email: email.toLowerCase() });

  if (user) {
    // Existing user — link Google account if not already linked
    if (!user.googleId) {
      user.googleId = profile.id;
      user.authProvider = "google";
      user.isEmailVerified = true;
      if (profile.photos?.[0]?.value) {
        user.profilePicture = profile.photos[0].value;
      }
      await user.save();
    }
  } else {
    // New user — create account from Google profile
    user = await User.create({
      firstName: profile.name?.givenName || "Google",
      lastName: profile.name?.familyName || "User",
      email: email.toLowerCase(),
      googleId: profile.id,
      authProvider: "google",
      isEmailVerified: true,
      profilePicture: profile.photos?.[0]?.value,
      role: "farmer",
    });
  }

  logger.info(`Google OAuth login: ${email}`);

  return user;
};

export const googleLogin = async (user: IUser) => {
  const payload = {
    userId: user._id.toString(),
    email: user.email,
    role: user.role,
  };

  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  await Token.create({
    userId: user._id,
    refreshToken,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  logger.info(`Google user logged in: ${user.email}`);

  return {
    accessToken,
    refreshToken,
    user: {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      profilePicture: user.profilePicture,
      authProvider: user.authProvider,
    },
  };
};
