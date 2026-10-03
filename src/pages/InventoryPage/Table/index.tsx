import React, { useCallback, useState } from 'react';
import { Alert, AlertIcon, Box, FormControl, FormLabel, Select, Switch, useBoolean, useDisclosure } from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import { CellContext } from '@tanstack/react-table';
import { useTranslation } from 'react-i18next';
import { v4 as uuid } from 'uuid';
import Actions from './Actions';
import { DataGrid } from 'components/DataGrid';
import { DataGridColumn, useDataGrid } from 'components/DataGrid/useDataGrid';
import ExportDevicesTableButton from 'components/ExportInventoryButton';
import FormattedDate from 'components/FormattedDate';
import FactoryResetModal from 'components/Modals/SubscriberDevice/FactoryResetModal';
import FirmwareUpgradeModal from 'components/Modals/SubscriberDevice/FirmwareUpgradeModal';
import WifiScanModal from 'components/Modals/SubscriberDevice/WifiScanModal';
import DeviceSearchBar from 'components/SearchBars/DeviceSearch';
import EntityCell from 'components/TableCells/EntityCell';
import VenueCell from 'components/TableCells/VenueCell';
import ConfigurationPushModal from 'components/Tables/InventoryTable/ConfigurationPushModal';
import BulkPushConfig from 'components/Tables/InventoryTable/BulkPushConfig';
import { collectTargets, collectInventoryIds } from 'components/Tables/InventoryTable/BulkPushConfig/helpers';
import { useGetEntityTree, TreeEntity, TreeVenue } from 'hooks/Network/Entity';
import { axiosProv } from 'utils/axiosInstances';
import CreateConfigurationModal from 'components/Tables/InventoryTable/CreateTagModal';
import EditTagModal from 'components/Tables/InventoryTable/EditTagModal';
import {
  useGetInventoryCount,
  useGetInventoryTableSpecs,
  useGetInventoryTags,
  usePushConfig,
} from 'hooks/Network/Inventory';
import { Device } from 'models/Device';
import { InventoryTagApiResponse } from 'models/Inventory';

const InventoryTable = () => {
  const { t } = useTranslation();
  const tableController = useDataGrid({
    tableSettingsId: 'provisioning.inventory.table',
    defaultSortBy: [{ id: 'serialNumber', desc: false }],
    defaultOrder: ['serialNumber', 'name', 'entity', 'venue', 'subscriber', 'description', 'modified', 'actions'],
  });
  const [onlyUnassigned, setOnlyUnassigned] = useBoolean(false);
  const [entityFilter, setEntityFilter] = useState('');
  const [venueFilter, setVenueFilter] = useState('');
  const { data: entityTree } = useGetEntityTree();
  const entities: { id: string; name: string }[] = [];
  const venues: { id: string; name: string }[] = [];
  const walkVenues = (node: TreeVenue) => {
    venues.push({ id: node.uuid, name: node.name });
    node.children?.forEach(walkVenues);
  };
  const walkEntities = (node: TreeEntity, inScope = false) => {
    entities.push({ id: node.uuid, name: node.name });
    const included = !entityFilter || inScope || node.uuid === entityFilter;
    if (included) node.venues?.forEach(walkVenues);
    node.children?.forEach((child) => walkEntities(child, included));
  };
  if (entityTree) walkEntities(entityTree);
  const scoped = !!(entityFilter || venueFilter);
  const loadScopeIds = async (): Promise<string[]> => {
    if (scoped) return collectTargets(venueFilter ? 'venue' : 'entity', venueFilter || entityFilter,
      async (kind: string, id: string) => (await axiosProv.get(`${kind}/${encodeURIComponent(id)}`)).data);
    const suffix = onlyUnassigned ? '&unassigned=true' : '';
    return collectInventoryIds(
      async () => (await axiosProv.get(`inventory?countOnly=true${suffix}`)).data.count,
      async (offset: number, limit: number) => (await axiosProv.get(`inventory?limit=${limit}&offset=${offset}&orderBy=serialNumber:a${suffix}`)).data.taglist,
    );
  };
  const scopedTags = useQuery(['inventory-scope', entityFilter, venueFilter], async () => {
    const ids = await loadScopeIds();
    const rows: InventoryTagApiResponse[] = [];
    for (let offset = 0; offset < ids.length; offset += 100) {
      const batch = ids.slice(offset, offset + 100);
      // eslint-disable-next-line no-await-in-loop
      const response = await axiosProv.get(`inventory?withExtendedInfo=true&select=${batch.map(encodeURIComponent).join(',')}&limit=100&offset=0`);
      const page = response.data.taglist as InventoryTagApiResponse[];
      if (!Array.isArray(page) || batch.some((id) => page.filter((row) => row.id === id).length !== 1))
        throw new Error('Incomplete inventory scope');
      rows.push(...page.filter((row) => batch.includes(row.id)));
    }
    return rows;
  }, { enabled: scoped });
  const [serialNumber, setSerialNumber] = useState<string>('');
  const [tag, setTag] = useState<Device | { serialNumber: string } | undefined>(undefined);
  const { isOpen: isEditOpen, onOpen: openEdit, onClose: closeEdit } = useDisclosure();
  const { isOpen: isPushOpen, onOpen: openPush, onClose: closePush } = useDisclosure();
  const { data: tableSpecs } = useGetInventoryTableSpecs();
  const scanModalProps = useDisclosure();
  const resetModalProps = useDisclosure();
  const upgradeModalProps = useDisclosure();
  const pushConfiguration = usePushConfig({ onSuccess: () => openPush() });
  const {
    data: unfilteredCount,
    isFetching: isFetchingCount,
    refetch: refetchCount,
  } = useGetInventoryCount({
    enabled: !scoped,
    onlyUnassigned,
  });
  const count = scoped ? scopedTags.data?.length : unfilteredCount;
  const {
    data: tags,
    isFetching: isFetchingTags,
    refetch: refetchTags,
  } = useGetInventoryTags({
    pageInfo: {
      limit: tableController.pageInfo.pageSize,
      index: tableController.pageInfo.pageIndex,
    },
    sortInfo: tableController.sortBy.map((sort) => ({
      id: sort.id,
      sort: sort.desc ? 'dsc' : 'asc',
    })),
    enabled: !scoped,
    count,
    onlyUnassigned,
  });
  const onOpenScan = (serial: string) => {
    setSerialNumber(serial);
    scanModalProps.onOpen();
  };
  const onOpenFactoryReset = (serial: string) => {
    setSerialNumber(serial);
    resetModalProps.onOpen();
  };
  const onOpenUpgradeModal = (serial: string) => {
    setSerialNumber(serial);
    upgradeModalProps.onOpen();
  };

  const openEditModal = (newTag: Device | { serialNumber: string }) => {
    setTag(newTag);
    openEdit();
  };
  const refreshInventory = scoped ? scopedTags.refetch : refetchCount;
  const refreshInventoryTags = scoped ? scopedTags.refetch : refetchTags;

  const memoizedActions = useCallback(
    (cell: CellContext<InventoryTagApiResponse, unknown>) => (
      <Actions
        cell={cell.row as unknown as { original: Device }}
        refreshTable={refreshInventory}
        key={uuid()}
        openEditModal={openEditModal}
        onOpenScan={onOpenScan}
        onOpenFactoryReset={onOpenFactoryReset}
        onOpenUpgradeModal={onOpenUpgradeModal}
      />
    ),
    [refreshInventory],
  );
  const memoizedDate = useCallback(
    (cell: CellContext<InventoryTagApiResponse, unknown>, key: 'modified') => (
      <FormattedDate date={cell.row.original[key]} key={uuid()} />
    ),
    [],
  );

  const entityCell = useCallback(
    (cell: CellContext<InventoryTagApiResponse, unknown>) => (
      <EntityCell entityName={cell.row.original.extendedInfo?.entity?.name ?? ''} entityId={cell.row.original.entity} />
    ),
    [],
  );
  const venueCell = useCallback(
    (cell: CellContext<InventoryTagApiResponse, unknown>) => (
      <VenueCell venueName={cell.row.original.extendedInfo?.venue?.name ?? ''} venueId={cell.row.original.venue} />
    ),
    [],
  );

  const onSearchClick = useCallback((serial: string) => {
    openEditModal({ serialNumber: serial });
  }, []);

  const columns: DataGridColumn<InventoryTagApiResponse>[] = React.useMemo(() => {
    const baseColumns: DataGridColumn<InventoryTagApiResponse>[] = [
      {
        id: 'serialNumber',
        header: t('inventory.serial_number'),
        accessorKey: 'serialNumber',
        meta: {
          customMaxWidth: '200px',
          customWidth: 'calc(15vh)',
          customMinWidth: '150px',
          alwaysShow: true,
          isMonospace: true,
        },
      },
      {
        id: 'name',
        header: t('common.name'),
        accessorKey: 'name',
        meta: {
          customMaxWidth: '200px',
          customWidth: 'calc(15vh)',
          customMinWidth: '150px',
          isMonospace: true,
        },
      },
      {
        id: 'entity',
        header: t('entities.one'),
        accessorKey: 'extendedInfo.entity.name',
        cell: entityCell,
        enableSorting: false,
        meta: {
          customMaxWidth: '200px',
          customWidth: 'calc(15vh)',
          customMinWidth: '150px',
          stopPropagation: true,
        },
      },
      {
        id: 'venue',
        header: t('venues.one'),
        accessorKey: 'extendedInfo.venue.name',
        cell: venueCell,
        enableSorting: false,
        meta: {
          customMaxWidth: '200px',
          customWidth: 'calc(15vh)',
          customMinWidth: '150px',
          stopPropagation: true,
        },
      },
      {
        id: 'subscriber',
        header: t('subscribers.one'),
        accessorKey: 'extendedInfo.subscriber.name',
        enableSorting: true,
        meta: {
          customMaxWidth: '200px',
          customWidth: 'calc(15vh)',
          customMinWidth: '150px',
        },
      },
      {
        id: 'description',
        header: t('common.description'),
        accessorKey: 'description',
        enableSorting: false,
      },
      {
        id: 'modified',
        header: t('common.modified'),

        accessorKey: 'modified',
        cell: (cell) => memoizedDate(cell, 'modified'),
        meta: {
          customMinWidth: '150px',
          customWidth: '150px',
        },
      },
      {
        id: 'actions',
        header: t('common.actions'),
        accessorKey: 'Id',
        cell: memoizedActions,
        enableSorting: false,
        meta: {
          customWidth: '80px',
          alwaysShow: true,
        },
      },
    ];

    return baseColumns.map((col) => {
      const lower = col.id.toLocaleLowerCase();
      const isAlreadyDisabled = col.enableSorting === false;
      return {
        ...col,
        enableSorting: tableSpecs ? !!tableSpecs.find((spec: string) => spec === lower) : !isAlreadyDisabled,
      };
    });
  }, [t, tableSpecs]);

  const onUnassignedToggle = () => {
    setOnlyUnassigned.toggle();
    setEntityFilter(''); setVenueFilter('');
    tableController.onPaginationChange({ ...tableController.pageInfo, pageIndex: 0 });
  };

  const scopedRows = scopedTags.data ? [...scopedTags.data].sort((a, b) => {
    for (const sort of tableController.sortBy) {
      const compared = String(a[sort.id as keyof InventoryTagApiResponse] ?? '').localeCompare(String(b[sort.id as keyof InventoryTagApiResponse] ?? ''), undefined, { numeric: true });
      if (compared) return sort.desc ? -compared : compared;
    }
    return 0;
  }).slice(tableController.pageInfo.pageIndex * tableController.pageInfo.pageSize,
    (tableController.pageInfo.pageIndex + 1) * tableController.pageInfo.pageSize) : [];

  return (
    <Box>
      {scoped && scopedTags.isError && <Alert status="error" mb={3}><AlertIcon />Unable to load this inventory scope. Config push is disabled.</Alert>}
      <DataGrid<InventoryTagApiResponse>
        controller={tableController}
        header={{
          title: `${t('devices.title')} ${count ? `(${count})` : ''}`,
          objectListed: t('devices.title'),
          otherButtons: (
            <>
              <Select aria-label="Filter by entity" placeholder="All entities" value={entityFilter} w="190px" mr={2}
                onChange={(event) => { setEntityFilter(event.target.value); setVenueFilter(''); setOnlyUnassigned.off(); tableController.onPaginationChange({ ...tableController.pageInfo, pageIndex: 0 }); }}>
                {entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}
              </Select>
              <Select aria-label="Filter by venue" placeholder="All venues" value={venueFilter} w="190px" mr={2}
                onChange={(event) => { setVenueFilter(event.target.value); setOnlyUnassigned.off(); tableController.onPaginationChange({ ...tableController.pageInfo, pageIndex: 0 }); }}>
                {venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
              </Select>
              <FormControl display="flex" w="unset" alignItems="center" mr={2}>
                <FormLabel htmlFor="unassigned-switch" mb="0">
                  {t('devices.unassigned_only')}
                </FormLabel>
                <Switch
                  id="unassigned-switch"
                  isChecked={onlyUnassigned}
                  onChange={onUnassignedToggle}
                  size="lg"
                />
              </FormControl>
              <BulkPushConfig loadIds={loadScopeIds} scopeLabel="Push config to all devices matching this inventory scope (all pages)" disabled={scoped && (scopedTags.isLoading || scopedTags.isError)} />
              <ExportDevicesTableButton />
            </>
          ),
          addButton: <CreateConfigurationModal refresh={refreshInventory} />,
          leftContent: <DeviceSearchBar onClick={onSearchClick} />,
        }}
        columns={onlyUnassigned ? columns.filter((col) => col.id !== 'entity' && col.id !== 'venue') : columns}
        data={scoped ? scopedRows : tags}
        isLoading={scoped ? scopedTags.isFetching : isFetchingCount || isFetchingTags}
        options={{
          count,
          isManual: true,
          onRowClick: (device) => () => openEditModal(device),
          refetch: refreshInventory,
          minimumHeight: '200px',
          showAsCard: true,
        }}
      />
      <EditTagModal
        isOpen={isEditOpen}
        onClose={closeEdit}
        tag={tag}
        refresh={refreshInventoryTags}
        pushConfig={pushConfiguration}
        onOpenScan={onOpenScan}
        onOpenFactoryReset={onOpenFactoryReset}
        onOpenUpgradeModal={onOpenUpgradeModal}
      />
      <ConfigurationPushModal isOpen={isPushOpen} onClose={closePush} pushResult={pushConfiguration.data} />
      <WifiScanModal modalProps={scanModalProps} serialNumber={serialNumber} />
      <FirmwareUpgradeModal modalProps={upgradeModalProps} serialNumber={serialNumber} />
      <FactoryResetModal modalProps={resetModalProps} serialNumber={serialNumber} />
    </Box>
  );
};

export default InventoryTable;
