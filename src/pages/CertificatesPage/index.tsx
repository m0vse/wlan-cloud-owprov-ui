import React, { useState } from 'react';
import {
  Accordion, AccordionButton, AccordionIcon, AccordionItem, AccordionPanel,
  Alert, AlertIcon, Badge, Box, Button, Heading, HStack, Select,
  Table, Tbody, Td, Text, Th, Thead, Tr, VStack, Textarea, Input, useClipboard,
} from '@chakra-ui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { axiosProv, axiosGw } from 'utils/axiosInstances';
import { axiosPki } from 'utils/pkiClient';
import { useAuth } from 'contexts/AuthProvider';
import ImportDeviceCsvModal from 'components/Tables/InventoryTable/ImportDeviceCsvModal';

type Job = { id: string; serial: string; state: string; message: string; kind?: string };
type Certificate = {
  fingerprint: string; issuer: string; device: string; expires: number; revoked: number;
  observed?: boolean; nativeConnected?: boolean; superseded?: boolean; canDelete?: boolean; nativeError?: string;
};
type EnrollmentBatch = { id: string; active: number; devices: number; enrolled: number; operation: string };
type EnrollmentKey = { id: string; enrollmentKey: string; server: string; devices: number };
type Status = {
  certificates: Certificate[]; activeIssuer?: string; enrollmentBatches?: EnrollmentBatch[];
  roots: { fingerprint: string; name: string; expires: number; state?: string }[];
  gatewayEnforcement: string; onboarding: Job[]; nativeRenewalReady?: boolean; nativeEnrollmentReady?: boolean;
};
type Inventory = { serialNumber: string; name?: string; deviceType?: string };
type Audit = { stamp: number; actor: string; action: string; target: string };

const CertificatesPage = () => {
  const queries = useQueryClient();
  const [serial, setSerial] = useState('');
  const [batchSerials, setBatchSerials] = useState('');
  const [batchOperation, setBatchOperation] = useState('migration');
  const [enrollmentKey, setEnrollmentKey] = useState<EnrollmentKey>();
  const { onCopy, hasCopied } = useClipboard(enrollmentKey?.enrollmentKey || '');
  const status = useQuery(['pki-status'], () => axiosPki.get<Status>('pki/status').then(({ data }) => data), {
    retry: false, refetchInterval: (data) => (data?.onboarding?.some((job) => ['waiting', 'running'].includes(job.state)) || data?.enrollmentBatches?.some((batch) => !!batch.active && batch.enrolled < batch.devices)) ? 10000 : false,
  });
  const inventory = useQuery(['pki-onboarding-inventory'], () =>
    axiosProv.get<{ taglist: Inventory[] }>('inventory?offset=0&limit=1000').then(({ data }) => data.taglist), {
    retry: false,
  });
  const gateway = useQuery(['pki-ap-status', serial], () =>
    axiosGw.get<{ lastRecordedContact: number; certificateExpiryDate: number }>(`device/${serial}`).then(({ data }) => data).catch((error) => {
      if (error.response?.status === 404) return { lastRecordedContact: 0, certificateExpiryDate: 0 };
      throw error;
    }), { enabled: !!serial, retry: false });
  const audit = useQuery(['pki-audit'], () => axiosPki.get<{ events: Audit[] }>('pki/audit').then(({ data }) => data.events), {
    retry: false,
  });
  const refresh = () => { status.refetch(); audit.refetch(); if (serial) gateway.refetch(); };
  const onboard = useMutation(() => axiosPki.post<Job>(migrated ? 'pki/renew' : 'pki/move-ca', { serial }).then(({ data }) => data), {
    onSuccess: () => { queries.invalidateQueries(['pki-status']); queries.invalidateQueries(['pki-audit']); },
  });
  const cancel = useMutation((job: string) => axiosPki.post<Job>('pki/cancel-onboarding', { job }).then(({ data }) => data), {
    onSuccess: () => { queries.invalidateQueries(['pki-status']); queries.invalidateQueries(['pki-audit']); },
  });
  const createEnrollmentKey = useMutation(() => axiosPki.post<EnrollmentKey>('pki/create-enrollment-key', {
    serials: [...new Set(batchSerials.toLowerCase().split(/[\s,;]+/).filter(Boolean))], operation: batchOperation,
  }).then(({ data }) => data), { onSuccess: (data) => { setEnrollmentKey(data); refresh(); } });
  const deleteCertificate = useMutation((fingerprint: string) => axiosPki.post('pki/delete-certificate', { fingerprint }), {
    onSuccess: refresh,
  });
  const cancelEnrollmentKey = useMutation((id: string) => axiosPki.post('pki/cancel-enrollment-key', { id }), {
    onSuccess: () => { setEnrollmentKey(undefined); refresh(); },
  });
  const rotateEnrollmentKey = useMutation((id: string) => axiosPki.post<EnrollmentKey>('pki/rotate-enrollment-key', { id }).then(({ data }) => data), {
    onSuccess: (data) => { setEnrollmentKey(data); refresh(); },
  });
  const date = (stamp: number) => new Date(stamp * 1000).toLocaleString();
  const jobs = status.data?.onboarding || [];
  const knownCertificate = status.data?.certificates.some((cert) => cert.device === serial);
  const existing = !!knownCertificate || (gateway.data?.lastRecordedContact || 0) > 0 || (gateway.data?.certificateExpiryDate || 0) > 0;
  const migrated = status.data?.certificates.some((cert) => cert.device === serial && !cert.observed && !cert.revoked && cert.issuer === status.data?.activeIssuer && cert.expires * 1000 > Date.now());
  const action = migrated ? 'Renew certificate' : existing ? 'Move to new CA' : 'Add to enrollment';
  const active = jobs.some((job) => job.serial === serial && ['waiting', 'running'].includes(job.state));

  return (
    <VStack align="stretch" spacing={5}>
      <HStack justify="space-between"><Heading size="lg">AP certificates</Heading>
        <Button onClick={refresh} isLoading={status.isFetching}>Refresh</Button></HStack>
      <Box borderWidth="1px" borderRadius="md" p={4}>
        <Heading size="md" mb={2}>Enrollment key</Heading>
        <Text mb={3}>Create one key for your APs, then use that same key in each migration installer. Each AP gets its own certificate and renews automatically.</Text>
        <HStack mb={2} flexWrap="wrap">
          <Select aria-label="Enrollment type" maxW="320px" value={batchOperation} onChange={(event) => setBatchOperation(event.target.value)}>
            <option value="migration">OEM / OpenWrt migration</option><option value="new-openwifi-enrollment">New OpenWiFi APs</option>
          </Select>
          <Button size="sm" onClick={() => setBatchSerials((inventory.data || []).filter((ap) => !status.data?.certificates.some((cert) => cert.device === ap.serialNumber)).map((ap) => ap.serialNumber).join('\n'))}>Use all pending APs</Button>
          <ImportDeviceCsvModal deviceClass="venue" refresh={() => inventory.refetch()} />
        </HStack>
        <Textarea aria-label="AP serial numbers for enrollment" placeholder="Paste AP serial numbers, or use all pending APs from inventory" value={batchSerials} onChange={(event) => setBatchSerials(event.target.value)} rows={3} mb={2} />
        <Button colorScheme="blue" isDisabled={!batchSerials.trim() || !status.data?.nativeEnrollmentReady} isLoading={createEnrollmentKey.isLoading} onClick={() => createEnrollmentKey.mutate()}>Create enrollment key</Button>
        {createEnrollmentKey.isError && <Text color="red.500" mt={2}>The key could not be created. Check that these APs are in inventory and are not already enrolled.</Text>}
        {enrollmentKey && <Box mt={3}><Text>Use this key for all {enrollmentKey.devices} APs in the batch.</Text><HStack><Input aria-label="Shared enrollment key" type="password" value={enrollmentKey.enrollmentKey} isReadOnly fontFamily="mono" /><Button onClick={onCopy}>{hasCopied ? 'Copied' : 'Copy key'}</Button></HStack><Text fontSize="sm" mt={1}>Enrollment server: {enrollmentKey.server}</Text></Box>}
        {status.data?.enrollmentBatches?.map((batch) => <HStack key={batch.id} mt={3} flexWrap="wrap"><Text>{batch.enrolled} / {batch.devices} certificates issued</Text><Badge>{batch.active ? 'Active' : 'Cancelled'}</Badge>{!!batch.active && <><Button size="sm" isLoading={rotateEnrollmentKey.isLoading} onClick={() => rotateEnrollmentKey.mutate(batch.id)}>Replace key</Button><Button size="sm" isLoading={cancelEnrollmentKey.isLoading} onClick={() => cancelEnrollmentKey.mutate(batch.id)}>Cancel enrollment</Button></>}</HStack>)}
        {(cancelEnrollmentKey.isError || rotateEnrollmentKey.isError) && <Text color="red.500">The enrollment key could not be updated. Try Refresh.</Text>}
      </Box>
      <Text>Select an existing AP to renew its certificate or move it to the new CA.</Text>
      {status.isError && <Alert status="warning"><AlertIcon />Onboarding service is unavailable. Existing APs continue using their current certificates.</Alert>}
      {status.data && !status.data.nativeRenewalReady && <Alert status="info"><AlertIcon />Certificate integration is still in progress. Requests will wait until it is ready.</Alert>}
      {inventory.isError && <Alert status="error"><AlertIcon />The AP inventory could not be loaded.</Alert>}
      <HStack align="start" flexWrap="wrap">
        <Select aria-label="AP to manage" placeholder={inventory.isLoading ? 'Loading APs…' : 'Select an AP'}
          maxW="500px" value={serial} onChange={(event) => { setSerial(event.target.value); onboard.reset(); }}>
          {inventory.data?.map((ap) => <option key={ap.serialNumber} value={ap.serialNumber}>
            {ap.name || ap.deviceType || 'AP'} — {ap.serialNumber}
          </option>)}
        </Select>
        <Button colorScheme="blue" isDisabled={!status.data || !serial || active || gateway.isLoading || gateway.isError} isLoading={onboard.isLoading}
          onClick={() => { if (existing) onboard.mutate(); else setBatchSerials((current) => [...new Set([...current.split(/[\s,;]+/).filter(Boolean), serial])].join('\n')); }}>{action}</Button>
      </HStack>
      {gateway.isError && <Alert status="warning"><AlertIcon />The AP connection history could not be checked. Try Refresh before starting an operation.</Alert>}
      {onboard.isError && <Alert status="error"><AlertIcon />Onboarding could not be requested. Check that the AP is assigned to its current owner.</Alert>}
      {onboard.data && <Text>{onboard.data.message}</Text>}
      {cancel.isError && <Alert status="error"><AlertIcon />The request could not be cancelled. Its current state has been preserved.</Alert>}
      {jobs.length > 0 && <Box><Heading size="md" mb={3}>AP progress</Heading>
        {jobs.map((job) => <HStack key={job.id} mb={2} flexWrap="wrap">
          <Text>{job.serial}</Text><Badge>{job.state}</Badge><Text>{job.message}</Text>
          {job.state === 'waiting' && <Button size="sm" isLoading={cancel.isLoading} onClick={() => cancel.mutate(job.id)}>Cancel</Button>}
        </HStack>)}
      </Box>}
      <Box overflowX="auto"><Heading size="md" mb={3}>AP certificates</Heading>
        {deleteCertificate.isError && <Text color="red.500" mb={2}>{(deleteCertificate.error as any)?.response?.data?.error || 'Certificate could not be deleted. Refresh and try again.'}</Text>}
        <Table size="sm"><Thead><Tr><Th>AP</Th><Th>Certificate reference</Th><Th>Expires</Th><Th>Status</Th><Th>Actions</Th></Tr></Thead>
          <Tbody>{status.data?.certificates.map((cert) => <Tr key={cert.fingerprint}>
            <Td>{cert.device}</Td><Td><Text fontFamily="mono" fontSize="xs" maxW="360px" overflowWrap="anywhere" title="SHA-256 certificate fingerprint">{cert.fingerprint}</Text></Td><Td>{date(cert.expires)}</Td><Td>
              {cert.revoked ? 'Revoked' : cert.expires * 1000 <= Date.now() ? 'Expired' : cert.observed ? 'Existing certificate' : cert.nativeError ? 'Review required' : cert.nativeConnected ? 'Connected with this certificate' : cert.superseded ? 'Replaced' : 'Awaiting connection'}
            </Td><Td>{cert.canDelete && <Button size="sm" colorScheme="red" variant="outline" isLoading={deleteCertificate.isLoading} onClick={() => deleteCertificate.mutate(cert.fingerprint)}>Delete unused</Button>}</Td></Tr>)}</Tbody>
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
