"use client";
import Link from "next/link";

export default function MenuOverlay({ menus, onClickCross }:{
    menus: Array<Menu>,
    onClickCross: ()=>void
}){
    return (
        <>
            <div className="absolute left-0 top-0 h-screen w-screen z-20" onClick={onClickCross}></div>
            <ul className="absolute left-0 top-full w-screen rounded-xl flex flex-col items-center dark:bg-slate-800 opacity-80 z-30">
                {
                    menus.length > 0 ? menus.map(({title, href})=>(
                        <li key={title} className="w-full"><Link href={href} className="block w-full py-5 px-10 text-xl rounded-xl dark:text-slate-200 dark:hover:text-white dark:hover:bg-slate-600 font-bold">{title}</Link></li>
                    )) : null
                }
            </ul>
        </>
    );
}