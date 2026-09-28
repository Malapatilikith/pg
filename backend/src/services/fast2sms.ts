import type { EnvBindings } from "../types";

type TemplateMessage = {
  templateName: string;
  bodyParameters: string[];
};

export interface WhatsAppProviderConfig {
  apiKey: string;
  phoneNumberId: string;
  languageCode: string;
}

const monthName = (month: number, year: number) => {
  return new Date(year, month - 1, 1).toLocaleString("en-IN", { month: "long" });
};

const formatPaidOnDate = (value: Date) => {
  const date = new Date(value);
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
};

const ensureIndianMobileNumber = (phone: string) => {
  const normalized = phone.trim();

  if (/^91\d{10}$/.test(normalized)) {
    return normalized;
  }

  if (/^\+91\d{10}$/.test(normalized)) {
    return normalized.slice(1);
  }

  if (/^\d{10}$/.test(normalized)) {
    return `91${normalized}`;
  }

  throw new Error("Phone number must be 10 digits, 91XXXXXXXXXX, or +91XXXXXXXXXX format");
};

export const buildReminderMessage = (
  templateName: string,
  name: string,
  roomNumber: string | null,
  month: number,
  year: number
) => {
  const pendingMonth = `${monthName(month, year)} ${year}`;
  const normalizedRoom = roomNumber?.trim() || "N/A";

  return {
    templateName,
    bodyParameters: [name, normalizedRoom, pendingMonth]
  };
};

export const buildPaymentConfirmationMessage = (
  templateName: string,
  name: string,
  paidOn: Date,
  month: number,
  year: number
) => {
  return {
    templateName,
    bodyParameters: [name, formatPaidOnDate(paidOn), monthName(month, year), String(year)]
  };
};

type Fast2SmsResponse = {
  return?: boolean;
  success?: boolean;
  request_id?: string;
  requestId?: string;
  messages?: Array<{ id?: string }>;
  data?: unknown;
  message?: string | string[];
  errors?: string[];
  error?:
    | string
    | {
      message?: string;
      error_data?: {
        details?: string;
      };
    };
};

const extractProviderMessage = (result: Fast2SmsResponse, responseText = ""): string => {
  if (Array.isArray(result.errors) && result.errors.length > 0) {
    return result.errors.join(", ");
  }

  if (Array.isArray(result.message)) {
    return result.message.join(", ");
  }

  if (typeof result.error === "string") {
    return result.error;
  }

  if (result.error?.error_data?.details) {
    return result.error.error_data.details;
  }

  if (result.error?.message) {
    return result.error.message;
  }

  if (typeof result.message === "string" && result.message.trim()) {
    return result.message;
  }

  return responseText || "Failed to send WhatsApp message";
};

export const sendWhatsAppMessage = async (
  env: EnvBindings,
  provider: WhatsAppProviderConfig,
  toPhone: string,
  body: TemplateMessage
): Promise<{ sid: string; status: string }> => {
  const to = ensureIndianMobileNumber(toPhone);
  const rawBase =
    env.FAST2SMS_WHATSAPP_BASE_URL?.trim() ||
    env.FAST2SMS_BASE_URL?.trim() ||
    "https://www.fast2sms.com";
  const baseUrl = (() => {
    try {
      return new URL(rawBase).origin;
    } catch {
      return "https://www.fast2sms.com";
    }
  })();
  const version = env.FAST2SMS_WHATSAPP_VERSION?.trim() || "v24.0";
  const phoneNumberId = provider.phoneNumberId.trim();
  const languageCode = provider.languageCode.trim() || "en";

  if (!provider.apiKey.trim()) {
    throw new Error("Missing WhatsApp API key for this PG");
  }

  if (!phoneNumberId) {
    throw new Error("Missing WhatsApp phone number id for this PG");
  }

  const url = `${baseUrl}/dev/whatsapp/${encodeURIComponent(version)}/${encodeURIComponent(phoneNumberId)}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: {
      name: body.templateName,
      language: {
        code: languageCode
      },
      components: [
        {
          type: "body",
          parameters: body.bodyParameters.map((value) => ({
            type: "text",
            text: value
          }))
        }
      ]
    }
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: provider.apiKey,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(payload)
  });

  const responseText = await response.text();
  let result: Fast2SmsResponse = {};
  if (responseText) {
    try {
      result = JSON.parse(responseText) as Fast2SmsResponse;
    } catch {
      result = {};
    }
  }

  if (!response.ok || result.error) {
    const providerMessage = extractProviderMessage(result, responseText);
    throw new Error(`Fast2SMS rejected message (${response.status}): ${providerMessage}`);
  }

  const sid =
    result.messages?.[0]?.id ||
    result.request_id ||
    result.requestId ||
    `fast2sms-${Date.now()}`;
  return { sid, status: "sent" };
};