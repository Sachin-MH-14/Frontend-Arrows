import API from './axiosConfig';

const unwrapRecruiterItems = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

export const fetchRecruiters = async ({ openingJobId } = {}) => {
  const response = await API.get('/users/recruiters', {
    params: openingJobId ? { openingJobId } : undefined,
    skipAuthRedirect: true,
  });
  const items = unwrapRecruiterItems(response?.data);

  return items
    .map((item, index) => {
      const recruiterId = String(item?.userId || item?.id || '').trim();
      const recruiterName = String(item?.name || '').trim();
      if (!recruiterId || !recruiterName) return null;

      return {
        id: recruiterId,
        name: recruiterName,
        email: String(item?.email || '').trim() || `${recruiterName.toLowerCase().replace(/\s+/g, '.')}@email.com`,
        role: String(item?.assignmentRole || 'Recruiter')
          .replace(/_/g, ' ')
          .toLowerCase()
          .replace(/\b\w/g, (ch) => ch.toUpperCase()),
        sortIndex: index,
      };
    })
    .filter(Boolean);
};

export const saveTeamMembers = async ({ openingJobId, teamMembers = [], permissions = {} }) => {
  if (!openingJobId || !Array.isArray(teamMembers) || teamMembers.length === 0) {
    return null;
  }

  return API.post('/jobs/team-members', {
    openingJobId,
    teamMembers,
    permissions: {
      visibility: permissions.visibility || 'private',
      access: permissions.access || 'restricted',
    },
  }, {
    skipAuthRedirect: true,
  });
};
