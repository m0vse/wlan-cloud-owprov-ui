import React, { useEffect, useState } from 'react';
import {
  Alert, AlertIcon, Badge, Box, Button, Heading, HStack, Input, Select,
  Table, Tbody, Td, Text, Textarea, Th, Thead, Tr, VStack,
} from '@chakra-ui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { axiosProv } from 'utils/axiosInstances';
import MigrationEvidence from './MigrationEvidence';

type Certificate = {
  fingerprint: string;
  device: string;
  issuer: string;
  expires: number;
  revoked: number;
  managementAcceptedAt?: number;
  issuanceKind?: string;
};
type Status = {
  certificates: Certificate[];
  issuers: string[];
  activeIssuer: string;
  gatewayEnforcement: string;
  roots: { fingerprint: string; name: string; expires: number }[];
  activeRoot: string;
};
type Audit = { stamp: number; actor: string; action: string; target: string };

const CertificatesPage = () => {
  const queries = useQueryClient();
  const [serial, setSerial] = useState('');
  const [csr, setCsr] = useState('');
  const [operation, setOperation] = useState('production-stock-openwrt-migration');
  const identity = useMutation(
    () => axiosProv.post('pki/approve-identity', { serial, approved: true, enabled: true, retired: false }),
    { onSuccess: () => queries.invalidateQueries(['pki-audit']) },
  );
  const status = useQuery(['pki-status'], () => axiosProv.get<Status>('pki/status').then(({ data }) => data), {
    retry: false,
  });
  const audit = useQuery(['pki-audit'], () => axiosProv.get<{ events: Audit[] }>('pki/audit').then(({ data }) => data.events), {
    retry: false,
  });
  const enroll = useMutation(
    () => axiosProv.post<{ authorization: string; expiresIn: number; serial: string }>('pki/authorize', { serial, csr, operation }).then(({ data }) => data),
    { onSuccess: () => queries.invalidateQueries(['pki-audit']) },
  );
  useEffect(() => {
    if (!enroll.data) return undefined;
    const timer = window.setTimeout(() => enroll.reset(), enroll.data.expiresIn * 1000);
    return () => window.clearTimeout(timer);
  }, [enroll.data, enroll.reset]);
  const date = (stamp: number) => new Date(stamp * 1000).toLocaleString();
  const ready = status.data?.gatewayEnforcement === 'enforced';

  return (
    <VStack align="stretch" spacing={5}>
      <HStack justify="space-between">
        <Heading size="lg">AP certificates</Heading>
        <Button onClick={() => { status.refetch(); audit.refetch(); }} isLoading={status.isFetching}>Refresh</Button>
      </HStack>
      {status.isError && <Alert status="error"><AlertIcon />Certificate service unavailable or access refused.</Alert>}
      {status.data && !ready && <Alert status="warning"><AlertIcon />Gateway enforcement is pending. Live enrollment, revocation and CA retirement are unavailable.</Alert>}
      {status.data && (
        <Box>
          {status.data.roots.map((root) => <Text key={root.fingerprint}>{root.name} — expires {date(root.expires)} {root.fingerprint === status.data?.activeRoot ? '(active)' : '(retained)'}</Text>)}
          <Text>Active issuing CA: {status.data.activeIssuer}</Text>
          <Text>Retained issuing CAs: {status.data.issuers.length}. Keep existing trust until every AP has migrated.</Text>
        </Box>
      )}
      <Box overflowX="auto">
        <Table size="sm">
          <Thead><Tr><Th>AP serial</Th><Th>Certificate</Th><Th>Expires</Th><Th>Status</Th><Th>Issuing CA</Th><Th>Management verification</Th></Tr></Thead>
          <Tbody>{status.data?.certificates.map((cert) => (
            <Tr key={cert.fingerprint}>
              <Td>{cert.device}</Td><Td title={cert.fingerprint}>{cert.fingerprint.slice(0, 16)}…</Td>
              <Td>{date(cert.expires)}</Td>
              <Td><Badge colorScheme={cert.revoked || cert.expires * 1000 <= Date.now() ? 'red' : 'green'}>
                {cert.revoked ? 'Revoked' : cert.expires * 1000 <= Date.now() ? 'Expired' : 'Issued'}
              </Badge></Td>
              <Td title={cert.issuer}>{cert.issuer.slice(0, 16)}…</Td>
              <Td>{cert.managementAcceptedAt ? `${date(cert.managementAcceptedAt)} (${cert.issuanceKind || 'unclassified'})` : 'Pending'}</Td>
            </Tr>
          ))}</Tbody>
        </Table>
      </Box>
      {status.data?.certificates.length === 0 && <Text>No certificates have been issued by this service.</Text>}
      <MigrationEvidence />
      <Box>
        <Heading size="md" mb={3}>Authorize installation or recovery</Heading>
        <Text mb={3}>Use a certificate request generated on the AP. Authorization is bound to its serial and key and lasts ten minutes.</Text>
        <VStack align="stretch">
          <Input aria-label="AP serial" placeholder="AP serial" value={serial} onChange={(event) => { setSerial(event.target.value); enroll.reset(); }} />
          <Text>Approve the current AP inventory and ownership before enrollment. A change of ownership requires another review.</Text>
          <Button alignSelf="start" isDisabled={!ready || !/^[0-9a-f]{12}$/.test(serial)} isLoading={identity.isLoading} onClick={() => identity.mutate()}>Approve this AP identity</Button>
          {identity.isError && <Alert status="error"><AlertIcon />Identity approval refused. Check inventory and ownership.</Alert>}
          {identity.isSuccess && <Text>Identity approval recorded.</Text>}
          <Select aria-label="Migration path" value={operation} onChange={(event) => { setOperation(event.target.value); enroll.reset(); }}>
            <option value="production-stock-openwrt-migration">OpenWrt to OpenWiFi</option>
            <option value="production-oem-migration">OEM to OpenWiFi</option>
          </Select>
          <Textarea aria-label="AP certificate request" placeholder="AP certificate request (PEM)" value={csr} onChange={(event) => { setCsr(event.target.value); enroll.reset(); }} />
          <Button alignSelf="start" isDisabled={!ready || !/^[0-9a-f]{12}$/.test(serial) || !csr || !!enroll.data} isLoading={enroll.isLoading} onClick={() => enroll.mutate()}>Authorize this request</Button>
          {enroll.isError && <Alert status="error"><AlertIcon />Authorization failed. Check access, inventory and certificate request.</Alert>}
          {enroll.data && <Box><Text>Private authorization for {enroll.data.serial}. Pass it to the installer before expiry.</Text><Text userSelect="all" fontFamily="monospace">{enroll.data.authorization}</Text><Button mt={2} onClick={() => enroll.reset()}>Dismiss authorization</Button></Box>}
        </VStack>
      </Box>
      <Box overflowX="auto">
        <Heading size="md" mb={3}>Operator audit</Heading>
        {audit.isError && <Alert status="error"><AlertIcon />Audit records unavailable.</Alert>}
        <Table size="sm"><Thead><Tr><Th>Time</Th><Th>Operator</Th><Th>Action</Th><Th>Target</Th></Tr></Thead>
          <Tbody>{audit.data?.map((event, index) => <Tr key={`${event.stamp}-${index}`}><Td>{date(event.stamp)}</Td><Td>{event.actor}</Td><Td>{event.action}</Td><Td>{event.target}</Td></Tr>)}</Tbody>
        </Table>
      </Box>
    </VStack>
  );
};

export default CertificatesPage;
