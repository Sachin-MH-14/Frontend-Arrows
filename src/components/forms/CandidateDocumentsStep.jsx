import React, { useMemo } from "react";

const ALLOWED_EXTENSIONS = new Set(["pdf", "doc", "docx"]);

const normalizeText = (value) => String(value || "").replace(/\s+/g, " ").trim();

const toLower = (value) => normalizeText(value).toLowerCase();

const getResumeLines = (text) =>
  String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

const normalizeResumeDocument = (value) =>
  String(value || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();

const readDocxText = async (file) => {
  const mammoth = await import("mammoth/mammoth.browser");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return normalizeResumeDocument(result?.value || "");
};

const readResumeText = async (file) => {
  const extension = String(file?.name || "").split(".").pop()?.toLowerCase();
  if (!extension) return "";
  if (extension === "docx") return readDocxText(file);
  if (extension === "doc" || extension === "txt") return normalizeResumeDocument(await file.text());
  return "";
};

const parseResumeDateToIso = (value) => {
  const raw = String(value || "").trim().replace(/[,]/g, " ").replace(/\s+/g, " ");
  if (!raw) return "";

  const dayMonthYear = raw.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (dayMonthYear) {
    const day = Number.parseInt(dayMonthYear[1], 10);
    const month = Number.parseInt(dayMonthYear[2], 10);
    let year = Number.parseInt(dayMonthYear[3], 10);
    if (year < 100) year += 2000;
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const monthNameYear = raw.match(/([A-Za-z]{3,9})\s+(\d{1,2})\s+(\d{4})/);
  if (monthNameYear) {
    const parsedDate = new Date(`${monthNameYear[1]} ${monthNameYear[2]} ${monthNameYear[3]}`);
    if (!Number.isNaN(parsedDate.getTime())) {
      const yyyy = parsedDate.getFullYear();
      const mm = String(parsedDate.getMonth() + 1).padStart(2, "0");
      const dd = String(parsedDate.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    }
  }

  const parsedDate = new Date(raw);
  if (Number.isNaN(parsedDate.getTime())) {
    return "";
  }

  const yyyy = parsedDate.getFullYear();
  const mm = String(parsedDate.getMonth() + 1).padStart(2, "0");
  const dd = String(parsedDate.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const extractCandidateName = (text) => {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const labelledLine = lines.find((line) => /^(?:candidate\s*name|full\s*name|name)\s*[:\-]/i.test(line));
  const candidateLine = labelledLine
    ? labelledLine.replace(/^(?:candidate\s*name|full\s*name|name)\s*[:\-]\s*/i, "")
    : lines.find(
        (line) =>
          !/@/.test(line) &&
          !/\d{7,}/.test(line) &&
          /^[A-Za-z][A-Za-z\s.'-]+$/.test(line) &&
          line.split(/\s+/).length >= 2
      );

  const cleaned = cleanResumeValue(candidateLine || "")
    .replace(/^(mr|mrs|ms|miss|dr)\.?\s+/i, "")
    .replace(/[^A-Za-z\s.'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const parts = cleaned.split(" ").filter(Boolean);
  if (parts.length < 2) {
    return { firstName: "", lastName: "" };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
};

const extractGenderValue = (text) => {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const labelledLine = lines.find((line) => /^(?:gender|sex)\s*[:\-]/i.test(line));
  const labelledValue = labelledLine?.match(/(?:gender|sex)\s*[:\-]?\s*(male|female|other|non[-\s]?binary|m|f)\b/i)?.[1];
  const fallbackValue = lines
    .slice(0, 12)
    .join(" ")
    .match(/\b(male|female|other|non[-\s]?binary)\b/i)?.[1];

  const rawValue = String(labelledValue || fallbackValue || "").toLowerCase().replace(/\s+/g, "");
  if (rawValue === "m" || rawValue === "male") return "male";
  if (rawValue === "f" || rawValue === "female") return "female";
  if (rawValue === "other" || rawValue === "non-binary" || rawValue === "nonbinary") return "other";
  return "";
};

const extractDateOfBirthValue = (text) => {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const labelledLine = lines.find((line) => /(?:date\s*of\s*birth|dob|birth\s*date)\s*[:\-]?/i.test(line));
  if (!labelledLine) return "";

  const dateText = labelledLine.replace(/.*?(?:date\s*of\s*birth|dob|birth\s*date)\s*[:\-]?\s*/i, "");
  return parseResumeDateToIso(dateText);
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

const cleanRoleOrCompanyValue = (value) =>
  cleanResumeValue(value)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "")
    .replace(/\b(?:experience|employment|current company info)\b.*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();

const extractLatestExperienceEntry = (text) => {
  const lines = getResumeLines(text);
  if (lines.length === 0) return { company: "", role: "" };

  const experienceIndex = lines.findIndex(
    (line) => /^experience$/i.test(line) || /professional\s+experience/i.test(line)
  );

  const scopedLines = experienceIndex >= 0 ? lines.slice(experienceIndex + 1) : lines;
  const datePrefixPattern = /^(\d{1,2}[/-]\d{4}|\d{4})\s*(?:to|–|-|—)?\s*(present|current|now|\d{1,2}[/-]\d{4}|\d{4})?/i;
  const scoreDateText = (dateText) => {
    const lower = String(dateText || "").toLowerCase();
    if (/present|current|now/.test(lower)) return Number.MAX_SAFE_INTEGER;
    const match = lower.match(/(\d{1,2})[/-](\d{4})|(\d{4})/);
    if (!match) return 0;
    if (match[2]) {
      return Number.parseInt(match[2], 10) * 12 + Number.parseInt(match[1], 10);
    }
    return Number.parseInt(match[3], 10) * 12;
  };

  const candidates = [];

  for (let index = 0; index < scopedLines.length; index += 1) {
    const line = scopedLines[index];
    const dateMatch = line.match(datePrefixPattern);
    if (!dateMatch) continue;

    const matchedDateText = dateMatch[0] || "";
    const inlineRemainder = line.slice(matchedDateText.length).replace(/^[\s,:-]+/, "").trim();
    const candidateLine = inlineRemainder || (scopedLines[index + 1] || "").trim();
    if (!candidateLine || /@|http|linkedin/i.test(candidateLine)) continue;

    const parts = candidateLine
      .split(",")
      .map((part) => cleanRoleOrCompanyValue(part))
      .filter(Boolean);
    if (parts.length === 0) continue;

    candidates.push({
      company: parts[0] || "",
      role: parts.slice(1).join(", ") || "",
      score: scoreDateText(matchedDateText),
      index,
    });
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.index - b.index;
    });

    return {
      company: candidates[0].company,
      role: candidates[0].role,
    };
  }

  return { company: "", role: "" };
};

const SKILL_ALIAS_MAP = {
  java: ["core java", "java", "spring boot", "spring"],
  python: ["python", "python3"],
  react: ["react", "reactjs", "react js"],
  node: ["node", "nodejs", "node js", "express"],
  aws: ["aws", "amazon web services"],
};

const collectMatchedSkillValues = (text, options = []) => {
  const normalizedText = ` ${toLower(text).replace(/[^a-z0-9+#.\s]/g, " ")} `;

  return options
    .filter((option) => {
      const value = String(option?.value || "").toLowerCase();
      const label = String(option?.label || option?.value || "").toLowerCase();
      const aliases = SKILL_ALIAS_MAP[value] || [label, value];

      return aliases.some((alias) => {
        const normalizedAlias = String(alias || "").toLowerCase().trim();
        if (!normalizedAlias) return false;
        const escapedAlias = normalizedAlias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return new RegExp(`(^|\\s)${escapedAlias}(\\s|$)`, "i").test(normalizedText);
      });
    })
    .map((option) => option.value);
};

const getSkillDefaultsFromExperience = (yearsBucket, yearsNumber) => {
  let skillExperienceLevel = "";
  let skillRating = "";

  if (yearsBucket === "0-1" || yearsBucket === "1-3") {
    skillExperienceLevel = "beginner";
  } else if (yearsBucket === "3-5" || yearsBucket === "5-8") {
    skillExperienceLevel = "intermediate";
  } else if (yearsBucket) {
    skillExperienceLevel = "expert";
  }

  if (yearsBucket === "0-1") {
    skillRating = "1";
  } else if (yearsBucket === "1-3") {
    skillRating = "2";
  } else if (yearsBucket === "3-5") {
    skillRating = "3";
  } else if (yearsBucket === "5-8") {
    skillRating = "4";
  } else if (yearsBucket) {
    skillRating = "5";
  }

  const numericYears = Number.isFinite(yearsNumber) ? Math.max(0, Number(yearsNumber.toFixed(1))) : "";

  return {
    skillExperienceLevel,
    skillRating,
    skillExperienceYears: numericYears ? String(numericYears) : "",
  };
};

const createSkillRow = (primarySkill, defaults = {}) => ({
  primarySkill: primarySkill || "",
  enableSecondarySkill: false,
  secondarySkill: "",
  skillExperienceLevel: defaults.skillExperienceLevel || "",
  skillExperienceYears: defaults.skillExperienceYears || "",
  skillRating: defaults.skillRating || "",
  skillComments: "",
  secondarySkillExperienceLevel: "",
  secondarySkillExperienceYears: "",
  secondarySkillRating: "",
  secondarySkillComments: "",
});

const extractCompanyAndRole = (text) => {
  const lines = getResumeLines(text);
  if (lines.length === 0) return { company: "", role: "" };

  const latestExperience = extractLatestExperienceEntry(text);
  if (latestExperience.company) {
    return {
      company: cleanRoleOrCompanyValue(latestExperience.company),
      role: cleanRoleOrCompanyValue(latestExperience.role || ""),
    };
  }

  const companyLine = lines.find((line) => /^(?:current\s+company|company|organization|employer)\s*[:\-]/i.test(line));
  const roleLine = lines.find((line) => /^(?:current\s+(?:designation|role)|designation|job\s*title|title|role)\s*[:\-]/i.test(line));

  let company = cleanRoleOrCompanyValue(companyLine?.replace(/^(?:current\s+company|company|organization|employer)\s*[:\-]\s*/i, "") || "");
  let role = cleanRoleOrCompanyValue(roleLine?.replace(/^(?:current\s+(?:designation|role)|designation|job\s*title|title|role)\s*[:\-]\s*/i, "") || "");

  if (!company || !role) {
    const lineWithAt = lines.find((line) => /\s+at\s+/i.test(line) && !/@|http|linkedin/i.test(line));

    if (lineWithAt) {
      const [left = "", right = ""] = lineWithAt.split(/\s+at\s+/i);
      if (!role) role = cleanRoleOrCompanyValue(left);
      if (!company) company = cleanRoleOrCompanyValue(right);
    }
  }

  if (!company || !role) {
    const experienceIndex = lines.findIndex((line) => /^experience$/i.test(line) || /professional\s+experience/i.test(line));
    if (experienceIndex >= 0) {
      const windowLines = lines.slice(experienceIndex + 1, experienceIndex + 6);
      const meaningfulLines = windowLines.filter((line) => !/@|\b(?:present|yrs?|years?|months?)\b/i.test(line));
      if (!role && meaningfulLines[0]) {
        role = cleanRoleOrCompanyValue(meaningfulLines[0]);
      }
      if (!company && meaningfulLines[1]) {
        company = cleanRoleOrCompanyValue(meaningfulLines[1]);
      }
    }
  }

  return { company, role };
};

const extractExperienceYears = (text) => {
  const normalized = normalizeText(text);
  const lines = getResumeLines(text);
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

  const monthYearMatches = Array.from(
    normalized.matchAll(/(\d{1,2})[/-](\d{4})\s*(?:to|-|–)\s*(present|current|now|\d{1,2}[/-]\d{4})/gi)
  );
  if (monthYearMatches.length > 0) {
    const ranges = monthYearMatches
      .map((match) => {
        const startMonth = Number.parseInt(match[1], 10);
        const startYear = Number.parseInt(match[2], 10);
        const endRaw = String(match[3] || "").toLowerCase();

        let endMonth = new Date().getMonth() + 1;
        let endYear = new Date().getFullYear();
        if (!/present|current|now/.test(endRaw)) {
          const endMatch = endRaw.match(/(\d{1,2})[/-](\d{4})/);
          if (!endMatch) return null;
          endMonth = Number.parseInt(endMatch[1], 10);
          endYear = Number.parseInt(endMatch[2], 10);
        }

        return { startMonth, startYear, endMonth, endYear };
      })
      .filter(Boolean);

    if (ranges.length > 0) {
      const earliest = ranges.reduce((min, current) => {
        const minValue = min.startYear * 12 + min.startMonth;
        const currentValue = current.startYear * 12 + current.startMonth;
        return currentValue < minValue ? current : min;
      });
      const latest = ranges.reduce((max, current) => {
        const maxValue = max.endYear * 12 + max.endMonth;
        const currentValue = current.endYear * 12 + current.endMonth;
        return currentValue > maxValue ? current : max;
      });

      const totalMonths = latest.endYear * 12 + latest.endMonth - (earliest.startYear * 12 + earliest.startMonth);
      if (totalMonths > 0) {
        return totalMonths / 12;
      }
    }
  }

  const lineYearsMatch = lines
    .map((line) => line.match(/(?:experience|exp)\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(?:years?|yrs?)/i))
    .find(Boolean);
  if (lineYearsMatch?.[1]) {
    return Number.parseFloat(lineYearsMatch[1]);
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

    const extractedName = extractCandidateName(text);
    if (!normalizeText(formData.firstName) && extractedName.firstName) {
      updates.firstName = extractedName.firstName;
    }
    if (!normalizeText(formData.lastName) && extractedName.lastName) {
      updates.lastName = extractedName.lastName;
    }

    if (!normalizeText(formData.dateOfBirth)) {
      const extractedDob = extractDateOfBirthValue(text);
      if (extractedDob) {
        updates.dateOfBirth = extractedDob;
      }
    }

    if (!normalizeText(formData.gender)) {
      const extractedGender = extractGenderValue(text);
      if (extractedGender) {
        updates.gender = extractedGender;
      }
    }

    const primarySkillOptions = [
      ...(Array.isArray(formData.skills) ? [] : []),
    ];

    if (!normalizeText(formData.primarySkill)) {
      const configSkillOptions = [
        { value: "java", label: "Core Java" },
        { value: "python", label: "Python" },
        { value: "react", label: "React" },
        { value: "node", label: "Node.js" },
        { value: "aws", label: "AWS" },
        { value: "html5", label: "HTML5" },
        { value: "css3", label: "CSS3" },
        { value: "javascript", label: "JavaScript" },
        { value: "jquery", label: "jQuery" },
        { value: "bootstrap", label: "Bootstrap" },
        { value: "react-js", label: "React.js" },
        { value: "angular-4", label: "Angular 4" },
        { value: "backbone-js", label: "Backbone.js" },
      ];
      const matchedSkills = collectMatchedSkillValues(text, configSkillOptions);
      if (matchedSkills[0]) {
        updates.primarySkill = matchedSkills[0];
      }
      if (!normalizeText(formData.secondarySkill) && matchedSkills[1]) {
        updates.secondarySkill = matchedSkills[1];
      }

      if (matchedSkills.length > 0) {
        const existingSkillRows = Array.isArray(formData.skills) ? formData.skills : [];
        const hasExistingPrimarySkill = existingSkillRows.some((row) => normalizeText(row?.primarySkill));
        const yearsNumber = extractExperienceYears(text);
        const effectiveYearsBucket = updates.yearsExperience || formData.yearsExperience;
        const skillDefaults = getSkillDefaultsFromExperience(effectiveYearsBucket, yearsNumber);

        if (!hasExistingPrimarySkill) {
          updates.skills = matchedSkills.map((skillValue) => createSkillRow(skillValue, skillDefaults));
        }
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
