CREATE TYPE "public"."message_type" AS ENUM('reminder_1', 'reminder_2', 'reminder_3', 'payment_confirmed');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."person_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."reminder_run_mode" AS ENUM('all_unpaid', 'scheduled');--> statement-breakpoint
CREATE TYPE "public"."room_status" AS ENUM('available', 'occupied');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'superadmin', 'founder');--> statement-breakpoint
CREATE TABLE "notification_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pg_id" uuid,
	"person_id" uuid NOT NULL,
	"month" integer NOT NULL,
	"year" integer NOT NULL,
	"message_type" "message_type" NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "notification_status" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pg_id" uuid,
	"person_id" uuid NOT NULL,
	"month" integer NOT NULL,
	"year" integer NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"is_paid" boolean DEFAULT false NOT NULL,
	"paid_on" timestamp with time zone,
	"receipt_url" varchar(500),
	"marked_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "persons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"phone" varchar(20) NOT NULL,
	"email" varchar(255),
	"aadhaar_url" varchar(500),
	"pg_id" uuid,
	"room_id" uuid,
	"join_date" date NOT NULL,
	"payment_day" integer DEFAULT 1 NOT NULL,
	"status" "person_status" DEFAULT 'active' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "persons_payment_day_check" CHECK ("persons"."payment_day" >= 1 AND "persons"."payment_day" <= 28)
);
--> statement-breakpoint
CREATE TABLE "pg_whatsapp_settings" (
	"pg_id" uuid PRIMARY KEY NOT NULL,
	"whatsapp_enabled" boolean DEFAULT false NOT NULL,
	"whatsapp_api_key" varchar(255),
	"whatsapp_phone_number_id" varchar(120),
	"whatsapp_template_reminder" varchar(120),
	"whatsapp_template_confirmation" varchar(120),
	"whatsapp_template_language_code" varchar(10) DEFAULT 'en' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pg_whatsapp_settings_required_check" CHECK ("pg_whatsapp_settings"."whatsapp_enabled" = false OR (
        "pg_whatsapp_settings"."whatsapp_api_key" IS NOT NULL
        AND "pg_whatsapp_settings"."whatsapp_phone_number_id" IS NOT NULL
        AND "pg_whatsapp_settings"."whatsapp_template_reminder" IS NOT NULL
        AND "pg_whatsapp_settings"."whatsapp_template_confirmation" IS NOT NULL
      ))
);
--> statement-breakpoint
CREATE TABLE "pgs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pgs_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "reminder_run_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pg_id" uuid NOT NULL,
	"month" integer NOT NULL,
	"year" integer NOT NULL,
	"mode" "reminder_run_mode" DEFAULT 'all_unpaid' NOT NULL,
	"slot" integer NOT NULL,
	"triggered_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminder_run_limits_slot_check" CHECK ("reminder_run_limits"."slot" >= 1 AND "reminder_run_limits"."slot" <= 2),
	CONSTRAINT "reminder_run_limits_month_check" CHECK ("reminder_run_limits"."month" >= 1 AND "reminder_run_limits"."month" <= 12),
	CONSTRAINT "reminder_run_limits_year_check" CHECK ("reminder_run_limits"."year" >= 2000 AND "reminder_run_limits"."year" <= 3000)
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pg_id" uuid,
	"room_number" varchar(50) NOT NULL,
	"floor" varchar(50) NOT NULL,
	"capacity" integer NOT NULL,
	"rent_amount" numeric(10, 2) NOT NULL,
	"status" "room_status" DEFAULT 'available' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"email" varchar(255) NOT NULL,
	"password" varchar(255) NOT NULL,
	"role" "user_role" DEFAULT 'admin' NOT NULL,
	"pg_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_pg_id_pgs_id_fk" FOREIGN KEY ("pg_id") REFERENCES "public"."pgs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_pg_id_pgs_id_fk" FOREIGN KEY ("pg_id") REFERENCES "public"."pgs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_marked_by_users_id_fk" FOREIGN KEY ("marked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "persons" ADD CONSTRAINT "persons_pg_id_pgs_id_fk" FOREIGN KEY ("pg_id") REFERENCES "public"."pgs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "persons" ADD CONSTRAINT "persons_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "persons" ADD CONSTRAINT "persons_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pg_whatsapp_settings" ADD CONSTRAINT "pg_whatsapp_settings_pg_id_pgs_id_fk" FOREIGN KEY ("pg_id") REFERENCES "public"."pgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_run_limits" ADD CONSTRAINT "reminder_run_limits_pg_id_pgs_id_fk" FOREIGN KEY ("pg_id") REFERENCES "public"."pgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_run_limits" ADD CONSTRAINT "reminder_run_limits_triggered_by_users_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_pg_id_pgs_id_fk" FOREIGN KEY ("pg_id") REFERENCES "public"."pgs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_pg_id_pgs_id_fk" FOREIGN KEY ("pg_id") REFERENCES "public"."pgs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_person_month_year_uidx" ON "payments" USING btree ("person_id","month","year");--> statement-breakpoint
CREATE UNIQUE INDEX "reminder_run_limits_pg_month_year_mode_slot_uidx" ON "reminder_run_limits" USING btree ("pg_id","month","year","mode","slot");--> statement-breakpoint
CREATE UNIQUE INDEX "rooms_pg_room_number_uidx" ON "rooms" USING btree ("pg_id","room_number");