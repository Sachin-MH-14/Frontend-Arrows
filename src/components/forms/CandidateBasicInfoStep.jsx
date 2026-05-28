import React, { useEffect, useMemo } from "react";
import FormField from "./FormField";

const normalizeText = (value) => String(value || "").replace(/\s+/g, " ").trim();

const toLower = (value) => normalizeText(value).toLowerCase();

const getResumeLines = (text) =>
  String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

const getFileLike = (value) => {
  if (!value) return null;
  if (typeof File !== "undefined" && value instanceof File) return value;
  if (value?.file && typeof File !== "undefined" && value.file instanceof File) return value.file;
  if (value?.file && typeof value.file === "object") return value.file;
  if (typeof value === "object" && typeof value.name === "string") return value;
  return null;
};

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

const CandidateBasicInfoStep = ({
  formData,
  onChange,
  fields = [],
  onSetStepFields,
  validationErrors = {},
}) => {
  const isFresher = formData.candidateType === "fresher";
  const parsedResumeRef = React.useRef("");


  const fieldMap = useMemo(() => {
    const map = {};
    fields.forEach((field) => {
      map[field.name] = field;
    });
    return map;
  }, [fields]);

  useEffect(() => {
    if (!onSetStepFields) return;

    const hiddenForFresher = [
      "currentCompanyName",
      "jobTitleRole",
      "employmentType",
      "noticePeriod",
      "currentCtc",
      "expectedCtc",
    ];

    onSetStepFields(
      fields
        .filter((field) => !(isFresher && hiddenForFresher.includes(field.name)))
        .map((field) => ({
          name: field.name,
          label: field.label,
          required: Boolean(field.required),
        }))
    );
  }, [fields, isFresher, onSetStepFields]);

  useEffect(() => {
    const sourceIdOptions = Array.isArray(fieldMap.sourceId?.options)
      ? fieldMap.sourceId.options
      : [];
    const sourceNameOptions = Array.isArray(fieldMap.sourceName?.options)
      ? fieldMap.sourceName.options
      : [];

    if (formData.sourceId) {
      const matchedSource = sourceIdOptions.find(
        (option) => String(option.value) === String(formData.sourceId)
      );

      if (matchedSource?.sourceName && matchedSource.sourceName !== formData.sourceName) {
        onChange("sourceName", matchedSource.sourceName);
      }
      return;
    }

    if (formData.sourceName) {
      const matchedSource = sourceNameOptions.find(
        (option) => String(option.value) === String(formData.sourceName)
      );

      if (matchedSource?.sourceId && matchedSource.sourceId !== formData.sourceId) {
        onChange("sourceId", matchedSource.sourceId);
      }
    }
  }, [fieldMap, formData.sourceId, formData.sourceName, onChange]);

  useEffect(() => {
    if (formData.candidateTemplateMode === undefined || formData.candidateTemplateMode === null || formData.candidateTemplateMode === "") {
      onChange("candidateTemplateMode", "no");
    }
  }, [formData.candidateTemplateMode, onChange]);

  useEffect(() => {
    const resumeFromDocs = Array.isArray(formData.candidateDocuments)
      ? getFileLike(formData.candidateDocuments[0])
      : null;

    const sourceFile =
      getFileLike(formData.candidateTemplateFile) ||
      getFileLike(formData.candidateResume) ||
      resumeFromDocs;
    if (!sourceFile || typeof sourceFile !== "object") return;

    const fileKey = `${sourceFile.name || ""}-${sourceFile.size || 0}-${sourceFile.lastModified || 0}`;
    if (!fileKey || parsedResumeRef.current === fileKey) return;

    let isCancelled = false;

    const parseAndMapResume = async () => {
      try {
        const extractedText = await readResumeText(sourceFile);
        if (isCancelled) return;

        parsedResumeRef.current = fileKey;
        if (!extractedText) return;

        const normalized = normalizeText(extractedText);
        const normalizedLower = toLower(normalized);
        const updates = {};

        const emailMatch = normalized.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
        const phoneMatch = normalized.match(/(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{3,5}\)?[\s-]?)?\d{3,5}[\s-]?\d{4,6}/);

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
          const yearsNumber = extractExperienceYears(normalized);
          const mappedExperience = mapYearsToBucket(yearsNumber ?? Number.NaN);
          if (mappedExperience) {
            updates.yearsExperience = mappedExperience;
            if (!normalizeText(formData.candidateType)) {
              updates.candidateType = (yearsNumber || 0) > 0 ? "experienced" : "fresher";
            }
          }
        }

        const extractedName = extractCandidateName(extractedText);
        if (!normalizeText(formData.firstName) && extractedName.firstName) {
          updates.firstName = extractedName.firstName;
        }
        if (!normalizeText(formData.lastName) && extractedName.lastName) {
          updates.lastName = extractedName.lastName;
        }

        if (!normalizeText(formData.dateOfBirth)) {
          const extractedDob = extractDateOfBirthValue(extractedText);
          if (extractedDob) {
            updates.dateOfBirth = extractedDob;
          }
        }

        if (!normalizeText(formData.gender)) {
          const extractedGender = extractGenderValue(extractedText);
          if (extractedGender) {
            updates.gender = extractedGender;
          }
        }

        const primarySkillOptions = Array.isArray(fieldMap.primarySkill?.options) ? fieldMap.primarySkill.options : [];
        const matchedSkills = collectMatchedSkillValues(extractedText, primarySkillOptions);
        const yearsNumber = extractExperienceYears(normalized);
        const effectiveYearsBucket = updates.yearsExperience || formData.yearsExperience;
        const skillDefaults = getSkillDefaultsFromExperience(effectiveYearsBucket, yearsNumber);

        if (!normalizeText(formData.primarySkill) && matchedSkills[0]) {
          updates.primarySkill = matchedSkills[0];
        }

        if (!normalizeText(formData.secondarySkill) && matchedSkills[1]) {
          updates.secondarySkill = matchedSkills[1];
        }

        if (matchedSkills.length > 0) {
          const existingSkillRows = Array.isArray(formData.skills) ? formData.skills : [];
          const hasExistingPrimarySkill = existingSkillRows.some((row) => normalizeText(row?.primarySkill));

          if (!hasExistingPrimarySkill) {
            updates.skills = matchedSkills.map((skillValue) => createSkillRow(skillValue, skillDefaults));
          }
        }

        if (!normalizeText(formData.skillRating) && normalizeText(updates.yearsExperience || formData.yearsExperience)) {
          const yearsValue = updates.yearsExperience || formData.yearsExperience;
          if (!normalizeText(formData.skillExperienceLevel)) {
            if (yearsValue === "0-1" || yearsValue === "1-3") {
              updates.skillExperienceLevel = "beginner";
            } else if (yearsValue === "3-5" || yearsValue === "5-8") {
              updates.skillExperienceLevel = "intermediate";
            } else {
              updates.skillExperienceLevel = "expert";
            }
          }
          if (yearsValue === "0-1") {
            updates.skillRating = "1";
          } else if (yearsValue === "1-3") {
            updates.skillRating = "2";
          } else if (yearsValue === "3-5") {
            updates.skillRating = "3";
          } else if (yearsValue === "5-8") {
            updates.skillRating = "4";
          } else {
            updates.skillRating = "5";
          }
        }

        const { company, role } = extractCompanyAndRole(extractedText);
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
      } catch (error) {
        console.error("Resume parsing failed:", error);
      }
    };

    void parseAndMapResume();

    return () => {
      isCancelled = true;
    };
  }, [
    fieldMap.primarySkill?.options,
    formData.candidateDocuments,
    formData.candidateResume,
    formData.candidateTemplateFile,
    formData.candidateType,
    formData.firstName,
    formData.lastName,
    formData.phoneNumber,
    formData.primaryEmail,
    formData.primarySkill,
    formData.skillExperienceLevel,
    formData.skillRating,
    formData.yearsExperience,
    onChange,
  ]);

  const renderField = (name, extraClass = "", overrides = {}) => {
    const field = fieldMap[name];
    if (!field) return null;
    const value =
      formData[field.name] || (field.type === "multiselect" ? [] : "");
    const fieldProps = { ...field, ...overrides };

    return (
      <div className={`candidate-cell${extraClass ? ` ${extraClass}` : ""}`}>
        <FormField
          key={fieldProps.name}
          label={fieldProps.label}
          type={fieldProps.type}
          name={fieldProps.name}
          value={value}
          onChange={onChange}
          required={fieldProps.required}
          options={fieldProps.options}
          validate={fieldProps.validate}
          error={validationErrors[fieldProps.name]}
          onValidation={fieldProps.onValidation}
          placeholder={fieldProps.placeholder}
          hideLabel={fieldProps.hideLabel}
          accept={fieldProps.accept}
          multiple={fieldProps.multiple}
          showBrowseButton={fieldProps.showBrowseButton}
          allowDecimal={fieldProps.allowDecimal}
          prefix={fieldProps.prefix}
          formData={formData}
          disabled={fieldProps.disabled}
        />
      </div>
    );
  };

  const skills = formData.skills || [
    {
      primarySkill: "",
      enableSecondarySkill: false,
      secondarySkill: "",
      skillExperienceLevel: "",
      skillExperienceYears: "",
      skillRating: "",
      skillComments: "",
      secondarySkillExperienceLevel: "",
      secondarySkillExperienceYears: "",
      secondarySkillRating: "",
      secondarySkillComments: ""
    }
  ];

  const handleAddField = () => {
    const newSkills = [
      ...skills,
      {
        primarySkill: "",
        enableSecondarySkill: false,
        secondarySkill: "",
        skillExperienceLevel: "",
        skillExperienceYears: "",
        skillRating: "",
        skillComments: "",
        secondarySkillExperienceLevel: "",
        secondarySkillExperienceYears: "",
        secondarySkillRating: "",
        secondarySkillComments: ""
      }
    ];
    onChange("skills", newSkills);
  };

  const handleRemoveField = (index) => {
    const newSkills = skills.filter((_, i) => i !== index);
    onChange("skills", newSkills);
  };

  const handleSkillChange = (index, fieldName, value) => {
    const newSkills = [...skills];
    newSkills[index] = { ...newSkills[index], [fieldName]: value };
    onChange("skills", newSkills);
  };

  const toggleSecondarySkill = (index, enabled) => {
    const newSkills = [...skills];
    const current = newSkills[index] || {};

    if (enabled) {
      newSkills[index] = { ...current, enableSecondarySkill: true };
    } else {
      newSkills[index] = {
        ...current,
        enableSecondarySkill: false,
        secondarySkill: "",
        secondarySkillExperienceLevel: "",
        secondarySkillExperienceYears: "",
        secondarySkillRating: "",
        secondarySkillComments: "",
      };
    }

    onChange("skills", newSkills);
  };

  const isAddButtonDisabled = skills.some(
    skill => !skill.primarySkill || !skill.skillExperienceLevel || !skill.skillExperienceYears || !skill.skillRating
  );

  return (
    <div className="candidate-step">
      <div className="candidate-section">
        <div className="candidate-section-header">
          <h3 className="candidate-section-title">Basic Info</h3>
          <div className="candidate-section-divider" />
        </div>
        <div className="candidate-grid">
          <div className="candidate-cell">
            <div className="job-template-choice">
              <div className="job-template-choice-label">
                Have Candidate Resume?
                <span className="required-star">*</span>
              </div>
              <div className="job-template-choice-options" role="radiogroup" aria-label="Have Candidate Resume">
                <label className="job-template-choice-option" htmlFor="candidateTemplateMode-no">
                  <input
                    id="candidateTemplateMode-no"
                    type="radio"
                    name="candidateTemplateMode"
                    value="no"
                    checked={formData.candidateTemplateMode !== "yes"}
                    onChange={() => {
                      onChange("candidateTemplateMode", "no");
                      onChange("candidateTemplateFile", "");
                    }}
                  />
                  <span>No</span>
                </label>
                <label className="job-template-choice-option" htmlFor="candidateTemplateMode-yes">
                  <input
                    id="candidateTemplateMode-yes"
                    type="radio"
                    name="candidateTemplateMode"
                    value="yes"
                    checked={formData.candidateTemplateMode === "yes"}
                    onChange={() => onChange("candidateTemplateMode", "yes")}
                  />
                  <span>Yes</span>
                </label>
              </div>
              {formData.candidateTemplateMode === "yes" && (
                <div className="job-template-upload-wrap">
                  {renderField("candidateTemplateFile")}
                </div>
              )}
            </div>
          </div>
          {renderField("candidateId")}
          <div className="candidate-cell">
            <div className="name-prefix-group">
              <label className="name-prefix-label">
                First Name <span className="required-star">*</span>
              </label>
              <div className="name-prefix-row">
                <div className="name-prefix-select">
                  {fieldMap.namePrefix && (
                    <FormField
                      key={fieldMap.namePrefix.name}
                      label={fieldMap.namePrefix.label}
                      type={fieldMap.namePrefix.type}
                      name={fieldMap.namePrefix.name}
                      value={formData[fieldMap.namePrefix.name] || ""}
                      onChange={onChange}
                      required={fieldMap.namePrefix.required}
                      options={fieldMap.namePrefix.options}
                      validate={fieldMap.namePrefix.validate}
                      error={validationErrors.namePrefix}
                      onValidation={fieldMap.namePrefix.onValidation}
                      placeholder={fieldMap.namePrefix.placeholder}
                      hideLabel={fieldMap.namePrefix.hideLabel}
                      accept={fieldMap.namePrefix.accept}
                      multiple={fieldMap.namePrefix.multiple}
                      prefix={fieldMap.namePrefix.prefix}
                      formData={formData}
                      suppressError
                    />
                  )}
                </div>
                <div className="name-prefix-input">
                  {fieldMap.firstName && (
                    <FormField
                      key={fieldMap.firstName.name}
                      label={fieldMap.firstName.label}
                      type={fieldMap.firstName.type}
                      name={fieldMap.firstName.name}
                      value={formData[fieldMap.firstName.name] || ""}
                      onChange={onChange}
                      required={fieldMap.firstName.required}
                      options={fieldMap.firstName.options}
                      validate={fieldMap.firstName.validate}
                      error={validationErrors.firstName}
                      onValidation={fieldMap.firstName.onValidation}
                      placeholder={fieldMap.firstName.placeholder}
                      hideLabel={fieldMap.firstName.hideLabel}
                      accept={fieldMap.firstName.accept}
                      multiple={fieldMap.firstName.multiple}
                      prefix={fieldMap.firstName.prefix}
                      formData={formData}
                      suppressError
                    />
                  )}
                </div>
              </div>
              {(validationErrors.namePrefix || validationErrors.firstName) && (
                <div className="error-message">
                  {validationErrors.namePrefix && (
                    <div>{validationErrors.namePrefix}</div>
                  )}
                  {validationErrors.firstName && (
                    <div>{validationErrors.firstName}</div>
                  )}
                </div>
              )}
            </div>
          </div>
          {renderField("lastName")}
          {renderField("primaryEmail")}
          {renderField("phoneNumber")}
          {renderField("gender")}
          {renderField("dateOfBirth")}
          {renderField("yearsExperience")}
          {renderField("offersInHand")}
          {renderField("comments", "candidate-span-2")}
        </div>
      </div>

      <div className="candidate-section">
        <div className="candidate-section-header">
          <h3 className="candidate-section-title">Current Company Info</h3>
          <div className="candidate-section-divider" />
        </div>
        <div className="candidate-type-toggle">
          <label className={`candidate-type-option${isFresher ? " active" : ""}`}>
            <input
              type="radio"
              name="candidateType"
              value="fresher"
              checked={isFresher}
              onChange={() => onChange("candidateType", "fresher")}
            />
            Fresher
          </label>
          <label className={`candidate-type-option${!isFresher ? " active" : ""}`}>
            <input
              type="radio"
              name="candidateType"
              value="experienced"
              checked={!isFresher}
              onChange={() => onChange("candidateType", "experienced")}
            />
            Experienced
          </label>
        </div>
        {!isFresher && (
          <div className="candidate-grid">
            {renderField("currentCompanyName")}
            {renderField("jobTitleRole")}
            {renderField("employmentType")}
            {renderField("noticePeriod")}
            {renderField("currentCtc")}
            {renderField("expectedCtc")}
          </div>
        )}
      </div>

      <div className="candidate-section">
        <div className="candidate-section-header">
          <h3 className="candidate-section-title">Add Skill set</h3>
          <div className="candidate-section-divider" />
        </div>

        {skills.map((skill, index) => (
          <div key={index} className="skill-row-container">
            <div className="candidate-grid">
              <div className="candidate-cell">
                <FormField
                  {...fieldMap.primarySkill}
                  value={skill.primarySkill}
                  onChange={(_, value) => handleSkillChange(index, "primarySkill", value)}
                  formData={formData}
                  hideLabel={index > 0}
                />
              </div>
              <div className="candidate-cell skill-split-cell">
                <div className="skill-split-fields">
                  <FormField
                    {...fieldMap.skillExperienceLevel}
                    value={skill.skillExperienceLevel}
                    onChange={(_, value) => handleSkillChange(index, "skillExperienceLevel", value)}
                    formData={formData}
                    hideLabel={index > 0}
                  />
                  <FormField
                    {...fieldMap.skillExperienceYears}
                    value={skill.skillExperienceYears}
                    onChange={(_, value) => handleSkillChange(index, "skillExperienceYears", value)}
                    formData={formData}
                    hideLabel={index > 0}
                  />
                </div>
              </div>
              <div className="candidate-cell skill-split-cell">
                <div className="skill-split-fields skill-rating-comments-fields">
                  <div className="form-field skill-rating-field">
                    {index === 0 && (
                      <label>
                        {fieldMap.skillRating?.label || "Ratings *"}
                      </label>
                    )}
                    <div className="skill-rating-stars" role="radiogroup" aria-label="Skill rating">
                      {[1, 2, 3, 4, 5].map((starValue) => {
                        const currentRating = Number.parseInt(String(skill.skillRating || "0"), 10);
                        const isActive = Number.isFinite(currentRating) && starValue <= currentRating;

                        return (
                          <button
                            key={starValue}
                            type="button"
                            className={`skill-rating-star${isActive ? " active" : ""}`}
                            onClick={() => handleSkillChange(index, "skillRating", String(starValue))}
                            aria-label={`Set rating ${starValue}`}
                            aria-pressed={isActive}
                            title={`${starValue} star${starValue > 1 ? "s" : ""}`}
                          >
                            ★
                          </button>
                        );
                      })}
                    </div>
                    {index === 0 && validationErrors.skillRating && (
                      <div className="error-message">{validationErrors.skillRating}</div>
                    )}
                  </div>
                  <FormField
                    {...fieldMap.skillComments}
                    value={skill.skillComments}
                    onChange={(_, value) => handleSkillChange(index, "skillComments", value)}
                    formData={formData}
                    hideLabel={index > 0}
                  />
                </div>
                {skills.length > 1 && (
                  <button
                    type="button"
                    className="remove-skill-button"
                    onClick={() => handleRemoveField(index)}
                    title="Remove Skill"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            {(skill.enableSecondarySkill || skill.secondarySkill) && (
              <div className="candidate-grid secondary-skill-grid">
                <div className="candidate-cell">
                  {fieldMap.secondarySkill && (
                    <FormField
                      {...fieldMap.secondarySkill}
                      value={skill.secondarySkill || ""}
                      onChange={(_, value) => handleSkillChange(index, "secondarySkill", value)}
                      formData={formData}
                      hideLabel={index > 0}
                    />
                  )}
                </div>
                <div className="candidate-cell skill-split-cell">
                  <div className="skill-split-fields">
                    <FormField
                      {...fieldMap.secondarySkillExperienceLevel}
                      value={skill.secondarySkillExperienceLevel || ""}
                      onChange={(_, value) => handleSkillChange(index, "secondarySkillExperienceLevel", value)}
                      formData={formData}
                      hideLabel={index > 0}
                    />
                    <FormField
                      {...fieldMap.secondarySkillExperienceYears}
                      value={skill.secondarySkillExperienceYears || ""}
                      onChange={(_, value) => handleSkillChange(index, "secondarySkillExperienceYears", value)}
                      formData={formData}
                      hideLabel={index > 0}
                    />
                  </div>
                </div>
                <div className="candidate-cell skill-split-cell">
                  <div className="skill-split-fields skill-rating-comments-fields">
                    <div className="form-field skill-rating-field">
                      {index === 0 && (
                        <label>
                          {fieldMap.secondarySkillRating?.label || "Secondary Ratings"}
                        </label>
                      )}
                      <div className="skill-rating-stars" role="radiogroup" aria-label="Secondary skill rating">
                        {[1, 2, 3, 4, 5].map((starValue) => {
                          const currentRating = Number.parseInt(String(skill.secondarySkillRating || "0"), 10);
                          const isActive = Number.isFinite(currentRating) && starValue <= currentRating;

                          return (
                            <button
                              key={`secondary-${starValue}`}
                              type="button"
                              className={`skill-rating-star${isActive ? " active" : ""}`}
                              onClick={() => handleSkillChange(index, "secondarySkillRating", String(starValue))}
                              aria-label={`Set secondary rating ${starValue}`}
                              aria-pressed={isActive}
                              title={`${starValue} star${starValue > 1 ? "s" : ""}`}
                            >
                              ★
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <FormField
                      {...fieldMap.secondarySkillComments}
                      value={skill.secondarySkillComments || ""}
                      onChange={(_, value) => handleSkillChange(index, "secondarySkillComments", value)}
                      formData={formData}
                      hideLabel={index > 0}
                    />
                  </div>
                </div>
                <div className="candidate-cell secondary-skill-actions-cell">
                  <button
                    type="button"
                    className="secondary-skill-toggle remove"
                    onClick={() => toggleSecondarySkill(index, false)}
                  >
                    Remove Secondary Skill
                  </button>
                </div>
              </div>
            )}

            {!(skill.enableSecondarySkill || skill.secondarySkill) && (
              <div className="secondary-skill-actions">
                <button
                  type="button"
                  className="secondary-skill-toggle"
                  onClick={() => toggleSecondarySkill(index, true)}
                >
                  Add Secondary Skill (Optional)
                </button>
              </div>
            )}
          </div>
        ))}

        <div className="candidate-section-actions">
          <button
            type="button"
            className={`add-skill-button ${isAddButtonDisabled ? 'disabled' : ''}`}
            onClick={handleAddField}
            disabled={isAddButtonDisabled}
          >
            Add Primary Skill
          </button>
        </div>
      </div>

      <div className="candidate-section">
        <div className="candidate-section-header">
          <h3 className="candidate-section-title">Source Info</h3>
          <div className="candidate-section-divider" />
        </div>
        <div className="candidate-grid source-info-grid">
          {renderField("sourceName", "dropdown-up")}
          {renderField("recruiterId", "dropdown-up")}
          {renderField("sourcedDate")}
        </div>
      </div>
    </div>
  );
};

export default CandidateBasicInfoStep;
