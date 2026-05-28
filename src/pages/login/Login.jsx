import '@fontsource/poppins/400.css';
import '@fontsource/poppins/500.css';
import '@fontsource/poppins/700.css';
import { useEffect, useState } from 'react';
import { FiEye, FiEyeOff } from "react-icons/fi";
import { MdOutlineEmail } from "react-icons/md";
import { TbLockPassword } from "react-icons/tb";
import { useNavigate } from 'react-router-dom';
import { exchangeSsoCallback, fetchSsoAuthorizeUrl, loginWithPassword } from '../../api/authService';
import arrowLogo from "../../assets/login/arrow_logo.png";
import loginLeftImage from "../../assets/login/login-bg.jpeg";
import './Login.css';

const USE_LOGIN_API = false;

const LOGIN_CREDENTIALS_BY_ROLE = {
  recruiter: [
    { email: 'recruiter@method-hub.com', password: 'recruiter' },
    { email: 'recruiter@@method-hub.com', password: 'recruiter' }
  ],
  accountManager: [
    { email: 'accmanager@method-hub.com', password: 'accmanager' }
  ]
};

const STORED_ROLE_BY_LOGIN_ROLE = {
  recruiter: 'recruiter',
  accountManager: 'accountmanager',
};

const ROLE_ALIAS_MAP = {
  recruiter: 'recruiter',
  accountmanager: 'accountmanager',
  account_manager: 'accountmanager',
  'account manager': 'accountmanager',
  manager: 'accountmanager',
  management: 'accountmanager',
};

const normalizeRoleValue = (value) => {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return '';
  const compact = text.replace(/[\s_-]+/g, '');
  return ROLE_ALIAS_MAP[text] || ROLE_ALIAS_MAP[compact] || compact;
};

const extractRoleValue = (response = {}) => {
  if (response?.role) {
    return normalizeRoleValue(response.role);
  }

  if (Array.isArray(response?.roles)) {
    const firstRole = response.roles.find(Boolean);
    if (typeof firstRole === 'string') {
      return normalizeRoleValue(firstRole);
    }
    if (firstRole && typeof firstRole === 'object') {
      return normalizeRoleValue(firstRole.role || firstRole.name || firstRole.authority || '');
    }
  }

  if (Array.isArray(response?.authorities)) {
    const firstAuthority = response.authorities.find(Boolean);
    if (typeof firstAuthority === 'string') {
      return normalizeRoleValue(firstAuthority);
    }
    if (firstAuthority && typeof firstAuthority === 'object') {
      return normalizeRoleValue(firstAuthority.authority || firstAuthority.name || '');
    }
  }

  return '';
};

const getAuthErrorMessage = (err, fallbackMessage) => {
  const status = Number(err?.response?.status || 0);
  const data = err?.response?.data;

  if (typeof data === 'string' && data.trim()) {
    return data.trim();
  }

  const backendMessage = String(
    data?.message || data?.error || data?.details || '',
  ).trim();
  if (backendMessage) {
    return backendMessage;
  }

  if (status === 401) {
    return 'Invalid email or password.';
  }

  if (status >= 500) {
    return 'Login service is unavailable. Start API gateway on http://localhost:8080 and try again.';
  }

  if (!err?.response) {
    return 'Cannot reach login service. Check backend is running on http://localhost:8080.';
  }

  return err?.message || fallbackMessage;
};

const Login = () => {
  const [role, setRole] = useState('recruiter');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [emailError, setEmailError] = useState('');
  const navigate = useNavigate();

  const persistAuthSession = (response = {}, fallbackRole = '') => {
    const emailValue = String(response?.email || email || '').toLowerCase().trim();
    const roleValue = extractRoleValue(response) || STORED_ROLE_BY_LOGIN_ROLE[fallbackRole] || normalizeRoleValue(fallbackRole);

    if (emailValue) {
      localStorage.setItem('userEmail', emailValue);
    }
    if (roleValue) {
      localStorage.setItem('userRole', roleValue);
    }
    if (response?.name) {
      localStorage.setItem('userName', String(response.name).trim());
    }
    if (response?.token) {
      localStorage.setItem('token', response.token);
      localStorage.setItem('authToken', response.token);
    }
  };

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const code = String(searchParams.get('code') || '').trim();
    const state = String(searchParams.get('state') || '').trim();
    const oauthError = String(searchParams.get('error') || '').trim();

    if (oauthError) {
      Promise.resolve().then(() => {
        setError(searchParams.get('error_description') || oauthError);
      });
      return;
    }

    if (!code || !state) {
      return;
    }

    let active = true;

    const completeSso = async () => {
      try {
        setLoading(true);
        setError('');
        const response = await exchangeSsoCallback({ code, state });
        if (!active) return;

        persistAuthSession(response);

        const cleanUrl = `${window.location.origin}/login`;
        window.history.replaceState({}, document.title, cleanUrl);
        navigate('/dashboard', { replace: true });
      } catch (err) {
        if (!active) return;
        setError(err?.response?.data?.error || err?.message || 'SSO login failed');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    completeSso();

    return () => {
      active = false;
    };
  }, [navigate]);

  const validateEmail = async () => {
    if (!email) return;
    setEmailError('Validating email...');
    // Accept known local-login emails even if they don't match strict email regex.
    try {
      await new Promise((resolve, reject) => {
        setTimeout(() => {
          const allAllowedEmails = Object.values(LOGIN_CREDENTIALS_BY_ROLE)
            .flat()
            .map((item) => item.email.toLowerCase());
          const currentEmail = email.toLowerCase().trim();
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (allAllowedEmails.includes(currentEmail) || emailRegex.test(currentEmail)) {
            resolve();
          } else {
            reject(new Error('Invalid email format'));
          }
        }, 500);
      });
      setEmailError('');
    } catch (err) {
      setEmailError(err.message);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const normalizedEmail = email.toLowerCase().trim();
      const roleCredentials = LOGIN_CREDENTIALS_BY_ROLE[role] || [];

      if (!USE_LOGIN_API) {
        const localMatch = roleCredentials.some(
          (item) => item.email.toLowerCase() === normalizedEmail && item.password === password,
        );

        if (!localMatch) {
          throw new Error('Invalid email or password.');
        }

        persistAuthSession(
          {
            email: normalizedEmail,
            role: STORED_ROLE_BY_LOGIN_ROLE[role],
            token: `local-${role}-token`,
            name: role === 'accountManager' ? 'Account Manager' : 'Recruiter',
          },
          role,
        );
      } else {
        const response = await loginWithPassword({
          email: normalizedEmail,
          password,
        });
        persistAuthSession(response, role);
      }

      navigate('/dashboard');
    } catch (err) {
      if (USE_LOGIN_API) {
        setError(getAuthErrorMessage(err, 'Login failed'));
      } else {
        setError(err?.message || 'Login failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSsoLogin = async () => {
    setError('');
    try {
      const url = await fetchSsoAuthorizeUrl();
      if (!url) {
        throw new Error('SSO authorize URL is not available');
      }
      window.location.href = url;
    } catch (err) {
      setError(getAuthErrorMessage(err, 'Unable to start SSO login'));
    }
  };

  return (
    <div className="login-container">
      <div className="login-left">
        <img src={loginLeftImage} alt="Team" className="login-left-image" />
        <h1 className="login-left-title">Welcome to Arrows</h1>
      </div>
      <div className="login-right">
        <div className="logo-wrapper">
        <img src={arrowLogo} alt="Arrow Logo" className="arrow-logo" />
        </div>
        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group email-group">
            <label htmlFor="email">Email Address</label>
            <div className="input-wrapper">
              <MdOutlineEmail className="input-icon" size="20" />
              <input
                type="text"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={validateEmail}
                placeholder="Enter your email address"
                required
              />
            </div>
          </div>
          {emailError && <p className="error-message">{emailError}</p>}
          <div className="form-group password-group">
            <label htmlFor="password">Password</label>
            <div className="input-wrapper">
              <TbLockPassword className="input-icon" />
              <input
                type={showPassword ? "text" : "password"}
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
              />
              <button
                type="button"
                className="toggle-password"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((prev) => !prev)}
              >
                {showPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
              </button>
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="role">Login As</label>
            <select
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              aria-label="Select login role"
            >
              <option value="recruiter">Recruiter</option>
              <option value="accountManager">Account Manager</option>
            </select>
          </div>
          <div className="form-options">
            <label className="remember-me">
              <input type="checkbox" /> Remember me
            </label>
            <a href="#" className="forgot-password">Forgot password?</a>
          </div>
          {error && <p className="error-message">{error}</p>}
          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? 'Signing In...' : 'Sign In'}
          </button>
          <button type="button" className="login-btn" onClick={handleSsoLogin} disabled={loading} style={{ display: 'none' }}>
            Sign In With SSO
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
