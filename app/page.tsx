import AboutSection from "./ui/sections/AboutSection";
import HeroSession from "./ui/sections/HeroSection";

export default function Home() {
  return (
    <main className="w-full flex flex-col">
      <div className="container mx-auto mt-20 px-12 py-5">
        <HeroSession />
        <AboutSection />
      </div>
    </main>
  );
}
