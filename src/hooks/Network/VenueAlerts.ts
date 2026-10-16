import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from 'contexts/AuthProvider';
import { hasAccessCapability } from 'helpers/userAccessPolicy';
import { axiosProv } from 'utils/axiosInstances';

export type AlertRule = { type: 'down' | 'critical' | 'radio'; enabled: boolean; delaySeconds: number;
  recoveryDelaySeconds: number; repeatSeconds: number; recovery: boolean; email: boolean; sms: boolean };
export type AlertSettings = { enabled: boolean; emails: string[]; phones: string[]; rules: AlertRule[];
  groupBy: 'venue' | 'entity'; groupWindowSeconds: number;
  quietHours: { enabled: boolean; timezone: string; start: string; end: string; days: number[] }; muteUntil: number };
export type AlertEvent = { id: string; type: string; device?: string; name?: string; status: string;
  channel: string; recipient: string; time: number };
export type AlertScopeKind = 'venue' | 'entity';
export type VenueAlertsResponse = { settings: AlertSettings; events: AlertEvent[]; available: boolean;
  configured: boolean; inherited: boolean; sourceScope?: { kind: AlertScopeKind; id: string; name: string } };
export const useVenueAlerts = (id: string, kind: AlertScopeKind = 'venue') => {
  const { user } = useAuth();
  return useQuery(['venue-alerts', user?.id, user?.securityPolicy, kind, id], async ({ signal }) => {
    try { return (await axiosProv.get<VenueAlertsResponse>(`${kind}/${encodeURIComponent(id)}?alerts=true`, { signal })).data; }
    catch { throw new Error('Alerts could not be loaded.'); }
  }, { enabled: !!id && hasAccessCapability(user, 'devices.read'), retry: false, cacheTime: 0,
    keepPreviousData: false, refetchOnWindowFocus: true });
};
export const useUpdateVenueAlerts = (id: string, kind: AlertScopeKind = 'venue') => {
  const { user } = useAuth();
  const client = useQueryClient();
  return useMutation(async (settings: AlertSettings | { inherit: true }) => {
    if (!hasAccessCapability(user, 'resources.write')) throw new Error('Access denied.');
    try { return (await axiosProv.put<VenueAlertsResponse>(`${kind}/${encodeURIComponent(id)}?alerts=true`, settings)).data; }
    catch { throw new Error('Alerts could not be saved.'); }
  }, { onSuccess: () => client.invalidateQueries(['venue-alerts', user?.id, user?.securityPolicy, kind, id]) });
};
