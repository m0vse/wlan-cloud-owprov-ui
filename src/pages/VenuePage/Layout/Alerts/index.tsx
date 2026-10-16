import React from 'react';
import { Alert, AlertIcon, Box, Button, Checkbox, FormControl, FormLabel, Heading, HStack, Input,
  Select, SimpleGrid, Spacer, Spinner, Table, Tbody, Td, Text, Textarea, Th, Thead, Tr } from '@chakra-ui/react';
import Card from 'components/Card';
import CardHeader from 'components/Card/CardHeader';
import CardBody from 'components/Card/CardBody';
import SaveButton from 'components/Buttons/SaveButton';
import ToggleEditButton from 'components/Buttons/ToggleEditButton';
import { useAuth } from 'contexts/AuthProvider';
import { hasAccessCapability } from 'helpers/userAccessPolicy';
import { alertTypes, localDateTime, splitRecipients, validateAlertSettings } from 'helpers/venueAlerts';
import { AlertScopeKind, AlertSettings, useVenueAlerts, useUpdateVenueAlerts } from 'hooks/Network/VenueAlerts';

const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const VenueAlertsForm = ({ id, kind }: { id: string; kind: AlertScopeKind }) => {
  const { user } = useAuth();
  const query = useVenueAlerts(id, kind);
  const update = useUpdateVenueAlerts(id, kind);
  const [draft, setDraft] = React.useState<AlertSettings>();
  const [emails, setEmails] = React.useState('');
  const [phones, setPhones] = React.useState('');
  const [editing, setEditing] = React.useState(false);
  const [error, setError] = React.useState('');
  const [saved, setSaved] = React.useState(false);
  const settings = query.data?.settings;
  const reset = () => { setDraft(settings ? JSON.parse(JSON.stringify(settings)) : undefined);
    setEmails(settings?.emails.join('\n') ?? ''); setPhones(settings?.phones.join('\n') ?? ''); setError(''); };
  React.useEffect(() => { if (!editing) reset(); }, [settings, editing]);
  const canEdit = hasAccessCapability(user, 'resources.write');
  if (!hasAccessCapability(user, 'devices.read')) return <Alert status="error"><AlertIcon />Access denied.</Alert>;
  // Do not display cached venue information after an access failure or venue change.
  if (query.isError) return <Alert status="error"><AlertIcon />Alerts could not be loaded.</Alert>;
  if (query.isLoading || !draft) return <Spinner aria-label="Loading alerts" />;
  if (query.data?.available !== true) return <Alert status="warning"><AlertIcon />Alerts are unavailable for this venue.</Alert>;
  const next = { ...draft, emails: splitRecipients(emails), phones: splitRecipients(phones) };
  const dirty = JSON.stringify(next) !== JSON.stringify(settings);
  const disabled = !editing || update.isLoading || !canEdit;
  const change = (values: Partial<AlertSettings>) => { setDraft({ ...draft, ...values }); setError(''); setSaved(false); };
  const save = async () => {
    if (disabled || !dirty) return;
    const validation = validateAlertSettings(next);
    if (validation) { setError(validation); return; }
    try { await update.mutateAsync(next); setSaved(true); setEditing(false); }
    catch { setError('Alerts could not be saved.'); }
  };
  return <Card>
    <CardHeader><Heading size="md" my="auto">Alerts</Heading><Spacer />
      {canEdit && <HStack spacing={2}><SaveButton onClick={save} hidden={!editing} isLoading={update.isLoading} isDisabled={disabled || !dirty} />
        <ToggleEditButton isEditing={editing} isDirty={dirty} isDisabled={update.isLoading}
          toggleEdit={() => { reset(); update.reset(); setSaved(false); setEditing(!editing); }} /></HStack>}
    </CardHeader>
    <CardBody><Box w="100%">
      {query.data.inherited && <Text fontSize="sm" mb={3}>Inherited{query.data.sourceScope?.name ? ` from ${query.data.sourceScope.name}` : ''}</Text>}
      {editing && query.data.configured && <Button size="sm" mb={3} isDisabled={update.isLoading || dirty}
        onClick={async () => { try { await update.mutateAsync({ inherit: true }); setEditing(false); setSaved(true); } catch { setError('Inherited rules could not be restored.'); } }}>Use inherited rules</Button>}
      <Checkbox aria-label="Enable alerts" isChecked={draft.enabled} isDisabled={disabled} onChange={(event) => change({ enabled: event.target.checked })}>Enable alerts</Checkbox>
      <SimpleGrid columns={[1, 2]} spacing={4} mt={4}>
        <FormControl><FormLabel htmlFor="alert-emails">Email recipients</FormLabel><Textarea id="alert-emails" value={emails} isDisabled={disabled}
          onChange={(event) => { setEmails(event.target.value); setError(''); setSaved(false); }} /></FormControl>
        <FormControl><FormLabel htmlFor="alert-phones">SMS recipients</FormLabel><Textarea id="alert-phones" value={phones} isDisabled={disabled}
          onChange={(event) => { setPhones(event.target.value); setError(''); setSaved(false); }} /></FormControl>
      </SimpleGrid>
      <Text fontSize="sm" mt={2}>One recipient per line or separated by commas. SMS numbers need a country code.</Text>
      <SimpleGrid columns={[1, 2]} spacing={4} mt={4}>
        <FormControl><FormLabel htmlFor="alert-group-by">Group emails by</FormLabel><Select id="alert-group-by" value={draft.groupBy} isDisabled={disabled}
          onChange={(event) => change({ groupBy: event.target.value as AlertSettings['groupBy'] })}><option value="venue">Venue</option><option value="entity">Entity</option></Select></FormControl>
        <FormControl><FormLabel htmlFor="alert-group-window">Grouping wait (seconds)</FormLabel><Input id="alert-group-window" type="number" min={0} max={3600} step={1}
          value={Number.isNaN(draft.groupWindowSeconds) ? '' : draft.groupWindowSeconds} isDisabled={disabled}
          onChange={(event) => change({ groupWindowSeconds: event.target.value === '' ? Number.NaN : Number(event.target.value) })} /></FormControl>
      </SimpleGrid>
      <Box overflowX="auto" mt={5}><Table size="sm"><Thead><Tr><Th>Rule</Th><Th>Delay (min)</Th><Th>Recovery (min)</Th><Th>Repeat (min, 0 off)</Th><Th>Email</Th><Th>SMS</Th><Th>Recovery</Th></Tr></Thead>
        <Tbody>{draft.rules.map((rule, index) => {
          const label = alertTypes.find(([type]) => type === rule.type)?.[1] ?? rule.type;
          const patch = (values: Partial<typeof rule>) => change({ rules: draft.rules.map((item, position) => position === index ? { ...item, ...values } : item) });
          return <Tr key={rule.type}><Td><Checkbox aria-label={`${label} enabled`} isChecked={rule.enabled} isDisabled={disabled} onChange={(event) => patch({ enabled: event.target.checked })}>{label}</Checkbox></Td>
            {(['delaySeconds', 'recoveryDelaySeconds', 'repeatSeconds'] as const).map((field) => <Td key={field}><Input type="number" min={0} max={10080} step={1} minW="90px"
              aria-label={`${label} ${field}`} value={Number.isNaN(rule[field]) ? '' : rule[field] / 60} isDisabled={disabled}
              onChange={(event) => patch({ [field]: event.target.value === '' ? Number.NaN : Number(event.target.value) * 60 })} /></Td>)}
            {(['email', 'sms', 'recovery'] as const).map((field) => <Td key={field}><Checkbox aria-label={`${label} ${field}`} isChecked={rule[field]}
              isDisabled={disabled} onChange={(event) => patch({ [field]: event.target.checked })} /></Td>)}</Tr>;
        })}</Tbody></Table></Box>
      <Heading size="sm" mt={6} mb={3}>Quiet hours</Heading>
      <Checkbox aria-label="Enable quiet hours" isChecked={draft.quietHours.enabled} isDisabled={disabled}
        onChange={(event) => change({ quietHours: { ...draft.quietHours, enabled: event.target.checked } })}>Enabled</Checkbox>
      <SimpleGrid columns={[1, 3]} spacing={4} mt={3}>
        {(['timezone', 'start', 'end'] as const).map((field) => <FormControl key={field}><FormLabel htmlFor={`alert-${field}`}>{field === 'timezone' ? 'Time zone' : field === 'start' ? 'From' : 'Until'}</FormLabel>
          <Input id={`alert-${field}`} type={field === 'timezone' ? 'text' : 'time'} value={draft.quietHours[field]} isDisabled={disabled}
            onChange={(event) => change({ quietHours: { ...draft.quietHours, [field]: event.target.value } })} /></FormControl>)}
      </SimpleGrid>
      <HStack flexWrap="wrap" mt={3}>{days.map((day, index) => <Checkbox key={day} aria-label={`Quiet ${day}`} isDisabled={disabled}
        isChecked={draft.quietHours.days.includes(index + 1)} onChange={(event) => change({ quietHours: { ...draft.quietHours,
          days: event.target.checked ? [...draft.quietHours.days, index + 1].sort() : draft.quietHours.days.filter((value) => value !== index + 1) } })}>{day}</Checkbox>)}</HStack>
      <Text fontSize="sm" mt={2}>Quiet hours delay delivery, not fault detection.</Text>
      <FormControl mt={5} maxW="400px"><FormLabel htmlFor="alert-mute">Mute until (your local time)</FormLabel><Input id="alert-mute" type="datetime-local" value={localDateTime(draft.muteUntil)}
        isDisabled={disabled} onChange={(event) => change({ muteUntil: event.target.value ? new Date(event.target.value).getTime() / 1000 : 0 })} /></FormControl>
      {error && <Alert status="error" mt={3}><AlertIcon />{error}</Alert>}
      {saved && <Alert status="success" mt={3}><AlertIcon />Alerts saved.</Alert>}
      <Heading size="sm" mt={6} mb={3}>Delivery history</Heading>
      {!query.data?.events.length ? <Text>No deliveries yet.</Text> : <Box overflowX="auto"><Table size="sm"><Thead><Tr>
        {['Time', 'Device', 'Alert', 'Channel', 'Recipient', 'Status'].map((label) => <Th key={label}>{label}</Th>)}
      </Tr></Thead><Tbody>{query.data.events.map((event, index) => <Tr key={`${event.id}:${event.time}:${event.status}:${index}`}><Td>{new Date(event.time * 1000).toLocaleString()}</Td><Td>{event.name || event.device || '—'}</Td>
        <Td>{alertTypes.find(([type]) => type === event.type)?.[1] ?? event.type}{event.recovery ? ' cleared' : ''}</Td><Td>{event.channel}</Td><Td>{event.recipient}</Td>
        <Td>{event.status === 'accepted' ? 'Provider accepted' : event.status}</Td></Tr>)}</Tbody></Table></Box>}
    </Box></CardBody>
  </Card>;
};
// A venue change must discard unsaved entries and mutation/error state immediately.
const VenueAlerts = ({ id, kind = 'venue' }: { id: string; kind?: AlertScopeKind }) => <VenueAlertsForm key={`${kind}:${id}`} id={id} kind={kind} />;
export default VenueAlerts;
