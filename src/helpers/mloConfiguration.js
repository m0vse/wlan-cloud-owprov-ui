// Initial qualified profile: one SSID on two EHT AP radios, without rewriting security.
export function mloConfigurationError(ssid, iface) {
  if (ssid?.mlo !== true) return null;
  const bands = ssid['wifi-bands'];
  if (!Array.isArray(bands) || bands.length !== 2 || !bands.includes('5G') || !bands.includes('6G'))
    return 'MLO currently requires exactly the 5 GHz and 6 GHz bands.';
  if ((ssid['bss-mode'] || 'ap') !== 'ap') return 'MLO currently supports AP-mode SSIDs only.';
  if ((ssid.purpose || 'user-defined') !== 'user-defined') return 'MLO currently supports user-defined SSIDs only.';
  if (ssid.roaming) return 'Disable 802.11r roaming for the initial MLO profile.';
  if (ssid['multi-psk']?.length) return 'Multi-PSK is not supported in the initial MLO profile.';
  if (ssid.services?.includes('captive')) return 'Captive portals are not supported in the initial MLO profile.';
  if (iface?.['hostapd-bss-raw']?.length || ssid['hostapd-bss-raw']?.length)
    return 'Remove raw hostapd overrides for the initial MLO profile.';
  if (ssid.encryption?.proto !== 'sae' || ssid.encryption?.ieee80211w !== 'required')
    return 'MLO requires WPA3-Personal (SAE) with protected management frames required.';
  return null;
}
