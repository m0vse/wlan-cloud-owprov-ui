import { AlertSettings } from 'hooks/Network/VenueAlerts';

export const alertTypes = [['down', 'AP offline'], ['critical', 'Critical fault'], ['radio', 'Radio fault']] as const;
export const splitRecipients = (text: string) => [...new Set(text.split(/[,\n]/).map((value) => value.trim()).filter(Boolean))];
export const validPhone = (value: string) => /^\+[1-9]\d{6,14}$/.test(value);
export const validTimezone = (value: string) => {
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return !!value; } catch { return false; }
};
export const validateAlertSettings = (settings: AlertSettings): string => {
  if (!['venue', 'entity'].includes(settings.groupBy) || !Number.isInteger(settings.groupWindowSeconds) ||
    settings.groupWindowSeconds < 0 || settings.groupWindowSeconds > 3600) return 'Use a grouping window from 0 to 3600 seconds.';
  if (settings.emails.length > 20 || settings.phones.length > 20) return 'Use at most 20 recipients per channel.';
  if (settings.emails.some((value) => value.length > 254 || !/^[\x21-\x7e]+$/.test(value) ||
    !/^[^\s@<>:,;]+@[^\s@<>:,;]+\.[^\s@<>:,;]+$/.test(value))) return 'Enter valid email addresses.';
  if (settings.phones.some((value) => !validPhone(value))) return 'Use international phone numbers, for example +441234567890.';
  for (const rule of settings.rules) {
    if ([rule.delaySeconds, rule.recoveryDelaySeconds, rule.repeatSeconds].some((value) =>
      !Number.isInteger(value) || value % 60 !== 0 || value < 0 || value > 604800)) return 'Use whole minutes from 0 to 10080.';
    if (settings.enabled && rule.enabled && !rule.email && !rule.sms) return 'Choose a delivery channel for each enabled rule.';
    if (settings.enabled && rule.enabled && rule.email && !settings.emails.length) return 'Add an email recipient or disable email for the rule.';
    if (settings.enabled && rule.enabled && rule.sms && !settings.phones.length) return 'Add a phone recipient or disable SMS for the rule.';
  }
  if (!validTimezone(settings.quietHours.timezone)) return 'Enter a valid time zone, for example Europe/London.';
  if (![settings.quietHours.start, settings.quietHours.end].every((value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value))) return 'Enter valid quiet hours.';
  if (!settings.quietHours.days.length || (settings.quietHours.enabled && settings.quietHours.start === settings.quietHours.end)) return 'Choose quiet days and different start and end times.';
  if (!Number.isFinite(settings.muteUntil) || settings.muteUntil < 0) return 'Enter a valid mute end time.';
  return '';
};
export const localDateTime = (seconds: number) => {
  if (!seconds) return '';
  const date = new Date(seconds * 1000);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
