export const encryptionForProtocol = (
  proto: string,
  current: { key?: string } | undefined,
  keyProtocols: readonly string[],
  pmfProtocols: readonly string[],
) => {
  const encryption: { proto: string; key?: string; ieee80211w?: string } = { proto };
  if (keyProtocols.includes(proto)) encryption.key = typeof current?.key === 'string' ? current.key : '';
  if (pmfProtocols.includes(proto)) encryption.ieee80211w = 'required';
  return encryption;
};
