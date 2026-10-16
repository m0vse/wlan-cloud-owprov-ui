import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from 'contexts/AuthProvider';
import { axiosSec } from 'utils/axiosInstances';

export type SmsSettings = { configured: boolean; enabled: boolean; accountSid: string; fromNumber: string; tokenSet: boolean };
export type SmsSettingsUpdate = { enabled: boolean; accountSid: string; fromNumber: string;
  tokenAction: 'retain' | 'set' | 'clear'; token?: string };
// Never allow a response credential into query or mutation state.
const publicSettings = (data: SmsSettings): SmsSettings => ({ configured: data.configured, enabled: data.enabled,
  accountSid: data.accountSid, fromNumber: data.fromNumber, tokenSet: data.tokenSet });
export const useSmsSettings = () => {
  const { user } = useAuth();
  return useQuery(['sms-settings', user?.id], async () => {
    if (user?.userRole !== 'root') throw new Error('Administrator access is required.');
    try { return publicSettings((await axiosSec.get('smsSettings')).data); }
    catch { throw new Error('SMS settings could not be loaded.'); }
  }, { enabled: user?.userRole === 'root', retry: false, cacheTime: 0 });
};
export const useUpdateSmsSettings = () => {
  const { user } = useAuth();
  const client = useQueryClient();
  return useMutation(async (payload: SmsSettingsUpdate) => {
    if (user?.userRole !== 'root') throw new Error('Administrator access is required.');
    try { return publicSettings((await axiosSec.put('smsSettings', payload)).data); }
    catch { throw new Error('SMS settings could not be saved.'); }
    finally { delete payload.token; }
  }, { onSuccess: (data) => client.setQueryData(['sms-settings', user?.id], data) });
};
export const useTestSmsSettings = () => {
  const { user } = useAuth();
  return useMutation(async (recipient: string) => {
    if (user?.userRole !== 'root') throw new Error('Administrator access is required.');
    try { if ((await axiosSec.post('smsSettings', { recipient })).data.accepted !== true) throw new Error(); }
    catch { throw new Error('Test SMS failed. Check your saved Twilio settings.'); }
  }, { retry: false });
};
