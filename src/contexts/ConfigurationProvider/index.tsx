import React, { useEffect, useMemo } from 'react';
import { useToast } from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import { useFormikContext } from 'formik';
import { collectInheritedResourceIds, inventoryResourceScope } from './inheritedResources';
import { useGetConfiguration } from 'hooks/Network/Configurations';
import { useGetResources } from 'hooks/Network/Resources';
import { Resource } from 'models/Resource';
import { axiosProv } from 'utils/axiosInstances';

const ConfigurationContext = React.createContext<{
  configurationId: string;
  availableResources?: Resource[];
}>({
  configurationId: '',
});

export const ConfigurationProvider = ({
  children,
  configurationId,
  entityId,
  ownerScope,
}: {
  children: React.ReactElement;
  configurationId?: string;
  entityId?: string;
  ownerScope?: { venue?: string; entity?: string };
}) => {
  const getConfig = useGetConfiguration({ id: configurationId, onSuccess: () => {} });
  const venueId = () => {
    const split = entityId?.split(':');
    if (split?.[0] && split?.[1] && split[0] === 'ven') {
      return split[1];
    }
    return getConfig.isPreviousData ? undefined : getConfig.data?.venue;
  };
  const finalEntityId = () => {
    const split = entityId?.split(':');
    if (split?.[0] && split?.[1] && split[0] === 'ent') {
      return split[1];
    }
    return getConfig.isPreviousData ? undefined : getConfig.data?.entity;
  };

  const toast = useToast();
  const scope = ownerScope ?? { venue: venueId(), entity: finalEntityId() };
  const inheritedResources = useQuery(
    ['configuration-resource-ancestry', scope.venue ?? '', scope.entity ?? ''],
    () => collectInheritedResourceIds(scope, async (kind, id) => {
      const { data } = await axiosProv.get(`${kind}/${encodeURIComponent(id)}?withExtendedInfo=true`);
      return data;
    }),
    { enabled: Boolean(scope.venue || scope.entity), staleTime: 0, retry: false, keepPreviousData: false },
  );
  useEffect(() => {
    if (inheritedResources.isError && !toast.isActive('resource-ancestry-error')) {
      toast({
        id: 'resource-ancestry-error',
        title: 'Unable to load inherited resources',
        description: 'Check access to the selected venue and its parent entities. No configuration has been changed.',
        status: 'error',
        isClosable: true,
      });
    }
  }, [inheritedResources.isError, toast]);
  const getResources = useGetResources({
    pageInfo: null,
    select: inheritedResources.data ?? [],
  });

  const value = useMemo(
    () => ({
      configurationId,
      availableResources: inheritedResources.isSuccess ? getResources.data : [],
    }),
    [configurationId, getResources.data, inheritedResources.isSuccess],
  );

  return <ConfigurationContext.Provider value={value}>{children}</ConfigurationContext.Provider>;
};

export const useConfigurationContext = () => React.useContext(ConfigurationContext);

// Inventory forms store the currently selected owner as ent:<id> or ven:<id>.
// An explicit empty scope must not fall back to an override's previous owner.
export const InventoryConfigurationProvider = ({ children }: { children: React.ReactElement }) => {
  const { values } = useFormikContext<{ entity?: string }>();
  const scope = inventoryResourceScope(values.entity);
  return <ConfigurationProvider ownerScope={scope}>{children}</ConfigurationProvider>;
};
