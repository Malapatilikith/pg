import { eq } from "drizzle-orm";
import { getDb, pgWhatsappSettings } from "../db/schema";
import type { EnvBindings } from "../types";

export interface EnabledWhatsAppConfig {
  apiKey: string;
  phoneNumberId: string;
  languageCode: string;
  reminderTemplate: string;
  confirmationTemplate: string;
}

export type WhatsAppConfigResult =
  | { config: EnabledWhatsAppConfig }
  | { disabled: true }
  | { error: string };

const buildEnabledConfig = (row: {
  whatsappApiKey: string | null;
  whatsappPhoneNumberId: string | null;
  whatsappTemplateReminder: string | null;
  whatsappTemplateConfirmation: string | null;
  whatsappTemplateLanguageCode: string | null;
}): EnabledWhatsAppConfig | null => {
  if (!row.whatsappApiKey || !row.whatsappPhoneNumberId) {
    return null;
  }

  if (!row.whatsappTemplateReminder || !row.whatsappTemplateConfirmation) {
    return null;
  }

  return {
    apiKey: row.whatsappApiKey,
    phoneNumberId: row.whatsappPhoneNumberId,
    languageCode: row.whatsappTemplateLanguageCode || "en",
    reminderTemplate: row.whatsappTemplateReminder,
    confirmationTemplate: row.whatsappTemplateConfirmation
  };
};

export const getEnabledWhatsAppConfig = async (
  env: EnvBindings,
  pgId: string
): Promise<WhatsAppConfigResult> => {
  const db = getDb(env);
  const rows = await db
    .select({
      whatsappEnabled: pgWhatsappSettings.whatsappEnabled,
      whatsappApiKey: pgWhatsappSettings.whatsappApiKey,
      whatsappPhoneNumberId: pgWhatsappSettings.whatsappPhoneNumberId,
      whatsappTemplateReminder: pgWhatsappSettings.whatsappTemplateReminder,
      whatsappTemplateConfirmation: pgWhatsappSettings.whatsappTemplateConfirmation,
      whatsappTemplateLanguageCode: pgWhatsappSettings.whatsappTemplateLanguageCode
    })
    .from(pgWhatsappSettings)
    .where(eq(pgWhatsappSettings.pgId, pgId))
    .limit(1);

  const settings = rows[0];
  if (!settings) {
    return { error: "WhatsApp settings not configured for this PG" };
  }

  if (!settings.whatsappEnabled) {
    return { disabled: true };
  }

  const config = buildEnabledConfig(settings);
  if (!config) {
    return { error: "WhatsApp settings are incomplete for this PG" };
  }

  return { config };
};

export const listEnabledWhatsAppConfigs = async (env: EnvBindings) => {
  const db = getDb(env);
  const rows = await db
    .select({
      pgId: pgWhatsappSettings.pgId,
      whatsappApiKey: pgWhatsappSettings.whatsappApiKey,
      whatsappPhoneNumberId: pgWhatsappSettings.whatsappPhoneNumberId,
      whatsappTemplateReminder: pgWhatsappSettings.whatsappTemplateReminder,
      whatsappTemplateConfirmation: pgWhatsappSettings.whatsappTemplateConfirmation,
      whatsappTemplateLanguageCode: pgWhatsappSettings.whatsappTemplateLanguageCode
    })
    .from(pgWhatsappSettings)
    .where(eq(pgWhatsappSettings.whatsappEnabled, true));

  const configs: Array<{ pgId: string; config: EnabledWhatsAppConfig }> = [];
  for (const row of rows) {
    const config = buildEnabledConfig(row);
    if (config) {
      configs.push({ pgId: row.pgId, config });
    }
  }

  return configs;
};
