import React from 'react';
import { Alert, AlertIcon, Box, Button, Checkbox, Flex, Select, SimpleGrid, Text } from '@chakra-ui/react';
import { ErrorMessage, useFormikContext } from 'formik';
import { User } from 'hooks/Network/Users';
import { useGetEntities } from 'hooks/Network/Entity';
import { useGetVenues } from 'hooks/Network/Venues';
import { AccessGrant, AccessPolicy, editableAccessCapabilities, accessPreset, grantPreset, parseAccessPolicy } from 'helpers/userAccessPolicy';

const AccessEditor = ({ disabled }: { disabled: boolean }) => {
  const { values, setFieldValue } = useFormikContext<User>();
  const { data: entities = [], isError: entityError } = useGetEntities();
  const { data: venues = [], isError: venueError } = useGetVenues();
  const policy = parseAccessPolicy(values.securityPolicy, true);
  const setPolicy = (next: AccessPolicy) => setFieldValue('securityPolicy', JSON.stringify(next));
  const updateGrant = (index: number, update: Partial<AccessGrant>) => {
    if (policy) setPolicy({ ...policy, grants: policy.grants.map((grant, i) => i === index ? { ...grant, ...update } : grant) });
  };
  if (values.userRole === 'root') return <Text>Full administrator access.</Text>;
  if (!values.securityPolicy) return (
    <Box>
      <Text mb={3}>No site permissions assigned. Set site access to grant explicit site permissions.</Text>
      <Button isDisabled={disabled} onClick={() => setPolicy({ version: 1, grants: [] })}>Set site access</Button>
    </Box>
  );
  if (!policy) return <Alert status="error"><AlertIcon />Unsupported access policy. Site permissions cannot be edited.</Alert>;
  return (
    <Box>
      <ErrorMessage name="securityPolicy">{(message) => <Alert status="error" mb={3}><AlertIcon />{message}</Alert>}</ErrorMessage>
      {(entityError || venueError) && <Alert status="error" mb={3}><AlertIcon />Sites could not be loaded.</Alert>}
      <Text mb={3}>Viewer reads site data. Editor can edit configuration. Operator can also push configuration and reboot devices.</Text>
      {policy.grants.length === 0 && <Text mb={3}>No site access.</Text>}
      {policy.grants.map((grant, index) => (
        <Box key={index} borderWidth="1px" borderRadius="md" p={4} mb={3}>
          <Flex gap={3} mb={3}>
            <Select aria-label="Scope type" value={grant.scopeType} isDisabled={disabled}
              onChange={(event) => updateGrant(index, { scopeType: event.target.value as 'entity' | 'venue', scopeId: '' })}>
              <option value="venue">Venue</option><option value="entity">Entity</option>
            </Select>
            <Select aria-label="Site" value={grant.scopeId} isDisabled={disabled || entityError || venueError}
              onChange={(event) => updateGrant(index, { scopeId: event.target.value })}>
              <option value="">Select site</option>
              {((grant.scopeType === 'entity' ? entities : venues) as Array<{ id: string; name: string }>).filter((site) => site.id !== '0000-0000-0000')
                .map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
            </Select>
            <Select aria-label="Permission preset" value={grantPreset(grant)} isDisabled={disabled}
              onChange={(event) => { if (event.target.value !== 'custom') updateGrant(index, { capabilities: accessPreset(event.target.value) }); }}>
              <option value="viewer">Viewer</option><option value="editor">Editor</option>
              <option value="operator">Operator</option><option value="custom">Custom</option>
            </Select>
            <Button isDisabled={disabled} onClick={() => setPolicy({ ...policy, grants: policy.grants.filter((_, i) => i !== index) })}>Remove</Button>
          </Flex>
          <Checkbox isDisabled={disabled} isChecked={grant.includeDescendants}
            onChange={(event) => updateGrant(index, { includeDescendants: event.target.checked })} mb={3}>Include child sites</Checkbox>
          <SimpleGrid columns={[1, 2, 3]} spacing={2}>
            {editableAccessCapabilities.map(([key, label]) => (
              <Checkbox key={key} isDisabled={disabled} isChecked={grant.capabilities.includes(key)}
                onChange={(event) => updateGrant(index, { capabilities: event.target.checked
                  ? [...grant.capabilities, key] : grant.capabilities.filter((capability) => capability !== key) })}>{label}</Checkbox>
            ))}
          </SimpleGrid>
        </Box>
      ))}
      <Button isDisabled={disabled || policy.grants.length >= 256} onClick={() => setPolicy({ ...policy, grants: [...policy.grants,
        { scopeType: 'venue', scopeId: '', includeDescendants: false, capabilities: accessPreset('viewer') }] })}>Add site</Button>
    </Box>
  );
};
export default AccessEditor;
