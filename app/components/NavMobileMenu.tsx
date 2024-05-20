"use client";

import clsx from "clsx";
import { useState } from "react";
import MenuOverlay from "./MenuOverlay";

const Bar3Icon = ({ className = "" }:{ className?: string})=>(<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={clsx(className)}>
<path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
</svg>
);

const CrossIcon = ({ className = "" }:{ className?: string})=>(<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={clsx(className)}>
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
    const btnClassName = "px-4 py-2 rounded-xl";
    return (
        <>
            {
                btnClick ? <MenuOverlay onClickCross={onClickCross} menus={menus} /> : null
            }
            {
                btnClick ? <button className={clsx(btnClassName, "relative border border-white z-30")} onClick={onClickCross}><CrossIcon className="w-10 h-10" /></button>
                : <button className={clsx(btnClassName)} onClick={onClickBar}><Bar3Icon className="w-10 h-10" /></button>
            }
        </>
    );
}
