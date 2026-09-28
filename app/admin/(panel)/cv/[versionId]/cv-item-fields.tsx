"use client";

import {
  CheckboxField,
  LineField,
  OptionalTextField,
  TextField,
  type ItemEditorProps,
} from "@/app/admin/(panel)/cv/[versionId]/cv-fields";
import type {
  CvCertification,
  CvEducation,
  CvExperience,
  CvLanguage,
  CvLink,
  CvOtherSection,
  CvProject,
  CvSkillGroup,
} from "@/server/domain/cv";

const MONTH = "YYYY-MM";

export function LinkFields({ item, path, update }: ItemEditorProps<CvLink>) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField
        label="Label"
        path={`${path}.label`}
        value={item.label}
        onChange={(label) => update({ label })}
      />
      <TextField label="URL" path={`${path}.url`} value={item.url} onChange={(url) => update({ url })} />
    </div>
  );
}

export function ExperienceFields({ item, path, update }: ItemEditorProps<CvExperience>) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Company"
          path={`${path}.company`}
          value={item.company}
          onChange={(company) => update({ company })}
        />
        <TextField
          label="Role"
          path={`${path}.role`}
          value={item.role}
          onChange={(role) => update({ role })}
        />
        <OptionalTextField
          label="Location"
          path={`${path}.location`}
          value={item.location}
          onChange={(location) => update({ location })}
        />
        <OptionalTextField
          label="Employment type"
          path={`${path}.employmentType`}
          value={item.employmentType}
          onChange={(employmentType) => update({ employmentType })}
        />
        <OptionalTextField
          label="Start"
          path={`${path}.startDate`}
          value={item.startDate}
          placeholder={MONTH}
          onChange={(startDate) => update({ startDate })}
        />
        <OptionalTextField
          label="End"
          path={`${path}.endDate`}
          value={item.endDate}
          placeholder={MONTH}
          onChange={(endDate) => update({ endDate })}
        />
      </div>
      <CheckboxField
        label="Current role"
        checked={item.current}
        onChange={(current) => update({ current })}
      />
      <OptionalTextField
        label="Summary"
        path={`${path}.summary`}
        value={item.summary}
        multiline
        onChange={(summary) => update({ summary })}
      />
      <LineField
        label="Highlights"
        path={`${path}.highlights`}
        value={item.highlights}
        onChange={(highlights) => update({ highlights })}
      />
      <LineField
        label="Technologies"
        path={`${path}.technologies`}
        value={item.technologies}
        onChange={(technologies) => update({ technologies })}
      />
    </>
  );
}

export function ProjectFields({ item, path, update }: ItemEditorProps<CvProject>) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Name"
          path={`${path}.name`}
          value={item.name}
          onChange={(name) => update({ name })}
        />
        <OptionalTextField
          label="Role"
          path={`${path}.role`}
          value={item.role}
          onChange={(role) => update({ role })}
        />
        <OptionalTextField
          label="URL"
          path={`${path}.url`}
          value={item.url}
          onChange={(url) => update({ url })}
        />
        <OptionalTextField
          label="Start"
          path={`${path}.startDate`}
          value={item.startDate}
          placeholder={MONTH}
          onChange={(startDate) => update({ startDate })}
        />
        <OptionalTextField
          label="End"
          path={`${path}.endDate`}
          value={item.endDate}
          placeholder={MONTH}
          onChange={(endDate) => update({ endDate })}
        />
      </div>
      <TextField
        label="Summary"
        path={`${path}.summary`}
        value={item.summary}
        multiline
        onChange={(summary) => update({ summary })}
      />
      <LineField
        label="Highlights"
        path={`${path}.highlights`}
        value={item.highlights}
        onChange={(highlights) => update({ highlights })}
      />
      <LineField
        label="Technologies"
        path={`${path}.technologies`}
        value={item.technologies}
        onChange={(technologies) => update({ technologies })}
      />
    </>
  );
}

export function EducationFields({ item, path, update }: ItemEditorProps<CvEducation>) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Institution"
          path={`${path}.institution`}
          value={item.institution}
          onChange={(institution) => update({ institution })}
        />
        <OptionalTextField
          label="Degree"
          path={`${path}.degree`}
          value={item.degree}
          onChange={(degree) => update({ degree })}
        />
        <OptionalTextField
          label="Field"
          path={`${path}.field`}
          value={item.field}
          onChange={(field) => update({ field })}
        />
        <OptionalTextField
          label="Start"
          path={`${path}.startDate`}
          value={item.startDate}
          placeholder={MONTH}
          onChange={(startDate) => update({ startDate })}
        />
        <OptionalTextField
          label="End"
          path={`${path}.endDate`}
          value={item.endDate}
          placeholder={MONTH}
          onChange={(endDate) => update({ endDate })}
        />
      </div>
      <LineField
        label="Details"
        path={`${path}.details`}
        value={item.details}
        onChange={(details) => update({ details })}
      />
    </>
  );
}

export function SkillGroupFields({ item, path, update }: ItemEditorProps<CvSkillGroup>) {
  return (
    <>
      <TextField
        label="Category"
        path={`${path}.category`}
        value={item.category}
        onChange={(category) => update({ category })}
      />
      <LineField
        label="Items"
        path={`${path}.items`}
        value={item.items}
        onChange={(items) => update({ items })}
      />
    </>
  );
}

export function CertificationFields({ item, path, update }: ItemEditorProps<CvCertification>) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField
        label="Name"
        path={`${path}.name`}
        value={item.name}
        onChange={(name) => update({ name })}
      />
      <OptionalTextField
        label="Issuer"
        path={`${path}.issuer`}
        value={item.issuer}
        onChange={(issuer) => update({ issuer })}
      />
      <OptionalTextField
        label="Date"
        path={`${path}.date`}
        value={item.date}
        placeholder={MONTH}
        onChange={(date) => update({ date })}
      />
      <OptionalTextField
        label="URL"
        path={`${path}.url`}
        value={item.url}
        onChange={(url) => update({ url })}
      />
    </div>
  );
}

export function LanguageFields({ item, path, update }: ItemEditorProps<CvLanguage>) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField
        label="Name"
        path={`${path}.name`}
        value={item.name}
        onChange={(name) => update({ name })}
      />
      <OptionalTextField
        label="Proficiency"
        path={`${path}.proficiency`}
        value={item.proficiency}
        onChange={(proficiency) => update({ proficiency })}
      />
    </div>
  );
}

export function OtherSectionFields({ item, path, update }: ItemEditorProps<CvOtherSection>) {
  return (
    <>
      <TextField
        label="Title"
        path={`${path}.title`}
        value={item.title}
        onChange={(title) => update({ title })}
      />
      <LineField
        label="Items"
        path={`${path}.items`}
        value={item.items}
        onChange={(items) => update({ items })}
      />
    </>
  );
}
