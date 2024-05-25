import { getDiffMonths } from "../../lib/dateCalc";

export default function ExperienceItem({
name,
title,
location,
startDate,
endDate,
}:{
    name: string,
    title: string,
    location: string,
    startDate: Date,
    endDate?: Date,
}){
    const monthDiff = getDiffMonths(startDate, endDate? endDate : new Date())
    const years = monthDiff / 12;
    const months = monthDiff % 12;
    return (
        <div className="eduction-item">
            <h3 className="text-xl font-semibold">{name}</h3>
            <p className="text-md font-semibold">{" "}{title} ({location})</p>
            <p className="text-xs">{startDate.toLocaleString('en-us',{month:'short', year:'numeric'})} - {endDate ? endDate.toLocaleString('en-us',{month:'short', year:'numeric'}) : "current" }{" "}({Math.floor(years)}{" "} years{" "}{months}{" "}months)</p>
        </div>
    );
}
