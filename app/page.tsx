import HeroSession from "./components/HeroSession";

export default function Home() {
  return (
    <main className="flex w-full flex-col">
      <div className="container mx-auto px-12 py-5">
        <HeroSession />
      </div>
    </main>
  );
}
