import * as React from 'react';
import { Box, Heading, Icon, Text, Tooltip, useColorModeValue, useDisclosure } from '@chakra-ui/react';
import { Wrapper } from '@googlemaps/react-wrapper';
import { Globe } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { GoogleMap } from 'components/GoogleMap';
import { GoogleMapMarker } from 'components/GoogleMap/Marker';
import { Modal } from 'components/Modals/Modal';
import { useGetLocation, useGetVenueLocation } from 'hooks/Network/Locations';
import { useGetSystemSecret } from 'hooks/Network/Secrets';
import { useAuth } from 'contexts/AuthProvider';

type Props = {
  locationId: string;
  venueId?: string;
};

const RootLocationDisplayButton = ({ locationId }: Props) => {
  const { t } = useTranslation();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const getGoogleApiKey = useGetSystemSecret({ secret: 'google.maps.apikey' });
  const iconColor = useColorModeValue('blue.500', 'blue.200');
  const getLocation = useGetLocation({ id: locationId, enabled: locationId !== '' });

  const parsedLocation: google.maps.LatLngLiteral | undefined = React.useMemo(() => {
    if (!getLocation.data?.geoCode || getLocation.data.geoCode.length === 0) return undefined;
    try {
      const obj: { lat: number; lng: number } = JSON.parse(getLocation.data.geoCode);

      return {
        lat: obj.lat,
        lng: obj.lng,
      };
    } catch (e) {
      return undefined;
    }
  }, [getLocation.data?.geoCode]);

  if (!getLocation.data) {
    return null;
  }

  return (
    <>
      <Tooltip label={`${t('common.view')} ${t('locations.one')}`}>
        <Icon as={Globe} mt={1} boxSize={8} onClick={onOpen} color={iconColor} cursor="pointer" />
      </Tooltip>
      <Modal isOpen={isOpen} onClose={onClose} title={getLocation.data?.name ?? t('locations.one')}>
        <Box w="100%" h="100%">
          <Heading size="sm">
            {[
              ...getLocation.data.addressLines.filter((address) => address.length > 0),
              getLocation.data.city,
              getLocation.data.state,
              getLocation.data.postal,
              getLocation.data.country,
            ].join(', ')}
          </Heading>
          {parsedLocation && getGoogleApiKey.data ? (
            <Box h="500px" my={4}>
              <Wrapper apiKey={getGoogleApiKey.data.value}>
                <GoogleMap center={parsedLocation} style={{ flexGrow: '1', height: '100%' }} zoom={10}>
                  <GoogleMapMarker position={parsedLocation} />
                </GoogleMap>
              </Wrapper>
            </Box>
          ) : null}
        </Box>
      </Modal>
    </>
  );
};

const ScopedLocationDisplay = ({ locationId, venueId }: Props) => {
  const location = useGetVenueLocation({ id: locationId, venueId });
  if (!locationId) return <Text>No location assigned.</Text>;
  if (location.isError || !location.data) return <Text>Location reference: {locationId}. Details are not available.</Text>;
  return <Box><Text>{location.data.name}</Text><Text fontSize="sm">{[
    ...(location.data.addressLines ?? []), location.data.city, location.data.state, location.data.postal, location.data.country,
  ].filter(Boolean).join(', ')}</Text></Box>;
};
const LocationDisplayButton = ({ locationId, venueId }: Props) => {
  const { user } = useAuth();
  return user?.userRole === 'root' ? <RootLocationDisplayButton locationId={locationId} /> : <ScopedLocationDisplay locationId={locationId} venueId={venueId} />;
};
export default LocationDisplayButton;
