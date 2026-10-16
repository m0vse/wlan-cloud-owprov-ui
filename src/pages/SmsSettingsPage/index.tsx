import React from 'react';
import { Alert, AlertIcon, Box, Button, FormControl, FormLabel, Heading, HStack, Input, Select,
  SimpleGrid, Spacer, Spinner, Text } from '@chakra-ui/react';
import Card from 'components/Card';
import CardHeader from 'components/Card/CardHeader';
import CardBody from 'components/Card/CardBody';
import SaveButton from 'components/Buttons/SaveButton';
import ToggleEditButton from 'components/Buttons/ToggleEditButton';
import { useAuth } from 'contexts/AuthProvider';
import { validPhone } from 'helpers/venueAlerts';
import { SmsSettings, SmsSettingsUpdate, useSmsSettings, useTestSmsSettings, useUpdateSmsSettings } from 'hooks/Network/SmsSettings';

const initial = (settings: SmsSettings): SmsSettingsUpdate => ({ enabled: settings.enabled, accountSid: settings.accountSid,
  fromNumber: settings.fromNumber, tokenAction: 'retain' });
const SmsSettingsForm = () => {
  const query = useSmsSettings();
  const update = useUpdateSmsSettings();
  const test = useTestSmsSettings();
  const [draft, setDraft] = React.useState<SmsSettingsUpdate>();
  const [editing, setEditing] = React.useState(false);
  const [recipient, setRecipient] = React.useState('');
  const [error, setError] = React.useState('');
  const [saved, setSaved] = React.useState(false);
  React.useEffect(() => { if (query.data && !editing) setDraft(initial(query.data)); }, [query.data, editing]);
  if (query.isError) return <Alert status="error"><AlertIcon />SMS settings could not be loaded.</Alert>;
  if (query.isLoading || !draft || !query.data) return <Spinner aria-label="Loading SMS settings" />;
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial(query.data));
  const disabled = !editing || update.isLoading || test.isLoading;
  const change = (patch: Partial<SmsSettingsUpdate>) => { setDraft({ ...draft, ...patch }); setError(''); setSaved(false); test.reset(); };
  const save = async () => {
    if (disabled || !dirty) return;
    if ((draft.enabled || draft.accountSid) && !/^AC[0-9a-fA-F]{32}$/.test(draft.accountSid)) { setError('Enter a valid Twilio account SID.'); return; }
    if ((draft.enabled || draft.fromNumber) && !validPhone(draft.fromNumber)) { setError('Enter the Twilio number with its country code.'); return; }
    if (draft.tokenAction === 'set' && (!draft.token || /\s/.test(draft.token))) { setError('Enter a valid auth token.'); return; }
    if (draft.enabled && (draft.tokenAction === 'clear' || (draft.tokenAction === 'retain' && !query.data?.tokenSet))) { setError('Set an auth token before enabling SMS.'); return; }
    const payload = { enabled: draft.enabled, accountSid: draft.accountSid, fromNumber: draft.fromNumber, tokenAction: draft.tokenAction,
      ...(draft.tokenAction === 'set' ? { token: draft.token } : {}) };
    try { const response = await update.mutateAsync(payload); setDraft(initial(response)); setEditing(false); setSaved(true); }
    catch { setError('SMS settings could not be saved.'); }
    finally { // React Query otherwise retains mutation variables, including replacement credentials.
      update.reset();
    }
  };
  return <Card><CardHeader><Heading size="md" my="auto">SMS</Heading><Spacer /><HStack spacing={2}>
    <SaveButton onClick={save} hidden={!editing} isLoading={update.isLoading} isDisabled={disabled || !dirty} />
    <ToggleEditButton isEditing={editing} isDirty={dirty} isDisabled={update.isLoading || test.isLoading}
      toggleEdit={() => { setDraft(initial(query.data!)); setEditing(!editing); setError(''); setSaved(false); update.reset(); test.reset(); }} />
  </HStack></CardHeader><CardBody><Box w="100%">
    <SimpleGrid columns={[1, 2]} spacing={4}>
      <FormControl><FormLabel htmlFor="sms-enabled">SMS delivery</FormLabel><Select id="sms-enabled" value={draft.enabled ? 'enabled' : 'disabled'} isDisabled={disabled}
        onChange={(event) => change({ enabled: event.target.value === 'enabled' })}><option value="disabled">Disabled</option><option value="enabled">Enabled</option></Select></FormControl>
      <FormControl><FormLabel htmlFor="sms-account">Twilio account SID</FormLabel><Input id="sms-account" value={draft.accountSid} isDisabled={disabled}
        onChange={(event) => change({ accountSid: event.target.value })} autoComplete="off" /></FormControl>
      <FormControl><FormLabel htmlFor="sms-from">From number</FormLabel><Input id="sms-from" value={draft.fromNumber} isDisabled={disabled}
        onChange={(event) => change({ fromNumber: event.target.value })} /></FormControl>
      <FormControl><FormLabel htmlFor="sms-token-action">Auth token</FormLabel><Select id="sms-token-action" value={draft.tokenAction} isDisabled={disabled}
        onChange={(event) => change({ tokenAction: event.target.value as SmsSettingsUpdate['tokenAction'], token: undefined })}>
        <option value="retain">Leave token unchanged</option><option value="set">Replace token</option><option value="clear">Clear stored token</option></Select></FormControl>
      {draft.tokenAction === 'set' && <FormControl><FormLabel htmlFor="sms-token">New auth token</FormLabel><Input id="sms-token" type="password" value={draft.token ?? ''} isDisabled={disabled}
        onChange={(event) => change({ token: event.target.value })} autoComplete="new-password" /></FormControl>}
    </SimpleGrid>
    <Text mt={3}>{query.data.tokenSet ? 'An auth token is stored. It is never displayed.' : 'No auth token is stored.'}</Text>
    {error && <Alert status="error" mt={3}><AlertIcon />{error}</Alert>}
    {saved && <Alert status="success" mt={3}><AlertIcon />SMS settings saved.</Alert>}
    <Box mt={6}><FormControl><FormLabel htmlFor="sms-test-recipient">Test recipient</FormLabel><Input id="sms-test-recipient" value={recipient} isDisabled={test.isLoading}
      onChange={(event) => { setRecipient(event.target.value); test.reset(); }} /></FormControl>
      <Button mt={3} isLoading={test.isLoading} isDisabled={dirty || update.isLoading || test.isLoading || !query.data.enabled || !query.data.configured || !validPhone(recipient.trim())}
        onClick={() => test.mutate(recipient.trim())}>Send test SMS</Button>
      {dirty && <Text mt={2}>Save changes before testing.</Text>}
      {test.isSuccess && <Alert status="success" mt={3}><AlertIcon />Twilio accepted the test SMS.</Alert>}
      {test.isError && <Alert status="error" mt={3}><AlertIcon />Test SMS failed. Check your saved Twilio settings.</Alert>}
    </Box>
  </Box></CardBody></Card>;
};
const SmsSettingsPage = () => {
  const { user } = useAuth();
  return user?.userRole === 'root' ? <SmsSettingsForm /> : <Alert status="error"><AlertIcon />Administrator access is required.</Alert>;
};
export default SmsSettingsPage;
