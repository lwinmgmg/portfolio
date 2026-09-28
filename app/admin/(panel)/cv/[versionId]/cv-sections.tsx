"use client";

import type { ReactNode } from "react";

import {
  emptyCertification,
  emptyEducation,
  emptyExperience,
  emptyLanguage,
  emptyLink,
  emptyOtherSection,
  emptyProject,
  emptySkillGroup,
  emptyTextToNull,
  moveItem,
} from "@/app/admin/(panel)/cv/[versionId]/cv-form";
import { cvFieldMessage } from "@/server/cv/cv-issues";
import type { CvData, CvFieldIssue, CvProfile } from "@/server/domain/cv";

const controlClass =
  "w-full border border-gray-300 bg-white px-2 py-1 text-base text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 read-only:bg-gray-100";
const secondaryButton =
  "w-fit border border-gray-400 bg-white px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50";

export type CvSectionsProps = {
  data: CvData;
  issues: readonly CvFieldIssue[];
  readOnly: boolean;
  onChange: (data: CvData) => void;
};

export function CvSections({ data, issues, readOnly, onChange }: CvSectionsProps) {
  function updateProfile(patch: Partial<CvProfile>) {
    onChange({ ...data, profile: { ...data.profile, ...patch } });
  }

  return (
    <div className="space-y-3">
      <Section title="Profile">
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Full name"
            path="profile.fullName"
            value={data.profile.fullName}
            issues={issues}
            readOnly={readOnly}
            onChange={(fullName) => updateProfile({ fullName })}
          />
          <TextField
            label="Headline"
            path="profile.headline"
            value={data.profile.headline}
            issues={issues}
            readOnly={readOnly}
            onChange={(headline) => updateProfile({ headline })}
          />
          <TextField
            label="Location"
            path="profile.location"
            value={data.profile.location ?? ""}
            issues={issues}
            readOnly={readOnly}
            onChange={(value) => updateProfile({ location: emptyTextToNull(value) })}
          />
          <TextField
            label="Email"
            path="profile.email"
            value={data.profile.email ?? ""}
            issues={issues}
            readOnly={readOnly}
            onChange={(value) => updateProfile({ email: emptyTextToNull(value) })}
          />
          <TextField
            label="Phone"
            path="profile.phone"
            value={data.profile.phone ?? ""}
            issues={issues}
            readOnly={readOnly}
            onChange={(value) => updateProfile({ phone: emptyTextToNull(value) })}
          />
        </div>
        <TextField
          label="Summary"
          path="profile.summary"
          value={data.profile.summary ?? ""}
          issues={issues}
          readOnly={readOnly}
          multiline
          onChange={(value) => updateProfile({ summary: emptyTextToNull(value) })}
        />
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Links</h3>
          {data.profile.links.length === 0 ? <p className="text-sm">None yet.</p> : null}
          {data.profile.links.map((link, index) => (
            <div key={`link-${index}`} className="space-y-2 border border-gray-200 p-3">
              <ItemActions
                index={index}
                total={data.profile.links.length}
                label="link"
                readOnly={readOnly}
                onMove={(direction) =>
                  updateProfile({ links: moveItem(data.profile.links, index, direction) })
                }
                onRemove={() =>
                  updateProfile({
                    links: data.profile.links.filter((_, itemIndex) => itemIndex !== index),
                  })
                }
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                  label="Label"
                  path={`profile.links.${index}.label`}
                  value={link.label}
                  issues={issues}
                  readOnly={readOnly}
                  onChange={(label) =>
                    updateProfile({
                      links: data.profile.links.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, label } : item,
                      ),
                    })
                  }
                />
                <TextField
                  label="URL"
                  path={`profile.links.${index}.url`}
                  value={link.url}
                  issues={issues}
                  readOnly={readOnly}
                  onChange={(url) =>
                    updateProfile({
                      links: data.profile.links.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, url } : item,
                      ),
                    })
                  }
                />
              </div>
            </div>
          ))}
          {readOnly ? null : (
            <button
              type="button"
              className={secondaryButton}
              onClick={() => updateProfile({ links: [...data.profile.links, emptyLink()] })}
            >
              Add link
            </button>
          )}
        </div>
      </Section>

      <ArraySection
        title="Experience"
        emptyLabel="Add experience"
        readOnly={readOnly}
        items={data.experience}
        onAdd={() => onChange({ ...data, experience: [...data.experience, emptyExperience()] })}
        onMove={(index, direction) =>
          onChange({ ...data, experience: moveItem(data.experience, index, direction) })
        }
        onRemove={(index) =>
          onChange({
            ...data,
            experience: data.experience.filter((_, itemIndex) => itemIndex !== index),
          })
        }
        renderItem={(item, index) => (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label="Company"
                path={`experience.${index}.company`}
                value={item.company}
                issues={issues}
                readOnly={readOnly}
                onChange={(company) =>
                  onChange({
                    ...data,
                    experience: data.experience.map((entry, itemIndex) =>
                      itemIndex === index ? { ...entry, company } : entry,
                    ),
                  })
                }
              />
              <TextField
                label="Role"
                path={`experience.${index}.role`}
                value={item.role}
                issues={issues}
                readOnly={readOnly}
                onChange={(role) =>
                  onChange({
                    ...data,
                    experience: data.experience.map((entry, itemIndex) =>
                      itemIndex === index ? { ...entry, role } : entry,
                    ),
                  })
                }
              />
              <TextField
                label="Location"
                path={`experience.${index}.location`}
                value={item.location ?? ""}
                issues={issues}
                readOnly={readOnly}
                onChange={(value) =>
                  onChange({
                    ...data,
                    experience: data.experience.map((entry, itemIndex) =>
                      itemIndex === index ? { ...entry, location: emptyTextToNull(value) } : entry,
                    ),
                  })
                }
              />
              <TextField
                label="Employment type"
                path={`experience.${index}.employmentType`}
                value={item.employmentType ?? ""}
                issues={issues}
                readOnly={readOnly}
                onChange={(value) =>
                  onChange({
                    ...data,
                    experience: data.experience.map((entry, itemIndex) =>
                      itemIndex === index
                        ? { ...entry, employmentType: emptyTextToNull(value) }
                        : entry,
                    ),
                  })
                }
              />
              <TextField
                label="Start"
                path={`experience.${index}.startDate`}
                value={item.startDate ?? ""}
                issues={issues}
                readOnly={readOnly}
                placeholder="YYYY-MM"
                onChange={(value) =>
                  onChange({
                    ...data,
                    experience: data.experience.map((entry, itemIndex) =>
                      itemIndex === index ? { ...entry, startDate: emptyTextToNull(value) } : entry,
                    ),
                  })
                }
              />
              <TextField
                label="End"
                path={`experience.${index}.endDate`}
                value={item.endDate ?? ""}
                issues={issues}
                readOnly={readOnly}
                placeholder="YYYY-MM"
                onChange={(value) =>
                  onChange({
                    ...data,
                    experience: data.experience.map((entry, itemIndex) =>
                      itemIndex === index ? { ...entry, endDate: emptyTextToNull(value) } : entry,
                    ),
                  })
                }
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={item.current}
                disabled={readOnly}
                onChange={(event) =>
                  onChange({
                    ...data,
                    experience: data.experience.map((entry, itemIndex) =>
                      itemIndex === index ? { ...entry, current: event.target.checked } : entry,
                    ),
                  })
                }
              />
              Current role
            </label>
            <TextField
              label="Summary"
              path={`experience.${index}.summary`}
              value={item.summary ?? ""}
              issues={issues}
              readOnly={readOnly}
              multiline
              onChange={(value) =>
                onChange({
                  ...data,
                  experience: data.experience.map((entry, itemIndex) =>
                    itemIndex === index ? { ...entry, summary: emptyTextToNull(value) } : entry,
                  ),
                })
              }
            />
            <LineField
              label="Highlights"
              path={`experience.${index}.highlights`}
              value={item.highlights}
              issues={issues}
              readOnly={readOnly}
              onChange={(highlights) =>
                onChange({
                  ...data,
                  experience: data.experience.map((entry, itemIndex) =>
                    itemIndex === index ? { ...entry, highlights } : entry,
                  ),
                })
              }
            />
            <LineField
              label="Technologies"
              path={`experience.${index}.technologies`}
              value={item.technologies}
              issues={issues}
              readOnly={readOnly}
              onChange={(technologies) =>
                onChange({
                  ...data,
                  experience: data.experience.map((entry, itemIndex) =>
                    itemIndex === index ? { ...entry, technologies } : entry,
                  ),
                })
              }
            />
          </>
        )}
      />

      <ArraySection
        title="Projects"
        emptyLabel="Add project"
        readOnly={readOnly}
        items={data.projects}
        onAdd={() => onChange({ ...data, projects: [...data.projects, emptyProject()] })}
        onMove={(index, direction) =>
          onChange({ ...data, projects: moveItem(data.projects, index, direction) })
        }
        onRemove={(index) =>
          onChange({ ...data, projects: data.projects.filter((_, itemIndex) => itemIndex !== index) })
        }
        renderItem={(item, index) => (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label="Name"
                path={`projects.${index}.name`}
                value={item.name}
                issues={issues}
                readOnly={readOnly}
                onChange={(name) =>
                  onChange({
                    ...data,
                    projects: data.projects.map((entry, itemIndex) =>
                      itemIndex === index ? { ...entry, name } : entry,
                    ),
                  })
                }
              />
              <TextField
                label="Role"
                path={`projects.${index}.role`}
                value={item.role ?? ""}
                issues={issues}
                readOnly={readOnly}
                onChange={(value) =>
                  onChange({
                    ...data,
                    projects: data.projects.map((entry, itemIndex) =>
                      itemIndex === index ? { ...entry, role: emptyTextToNull(value) } : entry,
                    ),
                  })
                }
              />
              <TextField
                label="URL"
                path={`projects.${index}.url`}
                value={item.url ?? ""}
                issues={issues}
                readOnly={readOnly}
                onChange={(value) =>
                  onChange({
                    ...data,
                    projects: data.projects.map((entry, itemIndex) =>
                      itemIndex === index ? { ...entry, url: emptyTextToNull(value) } : entry,
                    ),
                  })
                }
              />
              <TextField
                label="Start"
                path={`projects.${index}.startDate`}
                value={item.startDate ?? ""}
                issues={issues}
                readOnly={readOnly}
                placeholder="YYYY-MM"
                onChange={(value) =>
                  onChange({
                    ...data,
                    projects: data.projects.map((entry, itemIndex) =>
                      itemIndex === index ? { ...entry, startDate: emptyTextToNull(value) } : entry,
                    ),
                  })
                }
              />
              <TextField
                label="End"
                path={`projects.${index}.endDate`}
                value={item.endDate ?? ""}
                issues={issues}
                readOnly={readOnly}
                placeholder="YYYY-MM"
                onChange={(value) =>
                  onChange({
                    ...data,
                    projects: data.projects.map((entry, itemIndex) =>
                      itemIndex === index ? { ...entry, endDate: emptyTextToNull(value) } : entry,
                    ),
                  })
                }
              />
            </div>
            <TextField
              label="Summary"
              path={`projects.${index}.summary`}
              value={item.summary}
              issues={issues}
              readOnly={readOnly}
              multiline
              onChange={(summary) =>
                onChange({
                  ...data,
                  projects: data.projects.map((entry, itemIndex) =>
                    itemIndex === index ? { ...entry, summary } : entry,
                  ),
                })
              }
            />
            <LineField
              label="Highlights"
              path={`projects.${index}.highlights`}
              value={item.highlights}
              issues={issues}
              readOnly={readOnly}
              onChange={(highlights) =>
                onChange({
                  ...data,
                  projects: data.projects.map((entry, itemIndex) =>
                    itemIndex === index ? { ...entry, highlights } : entry,
                  ),
                })
              }
            />
            <LineField
              label="Technologies"
              path={`projects.${index}.technologies`}
              value={item.technologies}
              issues={issues}
              readOnly={readOnly}
              onChange={(technologies) =>
                onChange({
                  ...data,
                  projects: data.projects.map((entry, itemIndex) =>
                    itemIndex === index ? { ...entry, technologies } : entry,
                  ),
                })
              }
            />
          </>
        )}
      />

      <ArraySection
        title="Education"
        emptyLabel="Add education"
        readOnly={readOnly}
        items={data.education}
        onAdd={() => onChange({ ...data, education: [...data.education, emptyEducation()] })}
        onMove={(index, direction) =>
          onChange({ ...data, education: moveItem(data.education, index, direction) })
        }
        onRemove={(index) =>
          onChange({
            ...data,
            education: data.education.filter((_, itemIndex) => itemIndex !== index),
          })
        }
        renderItem={(item, index) => (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label="Institution"
                path={`education.${index}.institution`}
                value={item.institution}
                issues={issues}
                readOnly={readOnly}
                onChange={(institution) =>
                  onChange({
                    ...data,
                    education: data.education.map((entry, itemIndex) =>
                      itemIndex === index ? { ...entry, institution } : entry,
                    ),
                  })
                }
              />
              <TextField
                label="Degree"
                path={`education.${index}.degree`}
                value={item.degree ?? ""}
                issues={issues}
                readOnly={readOnly}
                onChange={(value) =>
                  onChange({
                    ...data,
                    education: data.education.map((entry, itemIndex) =>
                      itemIndex === index ? { ...entry, degree: emptyTextToNull(value) } : entry,
                    ),
                  })
                }
              />
              <TextField
                label="Field"
                path={`education.${index}.field`}
                value={item.field ?? ""}
                issues={issues}
                readOnly={readOnly}
                onChange={(value) =>
                  onChange({
                    ...data,
                    education: data.education.map((entry, itemIndex) =>
                      itemIndex === index ? { ...entry, field: emptyTextToNull(value) } : entry,
                    ),
                  })
                }
              />
              <TextField
                label="Start"
                path={`education.${index}.startDate`}
                value={item.startDate ?? ""}
                issues={issues}
                readOnly={readOnly}
                placeholder="YYYY-MM"
                onChange={(value) =>
                  onChange({
                    ...data,
                    education: data.education.map((entry, itemIndex) =>
                      itemIndex === index ? { ...entry, startDate: emptyTextToNull(value) } : entry,
                    ),
                  })
                }
              />
              <TextField
                label="End"
                path={`education.${index}.endDate`}
                value={item.endDate ?? ""}
                issues={issues}
                readOnly={readOnly}
                placeholder="YYYY-MM"
                onChange={(value) =>
                  onChange({
                    ...data,
                    education: data.education.map((entry, itemIndex) =>
                      itemIndex === index ? { ...entry, endDate: emptyTextToNull(value) } : entry,
                    ),
                  })
                }
              />
            </div>
            <LineField
              label="Details"
              path={`education.${index}.details`}
              value={item.details}
              issues={issues}
              readOnly={readOnly}
              onChange={(details) =>
                onChange({
                  ...data,
                  education: data.education.map((entry, itemIndex) =>
                    itemIndex === index ? { ...entry, details } : entry,
                  ),
                })
              }
            />
          </>
        )}
      />

      <ArraySection
        title="Skills"
        emptyLabel="Add skill group"
        readOnly={readOnly}
        items={data.skills}
        onAdd={() => onChange({ ...data, skills: [...data.skills, emptySkillGroup()] })}
        onMove={(index, direction) =>
          onChange({ ...data, skills: moveItem(data.skills, index, direction) })
        }
        onRemove={(index) =>
          onChange({ ...data, skills: data.skills.filter((_, itemIndex) => itemIndex !== index) })
        }
        renderItem={(item, index) => (
          <>
            <TextField
              label="Category"
              path={`skills.${index}.category`}
              value={item.category}
              issues={issues}
              readOnly={readOnly}
              onChange={(category) =>
                onChange({
                  ...data,
                  skills: data.skills.map((entry, itemIndex) =>
                    itemIndex === index ? { ...entry, category } : entry,
                  ),
                })
              }
            />
            <LineField
              label="Items"
              path={`skills.${index}.items`}
              value={item.items}
              issues={issues}
              readOnly={readOnly}
              onChange={(items) =>
                onChange({
                  ...data,
                  skills: data.skills.map((entry, itemIndex) =>
                    itemIndex === index ? { ...entry, items } : entry,
                  ),
                })
              }
            />
          </>
        )}
      />

      <ArraySection
        title="Certifications"
        emptyLabel="Add certification"
        readOnly={readOnly}
        items={data.certifications}
        onAdd={() =>
          onChange({ ...data, certifications: [...data.certifications, emptyCertification()] })
        }
        onMove={(index, direction) =>
          onChange({
            ...data,
            certifications: moveItem(data.certifications, index, direction),
          })
        }
        onRemove={(index) =>
          onChange({
            ...data,
            certifications: data.certifications.filter((_, itemIndex) => itemIndex !== index),
          })
        }
        renderItem={(item, index) => (
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="Name"
              path={`certifications.${index}.name`}
              value={item.name}
              issues={issues}
              readOnly={readOnly}
              onChange={(name) =>
                onChange({
                  ...data,
                  certifications: data.certifications.map((entry, itemIndex) =>
                    itemIndex === index ? { ...entry, name } : entry,
                  ),
                })
              }
            />
            <TextField
              label="Issuer"
              path={`certifications.${index}.issuer`}
              value={item.issuer ?? ""}
              issues={issues}
              readOnly={readOnly}
              onChange={(value) =>
                onChange({
                  ...data,
                  certifications: data.certifications.map((entry, itemIndex) =>
                    itemIndex === index ? { ...entry, issuer: emptyTextToNull(value) } : entry,
                  ),
                })
              }
            />
            <TextField
              label="Date"
              path={`certifications.${index}.date`}
              value={item.date ?? ""}
              issues={issues}
              readOnly={readOnly}
              placeholder="YYYY-MM"
              onChange={(value) =>
                onChange({
                  ...data,
                  certifications: data.certifications.map((entry, itemIndex) =>
                    itemIndex === index ? { ...entry, date: emptyTextToNull(value) } : entry,
                  ),
                })
              }
            />
            <TextField
              label="URL"
              path={`certifications.${index}.url`}
              value={item.url ?? ""}
              issues={issues}
              readOnly={readOnly}
              onChange={(value) =>
                onChange({
                  ...data,
                  certifications: data.certifications.map((entry, itemIndex) =>
                    itemIndex === index ? { ...entry, url: emptyTextToNull(value) } : entry,
                  ),
                })
              }
            />
          </div>
        )}
      />

      <ArraySection
        title="Languages"
        emptyLabel="Add language"
        readOnly={readOnly}
        items={data.languages}
        onAdd={() => onChange({ ...data, languages: [...data.languages, emptyLanguage()] })}
        onMove={(index, direction) =>
          onChange({ ...data, languages: moveItem(data.languages, index, direction) })
        }
        onRemove={(index) =>
          onChange({
            ...data,
            languages: data.languages.filter((_, itemIndex) => itemIndex !== index),
          })
        }
        renderItem={(item, index) => (
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="Name"
              path={`languages.${index}.name`}
              value={item.name}
              issues={issues}
              readOnly={readOnly}
              onChange={(name) =>
                onChange({
                  ...data,
                  languages: data.languages.map((entry, itemIndex) =>
                    itemIndex === index ? { ...entry, name } : entry,
                  ),
                })
              }
            />
            <TextField
              label="Proficiency"
              path={`languages.${index}.proficiency`}
              value={item.proficiency ?? ""}
              issues={issues}
              readOnly={readOnly}
              onChange={(value) =>
                onChange({
                  ...data,
                  languages: data.languages.map((entry, itemIndex) =>
                    itemIndex === index ? { ...entry, proficiency: emptyTextToNull(value) } : entry,
                  ),
                })
              }
            />
          </div>
        )}
      />

      <ArraySection
        title="Other sections"
        emptyLabel="Add section"
        readOnly={readOnly}
        items={data.otherSections}
        onAdd={() =>
          onChange({ ...data, otherSections: [...data.otherSections, emptyOtherSection()] })
        }
        onMove={(index, direction) =>
          onChange({ ...data, otherSections: moveItem(data.otherSections, index, direction) })
        }
        onRemove={(index) =>
          onChange({
            ...data,
            otherSections: data.otherSections.filter((_, itemIndex) => itemIndex !== index),
          })
        }
        renderItem={(item, index) => (
          <>
            <TextField
              label="Title"
              path={`otherSections.${index}.title`}
              value={item.title}
              issues={issues}
              readOnly={readOnly}
              onChange={(title) =>
                onChange({
                  ...data,
                  otherSections: data.otherSections.map((entry, itemIndex) =>
                    itemIndex === index ? { ...entry, title } : entry,
                  ),
                })
              }
            />
            <LineField
              label="Items"
              path={`otherSections.${index}.items`}
              value={item.items}
              issues={issues}
              readOnly={readOnly}
              onChange={(items) =>
                onChange({
                  ...data,
                  otherSections: data.otherSections.map((entry, itemIndex) =>
                    itemIndex === index ? { ...entry, items } : entry,
                  ),
                })
              }
            />
          </>
        )}
      />
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details open className="border border-gray-300 bg-white">
      <summary className="cursor-pointer px-3 py-2 font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
        {title}
      </summary>
      <div className="space-y-3 border-t border-gray-200 p-3">{children}</div>
    </details>
  );
}

function ArraySection<T extends { id: string }>({
  title,
  emptyLabel,
  readOnly,
  items,
  onAdd,
  onMove,
  onRemove,
  renderItem,
}: {
  title: string;
  emptyLabel: string;
  readOnly: boolean;
  items: readonly T[];
  onAdd: () => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (index: number) => void;
  renderItem: (item: T, index: number) => ReactNode;
}) {
  return (
    <Section title={title}>
      {items.length === 0 ? <p className="text-sm">None yet.</p> : null}
      {items.map((item, index) => (
        <article key={item.id} className="space-y-3 border border-gray-200 p-3">
          <ItemActions
            index={index}
            total={items.length}
            label={title.toLowerCase()}
            readOnly={readOnly}
            onMove={(direction) => onMove(index, direction)}
            onRemove={() => onRemove(index)}
          />
          {renderItem(item, index)}
        </article>
      ))}
      {readOnly ? null : (
        <button type="button" className={secondaryButton} onClick={onAdd}>
          {emptyLabel}
        </button>
      )}
    </Section>
  );
}

function ItemActions({
  index,
  total,
  label,
  readOnly,
  onMove,
  onRemove,
}: {
  index: number;
  total: number;
  label: string;
  readOnly: boolean;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  if (readOnly) return null;
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        className={secondaryButton}
        disabled={index === 0}
        onClick={() => onMove(-1)}
      >
        Move up
      </button>
      <button
        type="button"
        className={secondaryButton}
        disabled={index === total - 1}
        onClick={() => onMove(1)}
      >
        Move down
      </button>
      <button type="button" className={secondaryButton} onClick={onRemove}>
        Remove {label}
      </button>
    </div>
  );
}

function TextField({
  label,
  path,
  value,
  issues,
  readOnly,
  multiline = false,
  placeholder,
  onChange,
}: {
  label: string;
  path: string;
  value: string;
  issues: readonly CvFieldIssue[];
  readOnly: boolean;
  multiline?: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  const error = cvFieldMessage(issues, path);
  const describedBy = error ? `${path}-error` : undefined;
  return (
    <label className="flex flex-col gap-1 text-sm">
      {label}
      {multiline ? (
        <textarea
          value={value}
          readOnly={readOnly}
          rows={4}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
          className={controlClass}
        />
      ) : (
        <input
          value={value}
          readOnly={readOnly}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
          className={controlClass}
        />
      )}
      {error ? (
        <span id={`${path}-error`} className="text-red-700">
          {error}
        </span>
      ) : null}
    </label>
  );
}

function LineField({
  label,
  path,
  value,
  issues,
  readOnly,
  onChange,
}: {
  label: string;
  path: string;
  value: readonly string[];
  issues: readonly CvFieldIssue[];
  readOnly: boolean;
  onChange: (value: string[]) => void;
}) {
  return (
    <TextField
      label={`${label} (one item per line)`}
      path={path}
      value={value.join("\n")}
      issues={issues}
      readOnly={readOnly}
      multiline
      onChange={(text) => onChange(text.split("\n"))}
    />
  );
}
