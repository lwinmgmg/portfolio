import Image from "next/image";
import SubMenu from "../components/about/SubMenu";
import Link from "next/link";

export default function AboutSection() {
  return (
    <section id="about" className="pt-20">
        <div className="lg:grid lg:grid-cols-2 gap-8">
            <div>
                <Image src="/images/about_me.png" priority height={500} width={500} alt="About Image" />
            </div>
            <div>
                <h2 className="text-4xl font-bold mb-4">About Me</h2>
                <div>
                  <div className="relative float-left mx-2 rounded-full bg-slate-100 dark:bg-slate-800 w-[110px] h-[110px] lg:w-[150px] lg:h-[150px]">
                    <Link href="https://www.linkedin.com/in/lwinmgmg/" target="_blank">
                      <Image src="/images/profile.png" className="absolute transform -translate-x-1/2 -translate-y-1/2 top-1/2 left-1/2 hidden lg:block" height={125} width={125} alt="Profile" />
                      <Image src="/images/profile.png" className="absolute transform -translate-x-1/2 -translate-y-1/2 top-1/2 left-1/2 block lg:hidden" height={100} width={100} alt="Profile" />
                    </Link>
                  </div>
                  <p className="text-lg mb-4 text-justify">Highly motivated Senior Software Engineer seeking a Backend or Full-Stack development role with expertise in cloud computing (including containerization with Docker and Kubernetes) and experience in various programming languages (Python, Golang).
  Proven ability to deliver robust software solutions through full-stack development (Python, PostgreSQL) and expertise in CI/CD pipelines for various frameworks. Additionally, I possess experience with Golang and Next.js, having built personal projects utilizing microservices architecture.
                  </p>
                </div>
                <SubMenu />
            </div>
        </div>
    </section>
  )
}
