"use client";

import clsx from "clsx";
import { useState } from "react";

const Bar3Icon = ({ className = "" }:{ className?: string})=>(<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={clsx("w-6 h-6", className)}>
<path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
</svg>
);

const CrossIcon = ({ className = "" }:{ className?: string})=>(<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={clsx("w-6 h-6", className)}>
<path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
</svg>
);

export default function NavMobileMenu({ menus }:{
    menus: Array<Menu>
}){
    const [btnClick, setBtnClick] = useState(false);
    const onClickCross = ()=>{
        setBtnClick(false);
    }
    const onClickBar = ()=>{
        setBtnClick(true);
    }
    const btnClassName = "px-5 py-3 border border-white rounded-xl";
    return (
        <>
            {
                btnClick ? <button className={btnClassName} onClick={onClickCross}><CrossIcon className="w-10 h-10" /></button>
                : <button className={btnClassName} onClick={onClickBar}><Bar3Icon className="w-10 h-10" /></button>
            }
        </>
    );
}
