import Link from "next/link";

export default function MissingCvVersion() {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">CV version not found</h2>
      <p>That version does not exist.</p>
      <Link
        href="/admin/cv"
        className="underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        Back to CV versions
      </Link>
    </section>
  );
}
