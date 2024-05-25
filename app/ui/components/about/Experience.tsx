import ExperienceItem from "./ExperienceItem";

export default function Experience(){
    return (
        <div className="space-y-3 p-10 rounded-3xl bg-slate-100 dark:bg-slate-800">
            <ExperienceItem
            name="Software Developer"
            title="Cosmos Solutions & Services"
            location="Yangon, Myanmar"
            startDate={new Date("2019/11/01")}
            endDate={new Date("2020/04/30")}
            />
            <ExperienceItem
            name="System and Network Engineer"
            title="T3K Technology Co., LTD"
            location="Yangon, Myanmar"
            startDate={new Date("2020/06/01")}
            endDate={new Date("2020/12/30")}
            />
            <ExperienceItem
            name="Software Engineer Engineer"
            title="Frontiir Co., LTD"
            location="Yangon, Myanmar"
            startDate={new Date("2021/01/18")}
            endDate={new Date("2024/03/18")}
            />
        </div>
    );
}