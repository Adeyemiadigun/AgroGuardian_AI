import { Response, NextFunction } from "express";
import { verifyAccessToken } from "../Utils/generateToken";
import { AuthRequest } from "../Types/auth.types";
import logger from "../Utils/logger";

export const authenticate = (  req: AuthRequest,  res: Response,  next: NextFunction): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ success: false, message: "Access token required" });
    return;
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = verifyAccessToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    logger.warn("Invalid access token attempt");
    res.status(401).json({ success: false, message: "Invalid or expired access token" });
    return;
  }
};

export const authorize = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, message: "Authentication required" });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ success: false, message: "Insufficient permissions" });
      return;
    }

    next();
  };
};
