import { useToast } from '@chakra-ui/react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import useDefaultPage from 'hooks/useDefaultPage';
import { AxiosError } from 'models/Axios';
import { axiosProv } from 'utils/axiosInstances';
import { useAuth } from 'contexts/AuthProvider';
import { hasAccessCapability } from 'helpers/userAccessPolicy';

export const useGetConfigurations = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const toast = useToast();

  return useQuery(
    ['get-configurations'],
    () =>
      axiosProv.get(`configuration?${user?.userRole === 'root' ? 'withExtendedInfo=true&' : ''}offset=0&limit=500`).then(({ data }) => data.configurations),
    {
      staleTime: 200 * 1000,
      onError: (e: AxiosError) => {
        if (!toast.isActive('configurations-fetching-error'))
          toast({
            id: 'configurations-fetching-error',
            title: t('common.error'),
            description: t('crud.error_fetching_obj', {
              obj: t('configurations.title'),
              e: e?.response?.data?.ErrorDescription,
            }),
            status: 'error',
            duration: 5000,
            isClosable: true,
            position: 'top-right',
          });
      },
    },
  );
};

export const useGetSelectConfigurations = ({ select }: { select: string[] }) => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const toast = useToast();

  return useQuery(
    ['get-configurations', select],
    () =>
      select.length === 0
        ? []
        : axiosProv.get(`configuration?${user?.userRole === 'root' ? 'withExtendedInfo=true&' : ''}select=${select}`).then(({ data }) => data.configurations),
    {
      staleTime: 100 * 1000,
      onError: (e: AxiosError) => {
        if (!toast.isActive('configurations-fetching-error'))
          toast({
            id: 'configurations-fetching-error',
            title: t('common.error'),
            description: t('crud.error_fetching_obj', {
              obj: t('configurations.title'),
              e: e?.response?.data?.ErrorDescription,
            }),
            status: 'error',
            duration: 5000,
            isClosable: true,
            position: 'top-right',
          });
      },
    },
  );
};

export const useGetAvailableConfigurations = ({ tagId }: { tagId: string }) => {
  const { t } = useTranslation();
  const toast = useToast();

  return useQuery(
    ['get-available-configurations', tagId],
    () => axiosProv.get(`configuration?tagId=${tagId}`).then(({ data }) => data.configurations),
    {
      onError: (e: AxiosError) => {
        if (!toast.isActive('configurations-fetching-error'))
          toast({
            id: 'configurations-fetching-error',
            title: t('common.error'),
            description: t('crud.error_fetching_obj', {
              obj: t('configurations.title'),
              e: e?.response?.data?.ErrorDescription,
            }),
            status: 'error',
            duration: 5000,
            isClosable: true,
            position: 'top-right',
          });
      },
    },
  );
};

export const useGetConfiguration = ({ id, onSuccess = () => {} }: { id?: string | null; onSuccess?: () => void }) => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const toast = useToast();
  const goToDefaultPage = useDefaultPage();

  return useQuery(
    ['get-configuration', id],
    () => axiosProv.get(`configuration/${id}${user?.userRole === 'root' ? '?withExtendedInfo=true' : ''}`).then(({ data }) => data),
    {
      enabled: id !== undefined && id !== null && id !== '',
      keepPreviousData: true,
      staleTime: 10 * 1000,
      onSuccess,
      onError: (e: AxiosError) => {
        if (!toast.isActive('configuration-fetching-error'))
          toast({
            id: 'configuration-fetching-error',
            title: t('common.error'),
            description: t('crud.error_fetching_obj', {
              obj: t('configurations.one'),
              e: e?.response?.data?.ErrorDescription,
            }),
            status: 'error',
            duration: 5000,
            isClosable: true,
            position: 'top-right',
          });
        if (e.code === '404') goToDefaultPage();
      },
    },
  );
};

export const useGetConfigurationInUse = ({ id, enabled }: { id: string; enabled: boolean }) => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const toast = useToast();

  return useQuery(
    ['get-config-in-use', id],
    () => axiosProv.get(`/configuration/${id}?expandInUse=true`).then(({ data }) => data.entries),
    {
      enabled: enabled && user?.userRole === 'root',
      onError: (e: AxiosError) => {
        toast({
          id: 'config-in-use-fetching-error',
          title: t('common.error'),
          description: t('crud.error_fetching_obj', {
            e: e?.response?.data?.ErrorDescription,
            obj: t('configurations.one'),
          }),
          status: 'error',
          duration: 5000,
          isClosable: true,
          position: 'top-right',
        });
      },
    },
  );
};

export const useGetConfigurationAffected = ({ id, enabled }: { id: string; enabled: boolean }) => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const toast = useToast();

  return useQuery(
    ['get-config-affected', id],
    () => axiosProv.get(`/configuration/${id}?computedAffected=true`).then(({ data }) => data.affectedDevices),
    {
      enabled: enabled && user?.userRole === 'root',
      onError: (e: AxiosError) => {
        toast({
          id: 'config-in-use-fetching-error',
          title: t('common.error'),
          description: t('crud.error_fetching_obj', {
            e: e?.response?.data?.ErrorDescription,
            obj: t('configurations.one'),
          }),
          status: 'error',
          duration: 5000,
          isClosable: true,
          position: 'top-right',
        });
      },
    },
  );
};

export const useDeleteConfiguration = () => useMutation((id: string) => axiosProv.delete(`configuration/${id}`));

export const useUpdateConfiguration = ({ id }: { id: string }) => {
  const { user } = useAuth();
  return useMutation((newConf: Record<string, unknown>) => {
    if (!hasAccessCapability(user, 'configuration.write')) return Promise.reject(new Error('Configuration editing is not assigned.'));
    const payload = user?.userRole === 'root' ? newConf : Object.fromEntries(Object.entries(newConf)
      .filter(([key]) => ['name', 'description', 'configuration', 'notes', 'deviceTypes'].includes(key)));
    return axiosProv.put(`configuration/${id}`, payload);
  });
};

export const useConfigurationEditAccess = (id: string) => {
  const { user } = useAuth();
  const root = user?.userRole === 'root';
  const candidate = hasAccessCapability(user, 'configuration.write');
  const check = useQuery(['configuration-edit-access', user?.id, id, user?.securityPolicyChange],
    () => axiosProv.post('access/check', { userId: user?.id, objectType: 'configuration', objectId: id,
      capability: 'configuration.write' }).then(({ data }) => data.allowed === true),
    { enabled: !root && candidate && !!id, retry: false, staleTime: 10000 });
  return root || (candidate && check.data === true);
};
