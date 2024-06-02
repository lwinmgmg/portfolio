import Link from "next/link";
import { getDiffMonths } from "../../lib/dateCalc";

export default function ExperienceItem({
name,
title,
location,
startDate,
endDate,
website = "/"
}:{
    name: string,
    title: string,
    location: string,
    startDate: Date,
    endDate?: Date,
    website?: string
}){
    const monthDiff = getDiffMonths(startDate, endDate? endDate : new Date())
    const years = monthDiff / 12;
    const months = monthDiff % 12;
    return (
        <div className="eduction-item">
            <h3 className="text-xl font-semibold">{name}</h3>
            <Link href={website} target="_blank" className="font-semibold text-blue-600 dark:text-blue-300 hover:underline"><p className="text-md">{" "}{title} ({location})</p></Link>
            <p className="text-xs">{startDate.toLocaleString('en-us',{month:'short', year:'numeric'})} - {endDate ? endDate.toLocaleString('en-us',{month:'short', year:'numeric'}) : "current" }{" "}({Math.floor(years)}{" "} years{" "}{months}{" "}months)</p>
        </div>
    );
}
