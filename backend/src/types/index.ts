import type { Context } from "hono";
import type { JWTPayload } from "jose";

export type Role = "admin" | "superadmin" | "founder";
export type RoomStatus = "available" | "occupied";
export type PersonStatus = "active" | "inactive";
export type NotificationMessageType =
  | "reminder_1"
  | "reminder_2"
  | "reminder_3"
  | "payment_confirmed";

export interface JwtPayload extends JWTPayload {
  userId: string;
  email: string;
  role: Role;
  pgId?: string;
}

export interface EnvBindings {
  DATABASE_URL: string;
  JWT_SECRET: string;
  FAST2SMS_API_KEY?: string;
  FAST2SMS_BASE_URL?: string;
  FAST2SMS_WHATSAPP_BASE_URL?: string;
  FAST2SMS_WHATSAPP_VERSION?: string;
  FAST2SMS_PHONE_NUMBER_ID?: string;
  FAST2SMS_TEMPLATE_LANGUAGE_CODE?: string;
  PAYMENT_LINK?: string;
  PAYMENT_UPI_ID?: string;
  PAYMENT_PAYEE_NAME?: string;
  PAYMENT_NOTE_PREFIX?: string;
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET_NAME: string;
  R2_PUBLIC_URL: string;
  FRONTEND_ORIGIN?: string;
}

export interface AppVariables {
  user?: JwtPayload;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T | null;
  message: string;
}

export const ok = <T>(c: Context, data: T, message = "Success", status = 200) => {
  return c.json<ApiResponse<T>>({ success: true, data, message }, status as never);
};

export const fail = (
  c: Context,
  message: string,
  status = 400,
  data: unknown = null
) => {
  return c.json<ApiResponse>({ success: false, data, message }, status as never);
};
