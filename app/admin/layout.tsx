export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-gray-800 text-white p-4">
        <h1 className="text-xl font-bold">Admin Panel</h1>
      </header>
      <main className="flex-1 p-4">{children}</main>
      <footer className="bg-gray-800 text-white p-4 text-center">
        &copy; {new Date().getFullYear()} My Company
      </footer>
    </div>
  );
}