import Project from "../components/projects/Project";

export default function ProjectSection(){
    return (
        <section id="projects">
            <h2 className="text-3xl text-center font-bold">Projects</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 justify-items-center mt-8">
                <Project />
                <Project />
                <Project />
            </div>
        </section>
    );
}