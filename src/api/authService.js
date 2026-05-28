import API from './axiosConfig';

const normalizeAuthPayload = (payload) => {
  const data = payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object'
    ? payload.data
    : payload;

  return data && typeof data === 'object' ? data : {};
};

export const loginWithPassword = async ({ email, password }) => {
  const response = await API.post('/login', { email, password }, {
    skipAuth: true,
    skipAuthRedirect: true,
  });
  return normalizeAuthPayload(response?.data || {});
};

export const fetchSsoAuthorizeUrl = async () => {
  const response = await API.get('/sso/authorize-url', {
    skipAuth: true,
    skipAuthRedirect: true,
  });
  return String(response?.data?.authorizationUrl || '').trim();
};

export const exchangeSsoCallback = async ({ code, state }) => {
  const response = await API.get('/sso/callback', {
    params: { code, state },
    skipAuth: true,
    skipAuthRedirect: true,
  });
  return normalizeAuthPayload(response?.data || {});
};
