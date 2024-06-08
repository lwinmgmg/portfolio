import Project from "../components/projects/Project";

export default function ProjectSection(){
    return (
        <section id="projects" className="pt-20">
            <h2 className="text-3xl text-center font-bold">Projects</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 justify-items-center mt-8">
                <Project title="Portfolio Website" detail="Fully Customized Portfolio Website Using NextJS." githubUrl="https://github.com/lwinmgmg/portfolio" webUrl="https://lwinmgmg.vercel.app" infoUrl="https://github.com/lwinmgmg/portfolio" />
                <Project title="Binance Trading Bot" detail="Automation on Future Trade depending on the past data." imageUrl="/images/tb.png" githubUrl="https://github.com/lwinmgmg/trader" webUrl="https://www.binance.com/en/futures/home" infoUrl="https://www.binance.com/en/futures/home" />
                <Project title="Linux Http" detail="This module is used to execute Linux commands through Restful API." imageUrl="/images/lh.png" githubUrl="https://github.com/lwinmgmg/linux-http" webUrl="https://github.com/lwinmgmg/linux-http" infoUrl="https://github.com/lwinmgmg/linux-http" />
                <Project title="Linux Http Github Action" detail="Github action for Linux Http module. It is can be used in CI/CD automation." imageUrl="/images/gha.png" githubUrl="https://github.com/lwinmgmg/linux-http" webUrl="https://github.com/lwinmgmg/linux-http" infoUrl="https://github.com/lwinmgmg/linux-http" />
            </div>
        </section>
    );
}