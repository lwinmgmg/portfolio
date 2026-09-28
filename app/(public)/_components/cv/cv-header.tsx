import { mailtoHref, safeWebUrl } from "@/app/(public)/_components/cv/cv-format";
import { CV_PROFILE_ID } from "@/app/(public)/_components/cv/cv-sections";
import { focusRing, textLink } from "@/app/(public)/_components/cv/cv-styles";
import type { CvProfile } from "@/server/domain/cv";

type ContactLink = { key: string; label: string; href: string; external: boolean };

function contactLinks(profile: CvProfile): ContactLink[] {
  const links: ContactLink[] = [];
  const email = mailtoHref(profile.email);
  if (email && profile.email) {
    links.push({ key: "email", label: profile.email.trim(), href: email, external: false });
  }
  profile.links.forEach((link, index) => {
    const href = safeWebUrl(link.url);
    if (!href) return;
    const label = link.label.trim() || new URL(href).host;
    links.push({ key: `link-${index}`, label, href, external: true });
  });
  return links;
}

export function CvHeader({ profile }: { profile: CvProfile }) {
  const links = contactLinks(profile);
  return (
    <header id={CV_PROFILE_ID} className="scroll-mt-12">
      <h1 className="text-4xl font-semibold tracking-tight text-zinc-950 sm:text-5xl dark:text-zinc-50">
        {profile.fullName}
      </h1>
      {profile.headline.trim() ? (
        <p className="mt-3 text-lg text-zinc-600 sm:text-xl dark:text-zinc-400">
          {profile.headline}
        </p>
      ) : null}
      {profile.location?.trim() ? (
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">{profile.location}</p>
      ) : null}
      <div className="mt-8 flex flex-col gap-5 sm:flex-row sm:flex-wrap sm:items-center">
        <a
          href="/cv/download"
          download
          className={`${focusRing} inline-flex w-fit items-center rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow-sm transition-opacity hover:opacity-90 motion-reduce:transition-none print:hidden`}
        >
          Download CV
        </a>
        {links.length > 0 ? (
          <ul aria-label="Contact" className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {links.map((link) => (
              <li key={link.key}>
                <a
                  href={link.href}
                  className={`${textLink} text-zinc-700 dark:text-zinc-300`}
                  {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </header>
  );
}
