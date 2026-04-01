import jwt from "jsonwebtoken";
import { AuthPayload } from "../Types/auth.types";

const ACCESS_TOKEN_SECRET = process.env.JWT_ACCESS_SECRET || "access-secret";
const REFRESH_TOKEN_SECRET = process.env.JWT_REFRESH_SECRET || "refresh-secret";

export const generateAccessToken = (payload: AuthPayload): string => {
  return jwt.sign(payload, ACCESS_TOKEN_SECRET, { expiresIn: "7d" });
};

export const generateRefreshToken = (payload: AuthPayload): string => {
  return jwt.sign(payload, REFRESH_TOKEN_SECRET, { expiresIn: "7d" });
};

export const verifyAccessToken = (token: string): AuthPayload => {
  return jwt.verify(token, ACCESS_TOKEN_SECRET) as AuthPayload;
};

export const verifyRefreshToken = (token: string): AuthPayload => {
  return jwt.verify(token, REFRESH_TOKEN_SECRET) as AuthPayload;
};
