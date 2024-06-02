import { getDiffMonths } from "../../lib/dateCalc";

export default function EducationItem({
name,
title,
startDate,
endDate,
descriptions,
}:{
    name: string,
    title: string,
    descriptions: string[],
    startDate: Date,
    endDate?: Date,
}){
    const monthDiff = getDiffMonths(startDate, endDate? endDate : new Date())
    const years = monthDiff / 12;
    const months = monthDiff % 12;
    return (
        <div className="eduction-item">
            <h3 className="text-xl font-semibold">{name}</h3>
            <p className="text-lg">{title}</p>
            <p className="text-xs">{startDate.toLocaleString('en-us',{month:'short', year:'numeric'})} - {endDate ? endDate.toLocaleString('en-us',{month:'short', year:'numeric'}) : "current" }{" "}({Math.floor(years)}{" "} years{" "}{months}{" "}months)</p>
            <p className="text-sm font-bold">Descriptions</p>
            <ul className="list-disc px-5 text-sm">
                {
                    descriptions.map(desc => <li key={desc}>{desc}</li>)
                }
            </ul>
        </div>
    );
}