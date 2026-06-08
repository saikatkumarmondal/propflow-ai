// backend/src/utils/email.ts
import nodemailer from "nodemailer";
import { ENV } from "../config/env";
import { logger } from "../config/logger";

const transporter = nodemailer.createTransport({
  host: ENV.SMTP_HOST,
  port: ENV.SMTP_PORT,
  secure: false,
  auth: {
    user: ENV.SMTP_USER,
    pass: ENV.SMTP_PASS,
  },
});

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export const sendEmail = async (options: SendEmailOptions): Promise<void> => {
  try {
    await transporter.sendMail({
      from: ENV.EMAIL_FROM,
      ...options,
    });
    logger.info(`Email sent to ${options.to}`);
  } catch (error) {
    logger.error("Email send failed:", error);
    throw new Error("Failed to send email");
  }
};

export const buildVerificationEmailHtml = (
  name: string,
  verificationUrl: string
): string => `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <h2>Welcome to PropFlow AI, ${name}!</h2>
    <p>Please verify your email address by clicking the button below:</p>
    <a href="${verificationUrl}" 
       style="background: #2563eb; color: white; padding: 12px 24px; 
              border-radius: 6px; text-decoration: none; display: inline-block;">
      Verify Email
    </a>
    <p>This link expires in 24 hours.</p>
    <p>If you didn't create an account, ignore this email.</p>
  </div>
`;

export const buildPasswordResetEmailHtml = (
  name: string,
  resetUrl: string
): string => `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <h2>Password Reset Request</h2>
    <p>Hi ${name}, click the button below to reset your password:</p>
    <a href="${resetUrl}" 
       style="background: #dc2626; color: white; padding: 12px 24px; 
              border-radius: 6px; text-decoration: none; display: inline-block;">
      Reset Password
    </a>
    <p>This link expires in 1 hour. If you didn't request this, ignore this email.</p>
  </div>
`;