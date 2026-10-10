import React from 'react';
import { Box, Text } from '@chakra-ui/react';
import ToggleField from './ToggleField';
import useFastField from 'hooks/useFastField';
import { mloConfigurationError } from 'helpers/mloConfiguration';

const MloSettings = ({ namePrefix, isDisabled }: { namePrefix: string; isDisabled: boolean }) => {
  const { value } = useFastField<Record<string, unknown>>({ name: namePrefix });
  const interfaceName = namePrefix.replace(/\.ssids\[\d+\]$/, '');
  const { value: iface } = useFastField<Record<string, unknown>>({ name: interfaceName });
  const error = mloConfigurationError(value, interfaceName !== namePrefix ? iface : undefined);
  return <Box my={3}>
    <ToggleField name={`${namePrefix}.mlo`} label="Multi-Link Operation (MLO)"
      isDisabled={isDisabled} falseIsUndefined defaultValue={false} />
    <Text fontSize="sm" color={error ? 'red.500' : undefined} mt={1}>
      {error || 'Initial qualification: Cambium X7-35X (Miami), 5 GHz + 6 GHz, EHT radios and MLO-capable firmware. Individual radio settings remain unchanged; other AP models reject enabled MLO.'}
    </Text>
  </Box>;
};

export default React.memo(MloSettings);
