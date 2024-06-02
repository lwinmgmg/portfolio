import EducationItem from "./EducationItem";

export default function Education(){
    return (
        <div className="space-y-3 p-8 rounded-3xl bg-slate-100 dark:bg-slate-800">
            <EducationItem
            name="Yangon Technological University"
            title="Bachelor of Engineering, BE. Mechatronics Engineering"
            startDate={new Date("2015/12/01")}
            endDate={new Date("2019/10/01")}
            descriptions={[
                "Developed a Fuzzy Logic Controller Based Multi Input/Output Line Following Robot (Graduation Thesis)",
                "Implemented C programming and Arduino platform to control robot movement based on sensor inputs.",
                "Graduated Bachelor of Engineering (CGPA - 3.6/5.0)"
            ]}
            />
            <EducationItem
            name="Mandalay Technological University"
            title="Bachelor of Engineering, BE. Mechatronics Engineering"
            startDate={new Date("2013/12/01")}
            endDate={new Date("2015/10/01")}
            descriptions={[
                "Studied Computer Science Related Subjects (Digital Electronics, Computer System Architecture and Programming, Programmable Logic Controller)",
                "Transferred to Yangon Technological University"
            ]}
            />
        </div>
    );
}