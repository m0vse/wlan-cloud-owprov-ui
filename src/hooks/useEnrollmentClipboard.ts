import { useEffect } from 'react';
import { useClipboard } from '@chakra-ui/react';

export const useEnrollmentClipboard = (key: string | undefined) => {
  const { setValue, onCopy, hasCopied } = useClipboard('');
  // The pinned Chakra hook only uses its argument as the initial value.
  useEffect(() => {
    setValue(key || '');
  }, [key, setValue]);
  return { onCopy, hasCopied };
};
