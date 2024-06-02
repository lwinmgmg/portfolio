import AboutSection from "./ui/sections/AboutSection";
import HeroSession from "./ui/sections/HeroSection";
import ProjectSection from "./ui/sections/ProjectSection";

export default function Home() {
  return (
    <main className="w-full flex flex-col">
      <div className="container mx-auto mt-20 px-12 py-5">
        <HeroSession />
        <AboutSection />
        <ProjectSection />
      </div>
    </main>
  );
}
