import React, { useState } from 'react';
import {
  Accordion, AccordionButton, AccordionIcon, AccordionItem, AccordionPanel,
  Alert, AlertIcon, Badge, Box, Button, Heading, HStack, Select,
  Table, Tbody, Td, Text, Th, Thead, Tr, VStack,
} from '@chakra-ui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { axiosProv } from 'utils/axiosInstances';
import { axiosPki } from 'utils/pkiClient';
import { useAuth } from 'contexts/AuthProvider';

type Job = { id: string; serial: string; state: string; message: string };
type Certificate = {
  fingerprint: string; device: string; expires: number; revoked: number;
  observed?: boolean; managementAcceptedAt?: number;
};
type Status = {
  certificates: Certificate[];
  roots: { fingerprint: string; name: string; expires: number; state?: string }[];
  gatewayEnforcement: string; onboarding: Job[];
};
type Inventory = { serialNumber: string; name?: string; deviceType?: string };
type Audit = { stamp: number; actor: string; action: string; target: string };

const CertificatesPage = () => {
  const queries = useQueryClient();
  const [serial, setSerial] = useState('');
  const status = useQuery(['pki-status'], () => axiosPki.get<Status>('pki/status').then(({ data }) => data), {
    retry: false, refetchInterval: (data) => data?.onboarding?.some((job) => ['waiting', 'running'].includes(job.state)) ? 10000 : false,
  });
  const inventory = useQuery(['pki-onboarding-inventory'], () =>
    axiosProv.get<{ taglist: Inventory[] }>('inventory?offset=0&limit=1000').then(({ data }) => data.taglist), {
    retry: false,
  });
  const audit = useQuery(['pki-audit'], () => axiosPki.get<{ events: Audit[] }>('pki/audit').then(({ data }) => data.events), {
    retry: false,
  });
  const refresh = () => { status.refetch(); audit.refetch(); };
  const onboard = useMutation(() => axiosPki.post<Job>('pki/onboard', { serial }).then(({ data }) => data), {
    onSuccess: () => { queries.invalidateQueries(['pki-status']); queries.invalidateQueries(['pki-audit']); },
  });
  const cancel = useMutation((job: string) => axiosPki.post<Job>('pki/cancel-onboarding', { job }).then(({ data }) => data), {
    onSuccess: () => { queries.invalidateQueries(['pki-status']); queries.invalidateQueries(['pki-audit']); },
  });
  const date = (stamp: number) => new Date(stamp * 1000).toLocaleString();
  const jobs = status.data?.onboarding || [];
  const active = jobs.some((job) => job.serial === serial && ['waiting', 'running'].includes(job.state));

  return (
    <VStack align="stretch" spacing={5}>
      <HStack justify="space-between"><Heading size="lg">AP onboarding</Heading>
        <Button onClick={refresh} isLoading={status.isFetching}>Refresh</Button></HStack>
      <Text>Select an AP and click Onboard. Certificates and verification are handled automatically. Your approval stays valid until onboarding completes or you cancel it.</Text>
      {status.isError && <Alert status="warning"><AlertIcon />Onboarding service is unavailable. Existing APs continue using their current certificates.</Alert>}
      {status.data && status.data.gatewayEnforcement !== 'enforced' && <Alert status="info"><AlertIcon />Controller integration is still in progress. Onboarding requests will wait until it is ready.</Alert>}
      {inventory.isError && <Alert status="error"><AlertIcon />The AP inventory could not be loaded.</Alert>}
      <HStack align="start" flexWrap="wrap">
        <Select aria-label="AP to onboard" placeholder={inventory.isLoading ? 'Loading APs…' : 'Select an AP'}
          maxW="500px" value={serial} onChange={(event) => { setSerial(event.target.value); onboard.reset(); }}>
          {inventory.data?.map((ap) => <option key={ap.serialNumber} value={ap.serialNumber}>
            {ap.name || ap.deviceType || 'AP'} — {ap.serialNumber}
          </option>)}
        </Select>
        <Button colorScheme="blue" isDisabled={!status.data || !serial || active} isLoading={onboard.isLoading}
          onClick={() => onboard.mutate()}>Onboard</Button>
      </HStack>
      {onboard.isError && <Alert status="error"><AlertIcon />Onboarding could not be requested. Check that the AP is assigned to its current owner.</Alert>}
      {onboard.data && <Text>{onboard.data.message}</Text>}
      {cancel.isError && <Alert status="error"><AlertIcon />The request could not be cancelled. Its current state has been preserved.</Alert>}
      {jobs.length > 0 && <Box><Heading size="md" mb={3}>Onboarding progress</Heading>
        {jobs.map((job) => <HStack key={job.id} mb={2} flexWrap="wrap">
          <Text>{job.serial}</Text><Badge>{job.state}</Badge><Text>{job.message}</Text>
          {job.state === 'waiting' && <Button size="sm" isLoading={cancel.isLoading} onClick={() => cancel.mutate(job.id)}>Cancel</Button>}
        </HStack>)}
      </Box>}
      <Box overflowX="auto"><Heading size="md" mb={3}>AP certificates</Heading>
        <Table size="sm"><Thead><Tr><Th>AP</Th><Th>Expires</Th><Th>Status</Th></Tr></Thead>
          <Tbody>{status.data?.certificates.map((cert) => <Tr key={cert.fingerprint}>
            <Td>{cert.device}</Td><Td>{date(cert.expires)}</Td><Td>
              {cert.revoked ? 'Revoked' : cert.expires * 1000 <= Date.now() ? 'Expired' : cert.observed ? 'Existing certificate' : cert.managementAcceptedAt ? 'Verified' : 'Verification pending'}
            </Td></Tr>)}</Tbody>
        </Table>
      </Box>
      <Accordion allowMultiple><AccordionItem>
        <AccordionButton><Box flex="1" textAlign="left">CA details</Box><AccordionIcon /></AccordionButton>
        <AccordionPanel>{status.data?.roots.map((root) => <Box key={root.fingerprint} mb={3}>
          <Text>{root.name} ({root.state || 'retained'}) — expires {date(root.expires)}</Text>
          <Text fontSize="sm" overflowWrap="anywhere">{root.fingerprint}</Text>
        </Box>)}<Text>The existing CA stays trusted until every AP has migrated or been explicitly retired.</Text></AccordionPanel>
      </AccordionItem><AccordionItem>
        <AccordionButton><Box flex="1" textAlign="left">Activity</Box><AccordionIcon /></AccordionButton>
        <AccordionPanel>{audit.data?.map((event, index) => <Text key={`${event.stamp}-${index}`}>
          {date(event.stamp)} — {event.action}: {event.target}
        </Text>)}</AccordionPanel>
      </AccordionItem></Accordion>
    </VStack>
  );
};

const CertificatesRoute = () => {
  const { user } = useAuth();
  if (!user) return <Alert status="info"><AlertIcon />Waiting for the portal to load your signed-in account.</Alert>;
  if (!user.userRole) return <Alert status="warning"><AlertIcon />The portal account response has no user role. AP certificate management cannot verify access.</Alert>;
  if (user.userRole !== 'root') return <Alert status="warning"><AlertIcon />AP certificate management requires Root access. The portal reports your account role as {user.userRole}.</Alert>;
  return <CertificatesPage />;
};

export default CertificatesRoute;
