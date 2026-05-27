import API from './axiosConfig';

const unwrapList = (response) => {
  const payload = response?.data;

  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  if (Array.isArray(payload?.items)) {
    return payload.items;
  }

  if (Array.isArray(payload?.content)) {
    return payload.content;
  }

  if (Array.isArray(payload?.records)) {
    return payload.records;
  }

  return [];
};

const normalizeText = (value, fallback = '-') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

export const fetchJobs = async () =>
  unwrapList(
    await API.get('/api/jobs', {
      skipAuth: true,
      skipAuthRedirect: true,
    })
  );

const isUuid = (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || '').trim(),
  );

const toIsoInstant = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
};

const toIsoLocalDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const toIntOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const toNumberOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value));
  return Number.isFinite(parsed) ? parsed : null;
};

export const toJobRequest = (row = {}) => {
  const clientId = String(row.clientId || '').trim();

  return {
    clientId: isUuid(clientId) ? clientId : null,
    openingJobId: String(row.openingJobId || row.jobPositionId || '').trim() || null,
    externalJobRef: String(row.openingJobId || row.jobPositionId || '').trim() || null,
    jobTitle: String(row.postingTitle || row.positionName || row.jobTitle || '').trim(),
    jobDescription: String(row.jobDescription || row.additionalSkills || '').trim() || null,
    employmentType: String(row.jobType || row.employmentType || '').trim() || null,
    positionLevel: String(row.positionLevel || '').trim() || null,
    noOfPositions: toIntOrNull(row.noOfPositions),
    workMode: String(row.workType || row.hiringType || row.workMode || '').trim() || null,
    experienceMin: toIntOrNull(row.minExperience),
    experienceMax: toIntOrNull(row.maxExperience),
    ctcMin: toNumberOrNull(row.minSalary),
    ctcMax: toNumberOrNull(row.maxSalary),
    currencyCode: 'INR',
    ctcUnit: 'LPA',
    jobStatus: String(row.jobOpeningStatus || row.jobStatus || 'Active').trim(),
    priority: String(row.priority || 'Medium').trim(),
    createdByUserId: null,
    jobReceivedDate: toIsoInstant(row.jobReceivedDate),
    validityUpto: toIsoLocalDate(row.validityUpto),
    targetDate: toIsoLocalDate(row.targetDate),
    locationCity: String(row.city || row.location || '').trim() || null,
    locationState: null,
    locationCountry: null,
    headcountFilled: toIntOrNull(row.headcountFilled),
    jobFunction: String(row.jobFunction || '').trim() || null,
    seniorityLevel: String(row.seniorityLevel || '').trim() || null,
  };
};

export const createJob = async (row) =>
  API.post('/api/jobs', toJobRequest(row), {
    skipAuth: true,
    skipAuthRedirect: true,
  });

export const updateJob = async (jobId, row) =>
  API.put(`/api/jobs/${encodeURIComponent(jobId)}`, toJobRequest(row), {
    skipAuth: true,
    skipAuthRedirect: true,
  });

export const deleteJob = async (jobId) =>
  API.delete(`/api/jobs/${encodeURIComponent(jobId)}`, {
    skipAuth: true,
    skipAuthRedirect: true,
  });

export const fetchClients = async () =>
  unwrapList(
    await API.get('/api/clients', {
      // Client list endpoint currently fails when local login token is attached.
      // Skip auth header so dropdown options can still load.
      skipAuth: true,
      skipAuthRedirect: true,
    })
  );

export const toClientRequest = (row = {}) => ({
  clientName: String(row.clientName || row.name || '').trim(),
  primaryLocationId: null,
  clientCode: String(row.clientCode || row.clientId || '').trim() || null,
  industryCode: null,
  websiteUrl: String(row.websiteUrl || '').trim() || null,
  comments: String(row.comments || row.note || '').trim() || null,
  status: String(row.clientStatus || row.status || 'Active').trim(),
});

export const createClient = (payload) =>
  API.post('/api/clients', toClientRequest(payload), {
    skipAuth: true,
    skipAuthRedirect: true,
  });

export const updateClient = (clientId, payload) =>
  API.put(`/api/clients/${encodeURIComponent(clientId)}`, toClientRequest(payload), {
    skipAuth: true,
    skipAuthRedirect: true,
  });

export const deleteClient = (clientId) =>
  API.delete(`/api/clients/${encodeURIComponent(clientId)}`, {
    skipAuth: true,
    skipAuthRedirect: true,
  });

export const normalizeClientRecord = (row, index = 0) => ({
  clientId: row?.clientId || row?.id || `CL-${index + 1}`,
  clientName: normalizeText(row?.clientName || row?.name),
  contactEmail: normalizeText(row?.contactEmail || row?.email),
  contactNumber: normalizeText(row?.contactNumber || row?.phone),
  primaryContactPerson: normalizeText(row?.primaryContactPerson || row?.contactPersonName),
  secondaryContactPerson: normalizeText(row?.secondaryContactPerson),
  accountManager: normalizeText(row?.accountManager || row?.assignedPerson),
  activeFrom: row?.activeFrom || row?.createdAt || '',
  comments: row?.comments || row?.note || '',
  clientStatus: normalizeText(row?.clientStatus || row?.status, 'Active'),
  clientLocation: normalizeText(row?.clientLocation || row?.location),
});

export const toClientOption = (row) => {
  const clientId = String(row?.clientId || row?.clientID || row?.id || '').trim();
  const clientName = String(row?.clientName || row?.name || '').trim();

  if (!clientId || !clientName) {
    return null;
  }

  return {
    value: clientName,
    label: clientName,
    clientId,
    id: clientId,
  };
};

export const normalizeJobRecord = (row, index = 0) => ({
  jobId: row?.jobId || row?.id || null,
  jobPositionId: row?.jobPositionId || row?.openingJobId || row?.jobId || `JOP-${String(index + 1).padStart(3, '0')}`,
  openingJobId: row?.openingJobId || row?.jobPositionId || row?.jobId || '',
  postingTitle: row?.postingTitle || row?.positionName || row?.title || '-',
  positionName: row?.positionName || row?.postingTitle || row?.title || '-',
  location: row?.location || row?.city || '-',
  targetDate: row?.targetDate || row?.jobReceivedDate || '',
  jobOpeningStatus: row?.jobOpeningStatus || row?.status || 'Active',
  priority: row?.priority || 'Medium',
  clientId: row?.clientId || '-',
  clientName: row?.clientName || row?.company || '-',
  contactPersonName: row?.contactPersonName || '-',
  contactPersonEmail: row?.contactPersonEmail || row?.contactEmail || '-',
  assignedRecruiters: row?.assignedRecruiters || '-',
  hiringManager: row?.hiringManager || '-',
  candidates: Array.isArray(row?.candidates) ? row.candidates : [],
  ...row,
});
