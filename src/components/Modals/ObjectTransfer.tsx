import React, { useState } from 'react';
import {
  Button,
  Checkbox,
  FormControl,
  FormLabel,
  HStack,
  IconButton,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Select,
  Text,
  Tooltip,
  useDisclosure,
  useToast,
} from '@chakra-ui/react';
import { Copy, ArrowRight } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  copyConfigurationToAp,
  copyPayload,
  Destination,
  movePayload,
  sameParent,
  TransferObject,
} from 'helpers/objectTransfer';
import { useGetEntities } from 'hooks/Network/Entity';
import { useGetVenues } from 'hooks/Network/Venues';
import { axiosProv } from 'utils/axiosInstances';

type Props = {
  kind: 'configuration' | 'resource';
  object: { id: string; name: string };
  refresh?: () => void;
  isDisabled?: boolean;
  isCompact?: boolean;
};

export default function ObjectTransfer({ kind, object, refresh, isDisabled = false, isCompact = false }: Props) {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const toast = useToast();
  const queryClient = useQueryClient();
  const entities = useGetEntities();
  const venues = useGetVenues();
  const [mode, setMode] = useState<'copy' | 'move'>('copy');
  const [target, setTarget] = useState('');
  const [name, setName] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const endpoint = kind === 'configuration' ? 'configuration' : 'variable';
  const source = useQuery(
    ['transfer-source', kind, object.id],
    () => axiosProv.get(`${endpoint}/${encodeURIComponent(object.id)}`).then(({ data }) => data as TransferObject),
    { enabled: isOpen, staleTime: 0 },
  );
  const aps = useQuery(
    ['transfer-aps'],
    async () => {
      const all: { serialNumber: string; name: string }[] = [];
      for (let offset = 0; ; offset += 500) {
        // eslint-disable-next-line no-await-in-loop
        const { data } = await axiosProv.get(`inventory?offset=${offset}&limit=500`);
        all.push(...data.taglist);
        if (data.taglist.length < 500) return all;
      }
    },
    { enabled: isOpen && kind === 'configuration' },
  );
  const [type = '', id = ''] = target.split(':');
  const destination = { type, id } as Destination;
  const ap = useQuery(
    ['transfer-ap', id],
    () => axiosProv.get(`inventory/${encodeURIComponent(id)}`).then(({ data }) => data),
    { enabled: isOpen && type === 'ap' && !!id, staleTime: 0 },
  );
  const open = (operation: 'copy' | 'move') => {
    setMode(operation);
    setName(`${object.name} (copy)`);
    setTarget('');
    setConfirmed(false);
    onOpen();
  };
  const submit = async () => {
    if (!source.data || !id || !['entity', 'venue', 'ap'].includes(type)) return;
    setBusy(true);
    try {
      let cleanupWarning = '';
      // Refetch the source, rather than copying potentially stale table/editor data.
      const { data: current } = await axiosProv.get(`${endpoint}/${encodeURIComponent(object.id)}`);
      if (mode === 'move') {
        if (!confirmed || sameParent(current, destination)) return;
        await axiosProv.put(`${endpoint}/${encodeURIComponent(object.id)}`, movePayload(current, destination));
      } else if (type === 'ap') {
        if (kind !== 'configuration' || !confirmed || !ap.data) return;
        cleanupWarning = await copyConfigurationToAp(axiosProv, current, name, id, ap.data.deviceConfiguration || '');
      } else {
        await axiosProv.post(`${endpoint}/0`, copyPayload(current, kind, name, destination));
      }
      await queryClient.invalidateQueries();
      refresh?.();
      onClose();
      toast({
        title: mode === 'copy' ? 'Copied' : 'Moved',
        description: cleanupWarning || undefined,
        status: cleanupWarning ? 'warning' : 'success',
        duration: cleanupWarning ? 7000 : 3000,
        isClosable: true,
      });
    } catch (error) {
      const e = error as { response?: { data?: { ErrorDescription?: string } }; message?: string };
      toast({
        title: 'Transfer failed',
        description: e.response?.data?.ErrorDescription ?? e.message,
        status: 'error',
        duration: 7000,
        isClosable: true,
      });
    } finally {
      setBusy(false);
    }
  };
  const blocked =
    busy ||
    !source.data ||
    source.isFetching ||
    source.isError ||
    !id ||
    (mode === 'copy' && !name.trim()) ||
    (mode === 'move' && (!confirmed || sameParent(source.data, destination))) ||
    (type === 'ap' && (!confirmed || !ap.data || ap.isFetching || ap.isError));
  return (
    <>
      {isCompact ? (
        <>
          <Tooltip label="Copy">
            <IconButton
              aria-label="Copy"
              size="sm"
              colorScheme="blue"
              ml={2}
              icon={<Copy size={20} />}
              onClick={() => open('copy')}
              isDisabled={isDisabled}
            />
          </Tooltip>
          <Tooltip label="Move">
            <IconButton
              aria-label="Move"
              size="sm"
              colorScheme="blue"
              ml={2}
              icon={<ArrowRight size={20} />}
              onClick={() => open('move')}
              isDisabled={isDisabled}
            />
          </Tooltip>
        </>
      ) : (
        <>
          <Button
            size="sm"
            colorScheme="blue"
            variant="outline"
            ml={2}
            leftIcon={<Copy size={16} />}
            onClick={() => open('copy')}
            isDisabled={isDisabled}
          >
            Copy
          </Button>
          <Button
            size="sm"
            colorScheme="blue"
            variant="outline"
            ml={2}
            leftIcon={<ArrowRight size={16} />}
            onClick={() => open('move')}
            isDisabled={isDisabled}
          >
            Move
          </Button>
        </>
      )}
      <Modal
        isOpen={isOpen}
        onClose={() => {
          if (!busy) onClose();
        }}
        size="lg"
        closeOnOverlayClick={!busy}
        closeOnEsc={!busy}
      >
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            {mode === 'copy' ? 'Copy' : 'Move'} {object.name}
          </ModalHeader>
          <ModalBody>
            {mode === 'copy' && (
              <FormControl mb={4} isRequired>
                <FormLabel>Name</FormLabel>
                <Input value={name} onChange={(e) => setName(e.target.value)} isDisabled={busy} />
              </FormControl>
            )}
            <FormControl isRequired>
              <FormLabel>Destination</FormLabel>
              <Select
                placeholder="Select destination"
                value={target}
                isDisabled={busy}
                onChange={(e) => {
                  setTarget(e.target.value);
                  setConfirmed(false);
                }}
              >
                <optgroup label="Entities">
                  {entities.data?.map((item) => (
                    <option key={item.id} value={`entity:${item.id}`}>
                      {item.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Venues">
                  {venues.data?.map((item) => (
                    <option key={item.id} value={`venue:${item.id}`}>
                      {item.name}
                    </option>
                  ))}
                </optgroup>
                {kind === 'configuration' && mode === 'copy' && (
                  <optgroup label="APs">
                    {aps.data?.map((item) => (
                      <option key={item.serialNumber} value={`ap:${item.serialNumber}`}>
                        {item.name || item.serialNumber} ({item.serialNumber})
                      </option>
                    ))}
                  </optgroup>
                )}
              </Select>
            </FormControl>
            <Text fontSize="sm" mt={3}>
              {mode === 'copy'
                ? 'Independent copy; weights are retained. Referenced resources remain shared.'
                : 'Keeps the same ID and existing references. Changes which devices inherit it.'}
            </Text>
            {kind === 'resource' && (
              <Text fontSize="sm" mt={2}>
                Resources belong to an entity or venue; select them in the AP configuration.
              </Text>
            )}
            {type === 'ap' && (
              <Text fontSize="sm" mt={2}>
                Replaces the AP-specific configuration. Unused AP-only configs are removed; shared configs remain. No
                configuration is pushed to the AP.
              </Text>
            )}
            {(mode === 'move' || type === 'ap') && (
              <Checkbox mt={3} isChecked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} isDisabled={busy}>
                {type === 'ap'
                  ? 'Confirm replacing the AP-specific configuration'
                  : 'Confirm move and inheritance change'}
              </Checkbox>
            )}
            {source.isError && (
              <Text color="red.500" mt={2}>
                Could not load the source. Close and retry.
              </Text>
            )}
          </ModalBody>
          <ModalFooter>
            <HStack>
              <Button onClick={onClose} isDisabled={busy}>
                Cancel
              </Button>
              <Button colorScheme="blue" onClick={submit} isLoading={busy} isDisabled={blocked}>
                {mode === 'copy' ? 'Copy' : 'Move'}
              </Button>
            </HStack>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
