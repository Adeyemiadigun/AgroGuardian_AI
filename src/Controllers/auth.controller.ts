import { Request, Response } from "express";
import { AuthRequest, IUser } from "../Types/auth.types";
import {  registerUser,  verifyUserEmail,  loginUser,  refreshUserToken, forgotUserPassword,  resetUserPassword,  logoutUser, googleLogin,} from "../Services/auth.service";
import logger from "../Utils/logger";

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await registerUser(req.body);
    res.status(201).json({
      success: true,
      message: "Registration successful. Please check your email to verify your account.",
      data: user,
    });
  } catch (error: any) {
    logger.error("Registration error", error);
    res.status(400).json({
      success: false,
      message: error.message || "Registration failed",
    });
  }
};

export const verifyEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.query;
    if (!token || typeof token !== "string") {
      res.status(400).json({ success: false, message: "Verification token is required" });
      return;
    }

    const result = await verifyUserEmail(token);
    res.status(200).json({ success: true, ...result });
  } catch (error: any) {
    logger.error("Email verification error", error);
    res.status(400).json({
      success: false,
      message: error.message || "Email verification failed",
    });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;
    const result = await loginUser(email, password);
    res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    logger.error("Login error", error);
    res.status(401).json({
      success: false,
      message: error.message || "Login failed",
    });
  }
};

export const refreshToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400).json({ success: false, message: "Refresh token is required" });
      return;
    }

    const result = await refreshUserToken(refreshToken);
    res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    logger.error("Token refresh error", error);
    res.status(401).json({
      success: false,
      message: error.message || "Token refresh failed",
    });
  }
};

export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;
    const result = await forgotUserPassword(email);
    res.status(200).json({ success: true, ...result });
  } catch (error: any) {
    logger.error("Forgot password error", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to process request",
    });
  }
};

export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token, newPassword } = req.body;
    const result = await resetUserPassword(token, newPassword);
    res.status(200).json({ success: true, ...result });
  } catch (error: any) {
    logger.error("Reset password error", error);
    res.status(400).json({
      success: false,
      message: error.message || "Password reset failed",
    });
  }
};

export const logout = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: "Authentication required" });
      return;
    }

    const result = await logoutUser(req.user.userId);
    res.status(200).json({ success: true, ...result });
  } catch (error: any) {
    logger.error("Logout error", error);
    res.status(500).json({
      success: false,
      message: error.message || "Logout failed",
    });
  }
};

export const googleCallback = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user as unknown as IUser;
    if (!user) {
      res.status(401).json({ success: false, message: "Google authentication failed" });
      return;
    }

    const result = await googleLogin(user);

    const clientUrl = process.env.CLIENT_URL || "http://localhost:3000";
    const userBase64 = Buffer.from(JSON.stringify(result.user)).toString('base64');
    const redirectUrl = `${clientUrl}/auth/google/success?accessToken=${result.accessToken}&refreshToken=${result.refreshToken}&user=${userBase64}`;
    res.redirect(redirectUrl);
  } catch (error: any) {
    logger.error("Google callback error", error);
    const clientUrl = process.env.CLIENT_URL || "http://localhost:3000";
    res.redirect(`${clientUrl}/auth/google/error?message=${encodeURIComponent(error.message)}`);
  }
};
