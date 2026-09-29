import Link from "next/link";

import { logoutAction } from "@/app/admin/(panel)/actions";
import { requireAdmin } from "@/server/services/auth-service";

const adminNav = [
  { href: "/admin/cv", label: "CV" },
  { href: "/admin/rag", label: "RAG" },
  { href: "/admin/email", label: "Email" },
] as const;

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-gray-800 text-white">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 p-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <h1 className="text-xl font-bold">Admin Panel</h1>
            <nav aria-label="Admin" className="flex gap-4 text-sm">
              {adminNav.map((item) => (
                <Link key={item.href} className="underline" href={item.href}>
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <form action={logoutAction}>
            <button type="submit" className="text-sm underline">
              Log out
            </button>
          </form>
        </div>
      </header>
      <main className="flex-1 p-4">{children}</main>
      <footer className="bg-gray-800 p-4 text-center text-white">
        &copy; {new Date().getFullYear()} Portfolio
      </footer>
    </div>
  );
}
