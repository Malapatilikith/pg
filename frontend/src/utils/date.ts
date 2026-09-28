const dmyFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric"
});

const parseDateValue = (value: string | Date) => {
  if (value instanceof Date) {
    return value;
  }

  // Keep date-only strings stable across timezones.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  return new Date(value);
};

export const formatDateDMY = (value?: string | Date | null) => {
  if (!value) {
    return "-";
  }

  const parsed = parseDateValue(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return dmyFormatter.format(parsed).replace(/\//g, "-");
};
