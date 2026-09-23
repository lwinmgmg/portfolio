import { logoutAction } from "@/app/admin/(panel)/actions";
import { requireAdmin } from "@/server/services/auth-service";

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between bg-gray-800 p-4 text-white">
        <h1 className="text-xl font-bold">Admin Panel</h1>
        <form action={logoutAction}>
          <button type="submit" className="text-sm underline">
            Log out
          </button>
        </form>
      </header>
      <main className="flex-1 p-4">{children}</main>
      <footer className="bg-gray-800 p-4 text-center text-white">
        &copy; {new Date().getFullYear()} My Company
      </footer>
    </div>
  );
}
