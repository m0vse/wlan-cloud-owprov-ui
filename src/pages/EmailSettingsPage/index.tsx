import React from 'react';
import { Alert, AlertIcon, Box, Button, FormControl, FormErrorMessage, FormLabel, Heading,
  Input, Select, SimpleGrid, Spinner, Text } from '@chakra-ui/react';
import { Form, Formik } from 'formik';
import * as Yup from 'yup';
import { useAuth } from 'contexts/AuthProvider';
import { EmailSettings, EmailSettingsUpdate, useEmailSettings, useUpdateEmailSettings, useTestEmailSettings } from 'hooks/Network/EmailSettings';

type Values = {
  enabledChoice: string; host: string; port: string; tlsMode: string; sender: string;
  username: string; authMethod: string; passwordAction: 'retain' | 'set' | 'clear'; password: string;
};
const initialValues = (settings: EmailSettings): Values => ({
  enabledChoice: settings.configured ? (settings.enabled ? 'enabled' : 'disabled') : '',
  host: settings.configured ? settings.host : '', port: settings.configured && settings.port !== null ? String(settings.port) : '',
  tlsMode: settings.configured ? settings.tlsMode : '', sender: settings.configured ? settings.sender : '',
  username: settings.configured ? settings.username : '', authMethod: settings.configured ? settings.authMethod : '',
  passwordAction: 'retain', password: '',
});
const schema = (passwordSet: boolean) => Yup.object({
  enabledChoice: Yup.string().oneOf(['enabled', 'disabled'], 'Choose enabled or disabled.').required('Choose enabled or disabled.'),
  host: Yup.string().required('Enter the SMTP host.').matches(/^[^\s\/@]+$/, 'Enter a host name or IP address.'),
  port: Yup.string().required('Enter the SMTP port.').test('port', 'Use a whole-number port from 1 to 65535.',
    (value) => !!value && /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 65535),
  tlsMode: Yup.string().oneOf(['none', 'starttls', 'implicit'], 'Choose a TLS mode.').required('Choose a TLS mode.'),
  sender: Yup.string().email('Enter a valid sender email address.').required('Enter the sender email address.'),
  authMethod: Yup.string().oneOf(['none', 'login', 'plain', 'cram-md5'], 'Choose an authentication method.').required('Choose an authentication method.'),
  username: Yup.string().test('username', 'Enter the SMTP username.', function (value) {
    return !(this.parent.enabledChoice === 'enabled' && this.parent.authMethod !== 'none') || !!value;
  }).matches(/^[^\r\n]*$/, 'Use a username without line breaks.'),
  passwordAction: Yup.string().oneOf(['retain', 'set', 'clear']).test('clear', 'Disable SMTP or authentication before clearing the password.',
    function (value) { return value !== 'clear' || this.parent.enabledChoice !== 'enabled' || this.parent.authMethod === 'none'; }),
  password: Yup.string().test('password', 'Enter a new password or retain the stored password.', function (value) {
    if (this.parent.passwordAction === 'set') return !!value && !/[\r\n]/.test(value);
    return this.parent.enabledChoice !== 'enabled' || this.parent.authMethod === 'none' ||
      (this.parent.passwordAction === 'retain' && passwordSet);
  }),
});

const EmailSettingsForm = () => {
  const settings = useEmailSettings();
  const update = useUpdateEmailSettings();
  const test = useTestEmailSettings();
  const [recipient, setRecipient] = React.useState('');
  const [saved, setSaved] = React.useState(false);
  if (settings.isLoading) return <Spinner aria-label="Loading email settings" />;
  if (settings.isError || !settings.data) return <Alert status="error"><AlertIcon />Email settings could not be loaded.</Alert>;
  return (
    <Box borderWidth="1px" borderRadius="md" p={6}>
      <Heading size="md" mb={4}>Email</Heading>
      <Text mb={4}>Configure the mail server and sender used for system email.</Text>
      <Formik initialValues={initialValues(settings.data)} enableReinitialize validationSchema={schema(settings.data.passwordSet)}
        onSubmit={async (values, { resetForm }) => {
          setSaved(false); test.reset();
          const payload: EmailSettingsUpdate = {
            enabled: values.enabledChoice === 'enabled', host: values.host, port: Number(values.port),
            tlsMode: values.tlsMode as EmailSettingsUpdate['tlsMode'], sender: values.sender,
            username: values.username, authMethod: values.authMethod as EmailSettingsUpdate['authMethod'],
            passwordAction: values.passwordAction,
            ...(values.passwordAction === 'set' ? { password: values.password } : {}),
          };
          try {
            const response = await update.mutateAsync(payload);
            resetForm({ values: initialValues(response) });
            setSaved(true);
          } catch { /* A generic message below avoids echoing request credentials. */ }
        }}>
        {({ values, errors, touched, handleChange, handleBlur, isSubmitting, dirty }) => {
          const field = (name: keyof Values, label: string, input: React.ReactElement) => (
            <FormControl isInvalid={!!touched[name] && !!errors[name]}>
              <FormLabel htmlFor={`smtp-${name}`}>{label}</FormLabel>{input}
              <FormErrorMessage>{errors[name]}</FormErrorMessage>
            </FormControl>
          );
          const props = (name: keyof Values) => ({ id: `smtp-${name}`, name, 'aria-label': name, value: values[name],
            onChange: handleChange, onBlur: handleBlur, isDisabled: isSubmitting });
          return (
            <Form autoComplete="off">
              <SimpleGrid columns={[1, 2]} spacing={4}>
                {field('enabledChoice', 'Email delivery', <Select {...props('enabledChoice')}>
                  <option value="">Choose enabled or disabled</option><option value="enabled">Enabled</option><option value="disabled">Disabled</option>
                </Select>)}
                {field('host', 'SMTP host', <Input {...props('host')} />)}
                {field('port', 'SMTP port', <Input {...props('port')} inputMode="numeric" />)}
                {field('tlsMode', 'TLS mode', <Select {...props('tlsMode')}>
                  <option value="">Choose TLS mode</option><option value="none">None</option><option value="starttls">STARTTLS</option><option value="implicit">Implicit TLS</option>
                </Select>)}
                {field('sender', 'Sender email address', <Input {...props('sender')} type="email" />)}
                {field('authMethod', 'Authentication', <Select {...props('authMethod')}>
                  <option value="">Choose authentication</option><option value="none">No authentication</option>
                  <option value="login">LOGIN</option><option value="plain">PLAIN</option><option value="cram-md5">CRAM-MD5</option>
                </Select>)}
                {field('username', 'SMTP username', <Input {...props('username')} autoComplete="off" />)}
                {field('passwordAction', 'SMTP password', <Select {...props('passwordAction')}>
                  <option value="retain">Leave password unchanged</option><option value="set">Replace password</option><option value="clear">Clear stored password</option>
                </Select>)}
                {values.passwordAction === 'set' && field('password', 'New SMTP password', <Input {...props('password')} type="password" autoComplete="new-password" />)}
              </SimpleGrid>
              <Text mt={3}>{settings.data?.passwordSet ? 'A password is stored. It is never displayed.' : 'No password is stored.'}</Text>
              {touched.password && errors.password && values.passwordAction !== 'set' && <Alert status="error" mt={3}><AlertIcon />{errors.password}</Alert>}
              {update.isError && <Alert status="error" mt={3}><AlertIcon />Email settings could not be saved. Check the entries and try again.</Alert>}
              {saved && <Alert status="success" mt={3}><AlertIcon />Email settings saved.</Alert>}
              <Button type="submit" colorScheme="blue" mt={4} isLoading={isSubmitting} isDisabled={!dirty || isSubmitting}>Save email settings</Button>
              <Box mt={6}>
                <FormControl>
                  <FormLabel htmlFor="smtp-test-recipient">Test recipient</FormLabel>
                  <Input id="smtp-test-recipient" aria-label="Test recipient" type="email" value={recipient}
                    isDisabled={test.isLoading} onChange={(event) => { setRecipient(event.target.value); test.reset(); }} />
                </FormControl>
                <Button type="button" mt={3} isLoading={test.isLoading}
                  isDisabled={dirty || isSubmitting || test.isLoading || !settings.data?.enabled || !settings.data?.configured ||
                    !Yup.string().email().required().isValidSync(recipient.trim())}
                  onClick={() => test.mutate(recipient.trim())}>Send test email</Button>
                {dirty && <Text mt={2}>Save changes before testing.</Text>}
                {test.isSuccess && <Alert status="success" mt={3}><AlertIcon />SMTP accepted the test email. Check your inbox.</Alert>}
                {test.isError && <Alert status="error" mt={3}><AlertIcon />Test email failed. Check your saved SMTP settings.</Alert>}
              </Box>
            </Form>
          );
        }}
      </Formik>
    </Box>
  );
};

const EmailSettingsPage = () => {
  const { user } = useAuth();
  return user?.userRole === 'root' ? <EmailSettingsForm /> : <Alert status="error"><AlertIcon />Administrator access is required.</Alert>;
};
export default EmailSettingsPage;
