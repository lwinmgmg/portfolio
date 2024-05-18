import Image from "next/image";
import HeroSession from "./components/HeroSession";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col">
      <div className="container mx-auto px-12 py-5">
        <HeroSession />
      </div>
    </main>
  );
}
