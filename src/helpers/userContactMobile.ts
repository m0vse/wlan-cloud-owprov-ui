// Contact information is independent of the verified phone used for SMS MFA.
export const validContactMobile = (value?: string) => !value?.trim() || /^\+[1-9]\d{6,14}$/.test(value.trim());
export const contactMobilePatch = (value?: string, current?: string) => {
  const next = value?.trim() ?? '';
  return next === (current ?? '') ? {} : { contactMobileNumber: next };
};
