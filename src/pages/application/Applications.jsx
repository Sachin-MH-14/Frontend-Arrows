import * as React from "react";
import { FiSearch } from "react-icons/fi";
import styles from "./Applications.module.scss";

const JOB_OPENING_TABLE_STORAGE_KEY = "job-openings:table:v1";

function normalizeText(value) {
  return String(value || "").trim();
}

function buildApplicationRows(jobRows = []) {
  return jobRows.flatMap((job, jobIndex) => {
    const openingJobId =
      normalizeText(job.openingJobId) ||
      normalizeText(job.jobPositionId) ||
      normalizeText(job.jobId) ||
      `JOB-${jobIndex + 1}`;

    const postingTitle =
      normalizeText(job.postingTitle) ||
      normalizeText(job.positionName) ||
      "-";

    const clientName =
      normalizeText(job.clientName) ||
      normalizeText(job.clientId) ||
      "-";

    const candidates = Array.isArray(job.candidates) ? job.candidates : [];

    return candidates.map((candidate, candidateIndex) => ({
      id: `${openingJobId}-${normalizeText(candidate.candidateId) || candidateIndex}`,
      candidateId: normalizeText(candidate.candidateId) || "-",
      candidateName: normalizeText(candidate.candidateName) || "-",
      candidateEmail: normalizeText(candidate.candidateEmail) || "-",
      openingJobId,
      postingTitle,
      clientName,
      appliedDate:
        normalizeText(candidate.appliedDate) ||
        normalizeText(candidate.modifiedTime) ||
        normalizeText(job.appliedDate) ||
        normalizeText(job.targetDate) ||
        "-",
      stage: normalizeText(candidate.stage) || "-",
      status:
        normalizeText(candidate.status) ||
        normalizeText(job.jobOpeningStatus) ||
        "-",
    }));
  });
}

function loadApplicationRows() {
  try {
    const raw = localStorage.getItem(JOB_OPENING_TABLE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return buildApplicationRows(parsed);
  } catch (error) {
    console.error("Failed to load applications from job openings:", error);
    return [];
  }
}

export default function Applications() {
  const [searchTerm, setSearchTerm] = React.useState("");
  const [applicationRows, setApplicationRows] = React.useState(() => loadApplicationRows());

  React.useEffect(() => {
    const refresh = () => setApplicationRows(loadApplicationRows());

    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);

    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const filteredRows = React.useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return applicationRows;

    return applicationRows.filter((row) =>
      [
        row.candidateId,
        row.candidateName,
        row.candidateEmail,
        row.openingJobId,
        row.postingTitle,
        row.clientName,
        row.stage,
        row.status,
      ]
        .map((value) => String(value || "").toLowerCase())
        .some((value) => value.includes(query)),
    );
  }, [applicationRows, searchTerm]);

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.infoRow}>
          <p className={styles.description}>
            <strong>Applications</strong> combines <strong>Job Openings</strong> and <strong>Candidates</strong> to show who applied for each job.
          </p>
        </div>

        <div className={styles.filtersBar}>
          <div className={styles.searchField}>
            <FiSearch className={styles.searchIcon} aria-hidden="true" />
            <input
              type="text"
              placeholder="Search by candidate, job, client, stage..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className={styles.searchInput}
            />
          </div>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.applicationTable}>
            <thead>
              <tr>
                <th>Candidate Id</th>
                <th>Candidate Name</th>
                <th>Email Address</th>
                <th>Job Id</th>
                <th>Job Title</th>
                <th>Client Name</th>
                <th>Applied Date</th>
                <th>Stage</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className={styles.emptyCell}>
                    No applications found. Add candidates under job openings to see records here.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.candidateId}</td>
                    <td>{row.candidateName}</td>
                    <td>{row.candidateEmail}</td>
                    <td>{row.openingJobId}</td>
                    <td>{row.postingTitle}</td>
                    <td>{row.clientName}</td>
                    <td>{row.appliedDate}</td>
                    <td>{row.stage}</td>
                    <td>{row.status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className={styles.footer}>
          Showing {filteredRows.length} application{filteredRows.length === 1 ? "" : "s"}
        </div>
      </div>
    </div>
  );
}
