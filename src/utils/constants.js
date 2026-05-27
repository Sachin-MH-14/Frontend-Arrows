// API endpoints
export const API_ENDPOINTS = {
  JOB_OPENINGS: '/job-openings',
  CANDIDATES: '/candidates',
  INTERVIEWS: '/interviews',
  HR_STAFF: '/hr-staff',
  APPLICATIONS: '/applications',
};

// Candidate status options
export const CANDIDATE_STATUS = {
  NEW: 'New',
  SHORTLISTED: 'Shortlisted',
  INTERVIEW: 'Interview',
  REJECTED: 'Rejected',
  HIRED: 'Hired',
  ON_HOLD: 'On Hold',
};

// Job status options
export const JOB_STATUS = {
  OPEN: 'Open',
  CLOSED: 'Closed',
  DRAFT: 'Draft',
  ARCHIVED: 'Archived',
};

// Pagination defaults
export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 50,
  LARGE_PAGE_SIZE: 100,
};

// Cache duration in milliseconds
export const CACHE_DURATION = {
  SHORT: 5 * 60 * 1000,      // 5 minutes
  MEDIUM: 15 * 60 * 1000,    // 15 minutes
  LONG: 60 * 60 * 1000,      // 1 hour
};

// User roles and dashboard UUID mapping
export const USER_ROLES = {
  RECRUITER: 'recruiter',
  ACCOUNT_MANAGER: 'account_manager',
};

export const DASHBOARD_UUID_MAP = {
  recruiter: '62ae3ed4-ca6c-49bf-99ed-d02afa453d9f',
  account_manager: '2601d9f3-cf7d-4a79-a8f5-1d090874dbae',
  accountmanager: '2601d9f3-cf7d-4a79-a8f5-1d090874dbae',
  'account manager': '2601d9f3-cf7d-4a79-a8f5-1d090874dbae',
  default: '62ae3ed4-ca6c-49bf-99ed-d02afa453d9f',
};
