import { assignIds } from "@/server/cv/cv-ids";
import type { CvData, CvExtraction } from "@/server/domain/cv";

export const sampleExtraction = {
  profile: {
    fullName: "Jane Doe",
    headline: "Senior Software Engineer",
    location: "Berlin, Germany",
    summary: "Builds reliable web products.",
    email: "jane@example.com",
    phone: null,
    links: [{ label: "GitHub", url: "https://github.com/janedoe" }],
  },
  experience: [
    {
      company: "Acme",
      role: "Senior Software Engineer",
      location: "Berlin",
      employmentType: "Full-time",
      startDate: "2021-04",
      endDate: null,
      current: true,
      summary: "Leads the platform team.",
      highlights: ["Shipped the billing rewrite.", "Cut p95 latency by 30%."],
      technologies: ["TypeScript", "MongoDB"],
    },
  ],
  projects: [
    {
      name: "Portfolio",
      role: "Author",
      url: "https://jane.example",
      startDate: "2020",
      endDate: "2020",
      summary: "Personal site.",
      details: "Server-rendered CV with a chat assistant.\n\nBuilt on the App Router.",
      highlights: ["Designed the CV page."],
      technologies: ["Next.js"],
    },
  ],
  education: [
    {
      institution: "TU Berlin",
      degree: "B.Sc. Computer Science",
      field: "Computer Science",
      startDate: "2016",
      endDate: "2019",
      details: ["Thesis on search."],
    },
  ],
  skills: [
    {
      category: "Languages",
      items: ["TypeScript", "Go"],
    },
  ],
  certifications: [
    {
      name: "AWS Certified Developer",
      issuer: "Amazon",
      date: "2022-06",
      url: null,
    },
  ],
  languages: [
    {
      name: "English",
      proficiency: "Native",
    },
  ],
  otherSections: [
    {
      title: "Volunteering",
      items: ["Mentor at a local code club."],
    },
  ],
} satisfies CvExtraction;

export const sampleCv: CvData = assignIds(sampleExtraction);
