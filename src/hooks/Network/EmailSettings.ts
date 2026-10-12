import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from 'contexts/AuthProvider';
import { axiosSec } from 'utils/axiosInstances';

export type EmailSettings = {
  configured: boolean; enabled: boolean; host: string; port: number | null;
  tlsMode: '' | 'none' | 'starttls' | 'implicit'; sender: string; username: string;
  authMethod: '' | 'none' | 'login' | 'plain' | 'cram-md5'; passwordSet: boolean;
};
export type EmailSettingsUpdate = Omit<EmailSettings, 'configured' | 'passwordSet'> & {
  passwordAction: 'retain' | 'set' | 'clear'; password?: string;
};

// Copy only public fields: credentials are never echoed into query state.
const publicSettings = (data: EmailSettings): EmailSettings => ({
  configured: data.configured, enabled: data.enabled, host: data.host, port: data.port,
  tlsMode: data.tlsMode, sender: data.sender, username: data.username,
  authMethod: data.authMethod, passwordSet: data.passwordSet,
});

export const useEmailSettings = () => {
  const { user } = useAuth();
  return useQuery(['email-settings', user?.id], async () => {
    if (user?.userRole !== 'root') throw new Error('Administrator access is required.');
    try { return publicSettings((await axiosSec.get('emailSettings')).data); }
    catch { throw new Error('Email settings could not be loaded.'); }
  }, { enabled: user?.userRole === 'root', retry: false, staleTime: 30000 });
};

export const useUpdateEmailSettings = () => {
  const { user } = useAuth();
  const client = useQueryClient();
  return useMutation(async (payload: EmailSettingsUpdate) => {
    if (user?.userRole !== 'root') throw new Error('Administrator access is required.');
    try { return publicSettings((await axiosSec.put('emailSettings', payload)).data); }
    catch { throw new Error('Email settings could not be saved. Check the entries and try again.'); }
  }, { onSuccess: (data) => client.setQueryData(['email-settings', user?.id], data) });
};

export const useTestEmailSettings = () => {
  const { user } = useAuth();
  return useMutation(async (recipient: string) => {
    if (user?.userRole !== 'root') throw new Error('Administrator access is required.');
    try {
      const response = await axiosSec.post('emailSettings', { recipient });
      if (response.data.accepted !== true) throw new Error('Not accepted');
    } catch { throw new Error('Test email failed. Check your saved SMTP settings.'); }
  }, { retry: false });
};
