import EducationItem from "./EducationItem";

export default function Education(){
    return (
        <div className="space-y-3 p-10 rounded-3xl bg-slate-100 dark:bg-slate-800">
            <EducationItem
            name="Mandalay Technological University"
            title="Bachelor of Engineering, BE. Mechatronics Engineering"
            startDate={new Date("2013/12/01")}
            endDate={new Date("2015/10/01")}
            />
            <EducationItem
            name="Yangon Technological University"
            title="Bachelor of Engineering, BE. Mechatronics Engineering"
            startDate={new Date("2015/12/01")}
            endDate={new Date("2019/10/01")}
            />
        </div>
    );
}