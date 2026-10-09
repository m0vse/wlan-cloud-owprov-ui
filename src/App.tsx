import React, { Suspense, useEffect, useState } from 'react';
import { Spinner } from '@chakra-ui/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { HashRouter } from 'react-router-dom';
import { AuthProvider } from 'contexts/AuthProvider';
import { FavoritesProvider } from 'contexts/FavoritesProvider';
import { FirmwareSocketProvider } from 'contexts/FirmwareSocketProvider';
import { ProvisioningSocketProvider } from 'contexts/ProvisioningSocketProvider';
import { SecuritySocketProvider } from 'contexts/SecuritySocketProvider';
import Router from 'router';
import { receiveControllerSession } from 'helpers/controllerSession';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 0,
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => {
  const [sessionReady, setSessionReady] = useState(false);
  useEffect(() => { receiveControllerSession().finally(() => setSessionReady(true)); }, []);
  const storageToken = localStorage.getItem('access_token') ?? sessionStorage.getItem('access_token');

  if (!sessionReady) return <Spinner />;

  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <Suspense fallback={<Spinner />}>
          <AuthProvider token={storageToken !== null ? storageToken : undefined}>
            <FavoritesProvider>
              <SecuritySocketProvider>
                <FirmwareSocketProvider>
                  <ProvisioningSocketProvider>
                    <Router />
                  </ProvisioningSocketProvider>
                </FirmwareSocketProvider>
              </SecuritySocketProvider>
            </FavoritesProvider>
          </AuthProvider>
        </Suspense>
      </HashRouter>
    </QueryClientProvider>
  );
};

export default App;
