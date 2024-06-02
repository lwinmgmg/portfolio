import Link from "next/link";
import { getDiffMonths } from "../../lib/dateCalc";
import clsx from "clsx";

export default function ExperienceItem({
name,
title,
location,
startDate,
endDate,
website = "/",
onClick,
selected=false
}:{
    name: string,
    title: string,
    location: string,
    startDate: Date,
    endDate?: Date,
    website?: string,
    onClick?: ()=>void,
    selected?: boolean
}){
    const monthDiff = getDiffMonths(startDate, endDate? endDate : new Date())
    const years = monthDiff / 12;
    const months = monthDiff % 12;
    return (
        <div className={
            clsx("eduction-item cursor-pointer px-8 py-3", {
                "bg-blue-100 dark:bg-blue-950": selected,
                "hover:bg-slate-200 dark:hover:bg-slate-900": !selected
            })
        } onClick={onClick}>
            <h3 className="text-xl font-semibold">{name}</h3>
            {
                selected? (<Link href={website} target="_blank" className="font-semibold text-blue-600 dark:text-blue-300 hover:underline"><p className="text-md">{" "}{title} ({location})</p></Link>)
                :(<p className="text-md">{" "}{title} ({location})</p>)
            }
            <p className="text-xs">{startDate.toLocaleString('en-us',{month:'short', year:'numeric'})} - {endDate ? endDate.toLocaleString('en-us',{month:'short', year:'numeric'}) : "current" }{" "}({Math.floor(years)}{" "} years{" "}{months}{" "}months)</p>
        </div>
    );
}
