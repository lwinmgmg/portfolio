import Link from "next/link";

export default function MissingRagIndex() {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">Index not found</h2>
      <p>That index does not exist. It may have been deleted.</p>
      <Link
        href="/admin/rag"
        className="underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        Back to indexes
      </Link>
    </section>
  );
}
