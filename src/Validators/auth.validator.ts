import { z } from "zod";

export const registerSchema = z.object({
  firstName: z
    .string("First name is required")
    .min(2, "First name must be at least 2 characters")
    .max(50, "First name must not exceed 50 characters"),
  lastName: z
    .string("Last name is required")
    .min(2, "Last name must be at least 2 characters")
    .max(50, "Last name must not exceed 50 characters"),
  email: z
    .string("Email is required")
    .email("Invalid email address"),
  password: z
    .string("Password is required")
    .min(8, "Password must be at least 8 characters")
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      "Password must contain at least one uppercase letter, one lowercase letter, and one number"
    ),
  role: z.enum(["farmer", "admin", "organization"]).optional(),
});

export const loginSchema = z.object({
  email: z
    .string("Email is required")
    .email("Invalid email address"),
  password: z.string("Password is required"),
});

export const forgotPasswordSchema = z.object({
  email: z
    .string("Email is required")
    .email("Invalid email address"),
});

export const resetPasswordSchema = z.object({
  token: z.string("Token is required"),
  newPassword: z
    .string("New password is required")
    .min(8, "Password must be at least 8 characters")
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      "Password must contain at least one uppercase letter, one lowercase letter, and one number"
    ),
});

export const verifyEmailSchema = z.object({
  token: z.string("Verification token is required"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
