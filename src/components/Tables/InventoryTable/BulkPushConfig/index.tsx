import * as React from 'react';
import { Alert, AlertIcon, Badge, Button, Flex, IconButton, Modal, ModalBody, ModalContent, ModalFooter, ModalOverlay, Progress, Table, TableContainer, Tbody, Td, Text, Th, Thead, Tooltip, Tr, useDisclosure } from '@chakra-ui/react';
import { PaperPlaneTilt } from '@phosphor-icons/react';
import ModalHeader from 'components/Modals/ModalHeader';
import CloseButton from 'components/Buttons/CloseButton';
import { axiosProv } from 'utils/axiosInstances';
import { collectTargets, pushTargets } from './helpers';

type Result = { serial: string; status: string; detail: string };
const BulkPushConfig = ({ kind, id }: { kind: 'entity' | 'venue'; id: string }) => {
  const modal = useDisclosure();
  const [targets, setTargets] = React.useState<string[]>([]);
  const [results, setResults] = React.useState<Result[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [started, setStarted] = React.useState(false);
  const [error, setError] = React.useState('');
  const prepare = async () => {
    modal.onOpen();
    setTargets([]); setResults([]); setStarted(false); setError(''); setLoading(true);
    let resolved: string[] = [];
    try {
      // Uses the operator's existing session; server permissions apply to every read/push.
      resolved = await collectTargets(kind, id, async (type: string, uuid: string) =>
        (await axiosProv.get(`${type}/${encodeURIComponent(uuid)}`)).data);
      setTargets(resolved);
    } catch {
      setError('Unable to load the complete scope. Nothing was pushed.');
      return;
    } finally { setLoading(false); }
    setRunning(true); setStarted(true);
    try {
      await pushTargets(resolved, async (serial: string) =>
        (await axiosProv.get(`inventory/${encodeURIComponent(serial)}?applyConfiguration=true`)).data, setResults);
    } finally { setRunning(false); }
  };
  return <>
    <Tooltip hasArrow placement="top" label={`Push config to all devices in this ${kind} and its descendants`}>
      <IconButton size="sm" colorScheme="teal" borderRadius="md" icon={<PaperPlaneTilt size={20} />} aria-label="Push config" onClick={prepare} isDisabled={!id || loading || running} mr={2} />
    </Tooltip>
    <Modal isOpen={modal.isOpen} onClose={modal.onClose} size="xl" closeOnOverlayClick={!running && !loading} closeOnEsc={!running && !loading}>
      <ModalOverlay /><ModalContent>
        <ModalHeader title="Push config" right={<CloseButton onClick={modal.onClose} isDisabled={running || loading} />} />
        <ModalBody>
          {error && <Alert status="error"><AlertIcon />{error}</Alert>}
          {loading ? <Text>Loading devices…</Text> : !error && <>
            <Text mb={3}>{results.length} of {targets.length} processed</Text>
            {started && <Progress value={targets.length ? results.length / targets.length * 100 : 0} mb={3} />}
            <TableContainer maxH="360px" overflowY="auto"><Table size="sm"><Thead><Tr><Th>AP serial</Th><Th>Status</Th></Tr></Thead><Tbody>
              {targets.map((serial) => {
                const result = results.find((item) => item.serial === serial);
                return <Tr key={serial}><Td fontFamily="mono">{serial}</Td><Td><Badge colorScheme={result?.status === 'Sent' ? 'green' : result?.status === 'Failed' ? 'red' : 'gray'}>{result?.status ?? 'Pending'}</Badge>{result?.detail && <Text fontSize="xs" mt={1}>{result.detail}</Text>}</Td></Tr>;
              })}
            </Tbody></Table></TableContainer>
            {started && !running && <Text fontSize="sm" mt={3}>Sent means accepted by the controller; check AP status for successful application.</Text>}
          </>}
        </ModalBody>
        <ModalFooter><Flex gap={2}>
          <Button onClick={modal.onClose} isDisabled={running || loading}>Close</Button>
        </Flex></ModalFooter>
      </ModalContent>
    </Modal>
  </>;
};
export default BulkPushConfig;
