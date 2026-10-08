export const RADIO_CHANNEL_MODES = [
  { value: 'HT', label: 'HT (A,B,G,N)' },
  { value: 'VHT', label: 'VHT (A,B,G,N,AC)' },
  { value: 'HE', label: 'HE (WiFi 6,A,B,G,N,AC,AX)' },
  { value: 'EHT', label: 'EHT (WiFi 7)' },
];

export const radioChannelWidths = (band?: string, mode?: string) => {
  const widths = [20, 40, 80, 160];
  if (band === '6G' && mode === 'EHT') widths.push(320);
  return widths.map((width) => ({ value: width, label: `${width} MHz` }));
};
