import * as React from 'react';
import { useGetSelectInventoryPaginated, useScopedSiteInventory } from 'hooks/Network/Inventory';
import { useAuth } from 'contexts/AuthProvider';
import { useGetVenue } from 'hooks/Network/Venues';
import { PageInfo } from 'models/Table';

type Props = {
  venueId: string;
};

export const useVenueInventory = ({ venueId }: Props) => {
  const { user } = useAuth();
  const root = user?.userRole === 'root';
  const [pageInfo, setPageInfo] = React.useState<PageInfo>();
  const getVenue = useGetVenue({ id: venueId });
  const selectedTags = useGetSelectInventoryPaginated({ pageInfo, serialNumbers: getVenue.data?.devices ?? [], enabled: root });
  const scopedTags = useScopedSiteInventory({ scopeType: 'venue', scopeId: venueId, pageInfo, enabled: !root && !!getVenue.data });
  const getTags = root ? selectedTags : scopedTags;

  return {
    getVenue,
    getTags,
    count: root ? getVenue.data?.devices.length ?? 0 : scopedTags.count,
    serialNumbers: root ? getVenue.data?.devices ?? [] : scopedTags.data?.map((tag: { serialNumber: string }) => tag.serialNumber) ?? [],
    pageInfo,
    setPageInfo,
  };
};
