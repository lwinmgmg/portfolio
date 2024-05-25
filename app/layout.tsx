import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import NavBar from "./ui/components/NavBar";
import Footer from "./ui/sections/Footer";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Lwin Maung Maung",
  description: "Lwin Maung Maung's Portfolio",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className + "w-screen h-screen bg-slate-300 dark:bg-slate-950 text-slate-800 dark:text-slate-100"}>
        <NavBar />
        {children}
        <Footer />
      </body>
    </html>
  );
}
