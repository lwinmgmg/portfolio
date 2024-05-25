import clsx from "clsx";
import React from "react";

export default function SubMenuItem({ active, setActive, children }:{
    setActive: ()=>void
    active?: boolean,
    children?: React.ReactNode
}){
    return (
        <h3 onClick={setActive} className={clsx(
            "cursor-pointer hover:text-slate-700 dark:hover:text-slate-300",
            active ? "text-slate-950 dark:text-slate-100 hover:text-slate-600 hover:dark:text-slate-400 border-b-4 border-slate-900 dark:border-slate-200"
            : "text-slate-600 dark:text-slate-400 hover:text-slate-950 hover:dark:text-slate-100"
        )}>{children}</h3>
    );
}
