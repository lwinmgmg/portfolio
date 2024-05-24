import clsx from "clsx";
import React from "react";

export default function SubMenuItem({ active, setActive, children }:{
    setActive: ()=>void
    active?: boolean,
    children?: React.ReactNode
}){
    return (
        <h3 onClick={setActive} className={clsx(
            "cursor-pointer hover:text-slate-700 dark:hover:text-slate-300 hover:opacity-50 dark:hover:opacity-50",
            active ? "text-slate-950 dark:text-slate-100" : "text-slate-600 dark:text-slate-400"
        )}>{children}</h3>
    );
}
