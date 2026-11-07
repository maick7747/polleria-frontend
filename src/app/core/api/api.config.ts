import { environment } from '../../../environments/environment';

export const API_BASE_URL = environment.apiUrl.replace(/\/+$/, '');

export const USE_API = environment.useApi;

export const SESSION_STORAGE_KEY = 'fratelli.session.v1';
