"use client";

import {
  byId,
  CvFieldContext,
  ItemList,
  OptionalTextField,
  Section,
  TextField,
} from "@/app/admin/(panel)/cv/[versionId]/cv-fields";
import {
  emptyCertification,
  emptyEducation,
  emptyExperience,
  emptyLanguage,
  emptyLink,
  emptyOtherSection,
  emptyProject,
  emptySkillGroup,
} from "@/app/admin/(panel)/cv/[versionId]/cv-form";
import {
  CertificationFields,
  EducationFields,
  ExperienceFields,
  LanguageFields,
  LinkFields,
  OtherSectionFields,
  ProjectFields,
  SkillGroupFields,
} from "@/app/admin/(panel)/cv/[versionId]/cv-item-fields";
import type { CvData, CvFieldIssue, CvProfile } from "@/server/domain/cv";

export type CvSectionsProps = {
  data: CvData;
  issues: readonly CvFieldIssue[];
  readOnly: boolean;
  onChange: (data: CvData) => void;
};

export function CvSections({ data, issues, readOnly, onChange }: CvSectionsProps) {
  function setSection<K extends keyof CvData>(key: K) {
    return (value: CvData[K]) => onChange({ ...data, [key]: value });
  }

  return (
    <CvFieldContext value={{ issues, readOnly }}>
      <div className="space-y-4">
        <ProfileSection profile={data.profile} onChange={setSection("profile")} />

        <Section title="Experience">
          <ItemList
            itemLabel="experience"
            addLabel="Add experience"
            path="experience"
            items={data.experience}
            create={emptyExperience}
            getKey={byId}
            onChange={setSection("experience")}
          >
            {(props) => <ExperienceFields {...props} />}
          </ItemList>
        </Section>

        <Section title="Projects">
          <ItemList
            itemLabel="project"
            addLabel="Add project"
            path="projects"
            items={data.projects}
            create={emptyProject}
            getKey={byId}
            onChange={setSection("projects")}
          >
            {(props) => <ProjectFields {...props} />}
          </ItemList>
        </Section>

        <Section title="Education">
          <ItemList
            itemLabel="education"
            addLabel="Add education"
            path="education"
            items={data.education}
            create={emptyEducation}
            getKey={byId}
            onChange={setSection("education")}
          >
            {(props) => <EducationFields {...props} />}
          </ItemList>
        </Section>

        <Section title="Skills">
          <ItemList
            itemLabel="skill group"
            addLabel="Add skill group"
            path="skills"
            items={data.skills}
            create={emptySkillGroup}
            getKey={byId}
            onChange={setSection("skills")}
          >
            {(props) => <SkillGroupFields {...props} />}
          </ItemList>
        </Section>

        <Section title="Certifications">
          <ItemList
            itemLabel="certification"
            addLabel="Add certification"
            path="certifications"
            items={data.certifications}
            create={emptyCertification}
            getKey={byId}
            onChange={setSection("certifications")}
          >
            {(props) => <CertificationFields {...props} />}
          </ItemList>
        </Section>

        <Section title="Languages">
          <ItemList
            itemLabel="language"
            addLabel="Add language"
            path="languages"
            items={data.languages}
            create={emptyLanguage}
            getKey={byId}
            onChange={setSection("languages")}
          >
            {(props) => <LanguageFields {...props} />}
          </ItemList>
        </Section>

        <Section title="Other sections">
          <ItemList
            itemLabel="section"
            addLabel="Add section"
            path="otherSections"
            items={data.otherSections}
            create={emptyOtherSection}
            getKey={byId}
            onChange={setSection("otherSections")}
          >
            {(props) => <OtherSectionFields {...props} />}
          </ItemList>
        </Section>
      </div>
    </CvFieldContext>
  );
}

function ProfileSection({
  profile,
  onChange,
}: {
  profile: CvProfile;
  onChange: (profile: CvProfile) => void;
}) {
  function update(patch: Partial<CvProfile>) {
    onChange({ ...profile, ...patch });
  }

  return (
    <Section title="Profile">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Full name"
          path="profile.fullName"
          value={profile.fullName}
          onChange={(fullName) => update({ fullName })}
        />
        <TextField
          label="Headline"
          path="profile.headline"
          value={profile.headline}
          onChange={(headline) => update({ headline })}
        />
        <OptionalTextField
          label="Location"
          path="profile.location"
          value={profile.location}
          onChange={(location) => update({ location })}
        />
        <OptionalTextField
          label="Email"
          path="profile.email"
          value={profile.email}
          onChange={(email) => update({ email })}
        />
        <OptionalTextField
          label="Phone"
          path="profile.phone"
          value={profile.phone}
          onChange={(phone) => update({ phone })}
        />
      </div>
      <OptionalTextField
        label="Summary"
        path="profile.summary"
        value={profile.summary}
        multiline
        onChange={(summary) => update({ summary })}
      />
      <div className="space-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-700">
        <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Links</h3>
        {/* Links have no id in the CV schema (it is also the LLM extraction schema), so
            they are keyed by position. Moving a link moves focus with the position. */}
        <ItemList
          itemLabel="link"
          addLabel="Add link"
          path="profile.links"
          items={profile.links}
          create={emptyLink}
          getKey={(_, index) => `link-${index}`}
          onChange={(links) => update({ links })}
        >
          {(props) => <LinkFields {...props} />}
        </ItemList>
      </div>
    </Section>
  );
}
