import React, { useState } from 'react';
import { Alert, AlertIcon, Box, Button, Checkbox, Heading, Input, Select, SimpleGrid, Text, VStack } from '@chakra-ui/react';
import { useMutation } from '@tanstack/react-query';
import { axiosPki as axiosProv } from 'utils/pkiClient';

type RecordRow = { version: number; actor: string; approved: number; identity?: string; record: Record<string, string | string[]> };
type Evidence = { hardware: RecordRow | null; qualifications: RecordRow[]; runtimes: RecordRow[] };
const hardwareFields = [
  ['exact_model', 'Exact model'], ['sku_hex', 'Manufacturing hardware code (8 hex characters)'],
  ['hardware_revision', 'Hardware revision'], ['region', 'Manufacturing region'],
  ['factory_product_id', 'Manufacturing product identifier'], ['evidence_sha256', 'Captured manufacturing evidence fingerprint'],
] as const;
const artifactFields = [
  ['source_capability_contract_digest', 'Source capability evidence fingerprint'],
  ['installer_sha256', 'Installer fingerprint'], ['target_image_sha256', 'Target image fingerprint'],
  ['shared_recovery_manifest_sha256', 'Recovery plan fingerprint'], ['qualification_evidence_digest', 'Qualification evidence fingerprint'],
] as const;

const MigrationEvidence = () => {
  const [serial, setSerial] = useState('');
  const [stage, setStage] = useState('hardware');
  const [operation, setOperation] = useState('production-stock-openwrt-migration');
  const [identity, setIdentity] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [reviewed, setReviewed] = useState(false);
  const evidence = useMutation(() => axiosProv.post<Evidence>('pki/evidence', { serial }).then(({ data }) => data));
  const save = useMutation(() => {
    if (stage === 'hardware') return axiosProv.post('pki/approve-hardware', { record: {
      ...values, schema: 'openwifi.ap-hardware-evidence.v1', serialNumber: serial,
      evidence_method: 'reviewed-manufacturing-capture',
    } });
    if (stage === 'qualification') return axiosProv.post('pki/approve-qualification', { record: {
      ...values, schema: 'openwifi.oem-migration-qualification.v1', operation, status: 'qualified',
      region_compatibility: (values.region_compatibility || '').split(',').map((value) => value.trim()),
    } });
    const selected = evidence.data?.qualifications.find((row) => row.identity === identity);
    return axiosProv.post('pki/approve-runtime', { identity, record: {
      ...values, serial, operation: selected?.record.operation,
    } });
  }, { onSuccess: () => { setReviewed(false); if (/^[0-9a-f]{12}$/.test(serial)) evidence.mutate(); } });
  const fields: ReadonlyArray<readonly [string, string]> = stage === 'hardware' ? hardwareFields : stage === 'qualification'
    ? [...hardwareFields.slice(0, 3), ['region_compatibility', 'Qualified regions (comma separated)'] as const, ...artifactFields]
    : [...hardwareFields.slice(0, 4), ...artifactFields];
  const filled = fields.every(([name]) => !!values[name]);

  return <Box>
    <Heading size="md" mb={3}>Migration evidence review</Heading>
    <Text mb={3}>Approve captured manufacturing details and reviewed migration releases here. OEM and stock OpenWrt use separate approvals. These records do not enroll or change an AP.</Text>
    <VStack align="stretch" spacing={3}>
      <Input aria-label="Evidence AP serial" placeholder="AP serial" value={serial} onChange={(event) => {
        setSerial(event.target.value); evidence.reset(); save.reset(); setReviewed(false);
      }} />
      <Button alignSelf="start" isDisabled={!/^[0-9a-f]{12}$/.test(serial)} isLoading={evidence.isLoading} onClick={() => evidence.mutate()}>Load approved records</Button>
      {evidence.isError && <Alert status="error"><AlertIcon />Evidence unavailable. Check access and provisioning inventory.</Alert>}
      {evidence.data?.hardware && <Text>Manufacturing evidence version {evidence.data.hardware.version}, approved by {evidence.data.hardware.actor}. Source approvals: {evidence.data.runtimes.length}.</Text>}
      <Select aria-label="Review type" value={stage} onChange={(event) => {
        setStage(event.target.value); setValues({}); setReviewed(false); save.reset();
      }}>
        <option value="hardware">Manufacturing evidence</option>
        <option value="qualification">Qualified migration release</option>
        <option value="runtime">Captured source and artifact verification</option>
      </Select>
      {stage === 'qualification' && <Select aria-label="Migration source" value={operation} onChange={(event) => {
        setOperation(event.target.value); setReviewed(false);
      }}><option value="production-stock-openwrt-migration">Stock OpenWrt to OpenWiFi</option><option value="production-oem-migration">OEM to OpenWiFi</option></Select>}
      {stage === 'runtime' && <Select aria-label="Approved migration release" value={identity} onChange={(event) => {
        setIdentity(event.target.value); setReviewed(false);
      }}><option value="">Select an approved release</option>{evidence.data?.qualifications.map((row) =>
        <option key={row.identity} value={row.identity}>{String(row.record.exact_model)} — {row.record.operation === 'production-oem-migration' ? 'OEM' : 'Stock OpenWrt'} — version {row.version}</option>)}</Select>}
      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>{fields.map(([name, label]) =>
        <Box key={name}><Text mb={1}>{label}</Text><Input aria-label={label} value={values[name] || ''} onChange={(event) => {
          setValues({ ...values, [name]: event.target.value }); setReviewed(false); save.reset();
        }} /></Box>)}</SimpleGrid>
      <Checkbox isChecked={reviewed} onChange={(event) => setReviewed(event.target.checked)}>I reviewed the captured evidence and verified these exact identifiers and fingerprints.</Checkbox>
      <Button alignSelf="start" isDisabled={!reviewed || !filled || (stage !== 'qualification' && !/^[0-9a-f]{12}$/.test(serial)) || (stage === 'runtime' && !identity)}
        isLoading={save.isLoading} onClick={() => save.mutate()}>Approve reviewed record</Button>
      {save.isError && <Alert status="error"><AlertIcon />Approval refused. Check exact hardware, source, artifact evidence and access.</Alert>}
      {save.isSuccess && <Alert status="success"><AlertIcon />Reviewed record saved. Changed evidence invalidates earlier source approvals.</Alert>}
    </VStack>
  </Box>;
};

export default MigrationEvidence;
