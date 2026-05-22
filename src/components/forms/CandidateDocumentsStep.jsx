import React, { useMemo } from "react";

const ALLOWED_EXTENSIONS = new Set(["pdf", "doc", "docx"]);

const normalizeText = (value) => String(value || "").replace(/\s+/g, " ").trim();

const readDocxText = async (file) => {
  const mammoth = await import("mammoth/mammoth.browser");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return normalizeText(result?.value || "");
};

const readResumeText = async (file) => {
  const extension = String(file?.name || "").split(".").pop()?.toLowerCase();
  if (!extension) return "";
  if (extension === "docx") return readDocxText(file);
  if (extension === "doc" || extension === "txt") return normalizeText(await file.text());
  return "";
};

const mapYearsToBucket = (yearsNumber) => {
  if (!Number.isFinite(yearsNumber) || yearsNumber < 0) return "";
  if (yearsNumber <= 1) return "0-1";
  if (yearsNumber <= 3) return "1-3";
  if (yearsNumber <= 5) return "3-5";
  if (yearsNumber <= 8) return "5-8";
  if (yearsNumber <= 12) return "8-12";
  return "12+";
};

const cleanResumeValue = (value) =>
  normalizeText(String(value || "").replace(/[|•]/g, " ").replace(/\s+/g, " ")).slice(0, 120);

const extractCompanyAndRole = (text) => {
  const normalized = normalizeText(text);
  if (!normalized) return { company: "", role: "" };

  const companyMatch = normalized.match(
    /(?:current\s+company|company|organization|employer)\s*[:\-]\s*([^\n\r,|]+)/i
  );
  const roleMatch = normalized.match(
    /(?:current\s+(?:designation|role)|designation|job\s*title|title|role)\s*[:\-]\s*([^\n\r,|]+)/i
  );

  let company = cleanResumeValue(companyMatch?.[1] || "");
  let role = cleanResumeValue(roleMatch?.[1] || "");

  if (!company || !role) {
    const lineWithAt = normalized
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => /\s+at\s+/i.test(line) && !/mailto:|http/i.test(line));

    if (lineWithAt) {
      const [left = "", right = ""] = lineWithAt.split(/\s+at\s+/i);
      if (!role) role = cleanResumeValue(left);
      if (!company) company = cleanResumeValue(right);
    }
  }

  return { company, role };
};

const extractExperienceYears = (text) => {
  const normalized = normalizeText(text);
  if (!normalized) return null;

  const explicitRangeMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(?:to|\-|–)\s*(\d+(?:\.\d+)?)\s*(?:years?|yrs?)/i);
  if (explicitRangeMatch?.[2]) {
    return Number.parseFloat(explicitRangeMatch[2]);
  }

  const yearsMonthsMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(?:years?|yrs?)\s*(\d{1,2})\s*(?:months?|mos?)/i);
  if (yearsMonthsMatch?.[1]) {
    const years = Number.parseFloat(yearsMonthsMatch[1]);
    const months = Number.parseFloat(yearsMonthsMatch[2] || "0");
    return years + months / 12;
  }

  const standardMatch = normalized.match(/(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)(?:\s+of\s+experience)?/i);
  if (standardMatch?.[1]) {
    return Number.parseFloat(standardMatch[1]);
  }

  const labelledMatch = normalized.match(/(?:total\s+)?experience\s*[:\-]?\s*(\d+(?:\.\d+)?)/i);
  if (labelledMatch?.[1]) {
    return Number.parseFloat(labelledMatch[1]);
  }

  return null;
};

const formatBytes = (bytes) => {
  if (!bytes && bytes !== 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

const CandidateDocumentsStep = ({ formData, onChange, onSetStepFields }) => {
  const documents = Array.isArray(formData.candidateDocuments)
    ? formData.candidateDocuments
    : [];

  const isAllowedDocument = (file) => {
    const extension = file?.name?.split(".").pop()?.toLowerCase();
    return Boolean(extension && ALLOWED_EXTENSIONS.has(extension));
  };

  const mapResumeToFields = async (file) => {
    if (!file) return;

    const text = await readResumeText(file);
    if (!text) return;

    const updates = {};
    const normalizedLower = normalizeText(text).toLowerCase();
    const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    const phoneMatch = text.match(/(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{3,5}\)?[\s-]?)?\d{3,5}[\s-]?\d{4,6}/);
    const nameLine = text.split(/\r?\n/).map((line) => line.trim()).find(Boolean);

    if (!normalizeText(formData.primaryEmail) && emailMatch?.[0]) {
      updates.primaryEmail = emailMatch[0];
    }

    if (!normalizeText(formData.phoneNumber) && phoneMatch?.[0]) {
      const digits = phoneMatch[0].replace(/\D/g, "");
      if (digits.length >= 10) {
        updates.phoneNumber = digits.slice(-10);
      }
    }

    if (!normalizeText(formData.yearsExperience)) {
      const yearsValue = mapYearsToBucket(extractExperienceYears(text) ?? Number.NaN);
      if (yearsValue) {
        updates.yearsExperience = yearsValue;
        if (!normalizeText(formData.candidateType)) {
          updates.candidateType = yearsValue === "0-1" ? "fresher" : "experienced";
        }
      }
    }

    if (nameLine && !normalizeText(formData.firstName) && !normalizeText(formData.lastName)) {
      const cleanedName = nameLine.replace(/[^A-Za-z\s.-]/g, " ").replace(/\s+/g, " ").trim();
      const parts = cleanedName.split(" ").filter(Boolean);
      if (parts.length >= 2) {
        updates.firstName = parts[0];
        updates.lastName = parts.slice(1).join(" ");
      }
    }

    const { company, role } = extractCompanyAndRole(text);
    if (!normalizeText(formData.currentCompanyName) && company) {
      updates.currentCompanyName = company;
    }
    if (!normalizeText(formData.jobTitleRole) && role) {
      updates.jobTitleRole = role;
    }

    if (!normalizeText(formData.employmentType)) {
      if (normalizedLower.includes("full time") || normalizedLower.includes("full-time")) {
        updates.employmentType = "full-time";
      } else if (normalizedLower.includes("contract")) {
        updates.employmentType = "contract";
      } else if (normalizedLower.includes("intern") || normalizedLower.includes("internship")) {
        updates.employmentType = "internship";
      }
    }

    Object.entries(updates).forEach(([fieldName, fieldValue]) => {
      if (fieldValue !== undefined && fieldValue !== null && fieldValue !== "") {
        onChange(fieldName, fieldValue);
      }
    });
  };

  const addFiles = (fileList) => {
    const files = Array.from(fileList || [])
      .filter(isAllowedDocument)
      .map((file) => ({
        id: `${file.name}-${file.lastModified}-${file.size}`,
        name: file.name,
        size: file.size,
        type: file.type,
        file,
      }));
    if (files.length === 0) return;
    const nextDocs = [...documents, ...files];
    onChange("candidateDocuments", nextDocs);
    if (!formData.candidateResume) {
      onChange("candidateResume", files[0]);
    }
    void mapResumeToFields(files[0]?.file);
  };

  const handleFileChange = (event) => {
    addFiles(event.target.files);
    event.target.value = "";
  };

  const handleDrop = (event) => {
    event.preventDefault();
    addFiles(event.dataTransfer.files);
  };

  const handleRemove = (docId) => {
    const nextDocs = documents.filter((doc) => doc.id !== docId);
    onChange("candidateDocuments", nextDocs);
    if (nextDocs.length === 0) {
      onChange("candidateResume", "");
      return;
    }
    if (formData.candidateResume) {
      const resumeId =
        formData.candidateResume?.name &&
          formData.candidateResume?.size !== undefined
          ? `${formData.candidateResume.name}-${formData.candidateResume.lastModified}-${formData.candidateResume.size}`
          : null;
      if (resumeId && !nextDocs.some((doc) => doc.id === resumeId)) {
        onChange("candidateResume", nextDocs[0].file || nextDocs[0]);
      }
    }
  };

  const inputId = useMemo(() => "candidate-documents-input", []);

  return (
    <div className="candidate-documents-step">
      <div className="document-upload-header">Upload Document</div>
      <label
        htmlFor={inputId}
        className="document-dropzone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <div className="document-dropzone-icon">📄</div>
        <div className="document-dropzone-text">
          <span className="dropzone-link">Click Here</span> to upload your Documents or drag.
        </div>
        <div className="document-dropzone-subtext">Supported Formats: PDF, DOC, DOCX (20 MB)</div>
        <input
          id={inputId}
          type="file"
          accept=".pdf,.doc,.docx"
          multiple
          className="document-input"
          onChange={handleFileChange}
        />
      </label>

      <div className="document-list">
        {documents.length === 0 && (
          <div className="document-empty">No documents uploaded yet.</div>
        )}
        {documents.map((doc, index) => (
          <div
            key={doc.id}
            className={`document-item ${index % 2 === 0 ? "document-item--blue" : "document-item--peach"}`}
          >
            <div className="document-info">
              <div className="document-icon">📄</div>
              <div>
                <div className="document-name">{doc.name}</div>
                <div className="document-meta">
                  {doc.type ? doc.type.replace("application/", "") : "file"} |{" "}
                  {formatBytes(doc.size)}
                </div>
              </div>
            </div>
            <button
              type="button"
              className="document-delete"
              aria-label={`Remove ${doc.name}`}
              onClick={() => handleRemove(doc.id)}
            >
              🗑
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CandidateDocumentsStep;
