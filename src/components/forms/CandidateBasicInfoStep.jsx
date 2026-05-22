import React, { useEffect, useMemo } from "react";
import FormField from "./FormField";

const normalizeText = (value) => String(value || "").replace(/\s+/g, " ").trim();

const toLower = (value) => normalizeText(value).toLowerCase();

const getFileLike = (value) => {
  if (!value) return null;
  if (typeof File !== "undefined" && value instanceof File) return value;
  if (value?.file && typeof File !== "undefined" && value.file instanceof File) return value.file;
  if (value?.file && typeof value.file === "object") return value.file;
  if (typeof value === "object" && typeof value.name === "string") return value;
  return null;
};

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

        const nameLine = extractedText.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
        if (nameLine && !normalizeText(formData.firstName) && !normalizeText(formData.lastName)) {
          const cleanedName = nameLine.replace(/[^A-Za-z\s.-]/g, " ").replace(/\s+/g, " ").trim();
          const parts = cleanedName.split(" ").filter(Boolean);
          if (parts.length >= 2) {
            updates.firstName = parts[0];
            updates.lastName = parts.slice(1).join(" ");
          }
        }

        if (!normalizeText(formData.primarySkill) && Array.isArray(fieldMap.primarySkill?.options)) {
          const matchedPrimarySkill = fieldMap.primarySkill.options.find((option) => {
            const label = toLower(option?.label || option?.value);
            const value = toLower(option?.value);
            return (label && normalizedLower.includes(label)) || (value && normalizedLower.includes(value));
          });

          if (matchedPrimarySkill?.value) {
            updates.primarySkill = matchedPrimarySkill.value;
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
