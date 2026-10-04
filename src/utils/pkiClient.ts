import { AxiosRequestConfig } from 'axios';
import { axiosProv } from './axiosInstances';

// Reuse the existing authenticated instance; only PKI uses the portal origin.
// No token is copied into storage, query parameters or a new credential flow.
const configuration: AxiosRequestConfig = { baseURL: `${window.location.origin}/api/v1` };
export const axiosPki = {
  get: <T,>(path: string) => axiosProv.get<T>(path, configuration),
  post: <T = unknown,>(path: string, body: unknown) => axiosProv.post<T>(path, body, configuration),
};
