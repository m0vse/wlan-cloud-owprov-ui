import * as React from 'react';
import { useGetEntity } from 'hooks/Network/Entity';
import { useGetSelectInventoryPaginated, useScopedSiteInventory } from 'hooks/Network/Inventory';
import { useAuth } from 'contexts/AuthProvider';
import { PageInfo } from 'models/Table';

type Props = {
  entityId: string;
};

export const useEntityInventory = ({ entityId }: Props) => {
  const { user } = useAuth();
  const root = user?.userRole === 'root';
  const [pageInfo, setPageInfo] = React.useState<PageInfo>();
  const getEntity = useGetEntity({ id: entityId });
  const selectedTags = useGetSelectInventoryPaginated({ pageInfo, serialNumbers: getEntity.data?.devices ?? [], enabled: root });
  const scopedTags = useScopedSiteInventory({ scopeType: 'entity', scopeId: entityId, pageInfo, enabled: !root && !!getEntity.data });
  const getTags = root ? selectedTags : scopedTags;

  return {
    getEntity,
    getTags,
    count: root ? getEntity.data?.devices.length ?? 0 : scopedTags.count,
    serialNumbers: root ? getEntity.data?.devices ?? [] : scopedTags.data?.map((tag: { serialNumber: string }) => tag.serialNumber) ?? [],
    pageInfo,
    setPageInfo,
  };
};
