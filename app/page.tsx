import AboutSection from "./ui/sections/AboutSection";
import HeroSession from "./ui/sections/HeroSection";

export default function Home() {
  return (
    <main className="flex w-full flex-col text-slate-800 dark:text-slate-100">
      <div className="container mx-auto mt-20 px-12 py-5 space-y-10">
        <HeroSession />
        <AboutSection />
      </div>
    </main>
  );
}
