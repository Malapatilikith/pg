export type Role = "admin" | "superadmin" | "founder";

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginatedData<T> {
  items: T[];
  pagination: PaginationMeta;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  pgId?: string | null;
  pgName?: string | null;
  pgLogoUrl?: string | null;
  createdAt: string;
}

export interface Room {
  id: string;
  pgId?: string | null;
  pgName?: string | null;
  roomNumber: string;
  floor: string;
  capacity: number;
  rentAmount: string;
  status: "available" | "occupied";
  activeTenants?: number;
  createdAt: string;
}

export interface Person {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  aadhaarUrl?: string | null;
  roomId?: string | null;
  roomNumber?: string | null;
  rentAmount?: string | null;
  joinDate: string;
  paymentDay: number;
  status: "active" | "inactive";
  createdAt: string;
}

export interface Payment {
  id: string;
  personId: string;
  personName?: string;
  personPhone?: string;
  roomNumber?: string | null;
  month: number;
  year: number;
  amount: string;
  isPaid: boolean;
  lastPaidOn?: string | null;
  paidTill?: string | null;
  paidOn?: string | null;
  receiptUrl?: string | null;
}

export interface NotificationLog {
  id: string;
  personId: string;
  month: number;
  year: number;
  messageType: "reminder_1" | "reminder_2" | "reminder_3" | "payment_confirmed";
  sentAt: string;
  status: "sent" | "failed";
}

export interface PgScope {
  id: string;
  name: string;
  logoUrl?: string | null;
}

export interface PgSummary {
  id: string;
  name: string;
  logoUrl?: string | null;
  createdAt: string;
  whatsappEnabled?: boolean | null;
  roomsCount?: number;
  tenantsCount?: number;
}

export interface PgWhatsappSettings {
  pgId: string;
  whatsappEnabled: boolean;
  whatsappApiKey: string | null;
  whatsappPhoneNumberId: string | null;
  whatsappTemplateReminder: string | null;
  whatsappTemplateConfirmation: string | null;
  whatsappTemplateLanguageCode: string | null;
  updatedAt: string;
}
