import Image from "next/image";
import SubMenu from "../components/about/SubMenu";

export default function AboutSection() {
  return (
    <section id="about" className="pt-20">
        <div className="lg:grid lg:grid-cols-2 gap-8">
            <div>
                <Image src="/images/about_me.png" height={500} width={500} alt="About Image" />
            </div>
            <div>
                <h2 className="text-4xl font-bold mb-4">About Me</h2>
                <p className="text-lg mb-4">Highly motivated Senior Software Engineer seeking a Backend or Full-Stack development role with expertise in cloud computing (including containerization with Docker and Kubernetes) and experience in various programming languages (Python, Golang).
Proven ability to deliver robust software solutions through full-stack development (Python, PostgreSQL) and expertise in CI/CD pipelines for various frameworks. Additionally, I possess experience with Golang and Next.js, having built personal projects utilizing microservices architecture.
                </p>
                <SubMenu />
            </div>
        </div>
    </section>
  )
}
