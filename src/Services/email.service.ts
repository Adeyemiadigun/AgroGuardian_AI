import logger from "../Utils/logger";
import { addEmailToQueue } from "../Queues/email.queue";

const BREVO_API_KEY = process.env.BREVO_API_KEY || "";
const FROM_EMAIL = process.env.FROM_EMAIL || "noreply@agroguardian.ai";
const FROM_NAME = "AgroGuardian AI";
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";


export const sendBrevoEmail = async (
  to: string,
  subject: string,
  htmlContent: string
): Promise<void> => {
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": BREVO_API_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: { name: FROM_NAME, email: FROM_EMAIL },
      to: [{ email: to }],
      subject,
      htmlContent,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    logger.error(`Brevo API error: ${error}`);
    throw new Error("Failed to send email");
  }
};

export const sendVerificationEmail = async (
  email: string,
  token: string
): Promise<void> => {
  const verificationUrl = `${CLIENT_URL}/verify-email?token=${token}`;

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2d7a3a;">🌱 Welcome to AgroGuardian AI!</h2>
      <p>Thank you for registering. Please verify your email address by clicking the button below:</p>
      <a href="${verificationUrl}" 
         style="display: inline-block; padding: 12px 24px; background-color: #2d7a3a; color: white; text-decoration: none; border-radius: 6px; margin: 16px 0;">
        Verify Email
      </a>
      <p>Or copy and paste this link in your browser:</p>
      <p style="word-break: break-all; color: #666;">${verificationUrl}</p>
      <p style="color: #999; font-size: 12px;">This link expires in 24 hours. If you didn't create an account, please ignore this email.</p>
    </div>
  `;

  await addEmailToQueue(email, "Verify Your Email - AgroGuardian AI", htmlContent);
};


export const sendBreedingFollowUpReminderEmail = async (
  email: string,
  args: {
    title: string;
    dueDate: Date;
    farmName?: string;
    damName?: string;
    species?: string;
  }
): Promise<void> => {
  const due = new Date(args.dueDate);
  const dueText = Number.isNaN(due.getTime()) ? '' : due.toLocaleDateString();

  const subject = `Breeding follow-up due: ${args.title}`;

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2d7a3a;">🐾 Breeding Follow-up Reminder</h2>
      <p>You have a breeding follow-up due${dueText ? ` on <strong>${dueText}</strong>` : ''}.</p>
      <div style="background: #f6ffed; border: 1px solid #b7eb8f; padding: 12px; border-radius: 8px; margin: 12px 0;">
        <p style="margin: 0;"><strong>Task:</strong> ${args.title}</p>
        ${args.farmName ? `<p style="margin: 6px 0 0;"><strong>Farm:</strong> ${args.farmName}</p>` : ''}
        ${args.damName ? `<p style="margin: 6px 0 0;"><strong>Dam:</strong> ${args.damName}${args.species ? ` (${args.species})` : ''}</p>` : ''}
      </div>
      <p>Please open AgroGuardian and complete the task on the due date.</p>
      <p style="color: #999; font-size: 12px;">If you believe this reminder is incorrect, you can review your breeding record in the app.</p>
    </div>
  `;

  await addEmailToQueue(email, subject, htmlContent);
};

export const sendPasswordResetEmail = async (
  email: string,
  token: string
): Promise<void> => {
  const resetUrl = `${CLIENT_URL}/reset-password?token=${token}`;

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2d7a3a;">🔒 Password Reset Request</h2>
      <p>You requested a password reset. Click the button below to set a new password:</p>
      <a href="${resetUrl}" 
         style="display: inline-block; padding: 12px 24px; background-color: #2d7a3a; color: white; text-decoration: none; border-radius: 6px; margin: 16px 0;">
        Reset Password
      </a>
      <p>Or copy and paste this link in your browser:</p>
      <p style="word-break: break-all; color: #666;">${resetUrl}</p>
      <p style="color: #999; font-size: 12px;">This link expires in 1 hour. If you didn't request a password reset, please ignore this email.</p>
    </div>
  `;

  await addEmailToQueue(email, "Reset Your Password - AgroGuardian AI", htmlContent);
};
