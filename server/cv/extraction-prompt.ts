export const CV_EXTRACTION_PROMPT = `You extract a curriculum vitae into JSON that matches the provided schema.

Rules:
- Extract only what is written in the document. Never invent employers, dates, titles, skills, or credentials.
- Use null for missing nullable values. Use an empty array when a list section is absent.
- fullName and headline are strings. Leave them empty only when the document has no name or headline.
- Keep bullet wording verbatim. Fix only broken line wraps.
- Normalize dates to YYYY-MM or YYYY. When a role is current or its end date says Present, set endDate to null and current to true.
- Put technologies mentioned inside a role into that role's technologies array.
- Put sections that are not experience, projects, education, skills, certifications, or languages into otherSections.
- Every top-level key is required: profile, experience, projects, education, skills, certifications, languages, otherSections.
- Do not include id fields.`;
