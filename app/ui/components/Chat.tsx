"use client";

import { useState } from "react";
import ChatBox from "./ChatBox";
import setAuth from "../lib/setAuth";

export default function Chat(){
    const [chat, setChat] = useState(false);
    const [click, setClick] = useState(false);
    const onClick = ()=>{
        setChat(true);
        setClick(true);
    }
    return chat ? (
            <ChatBox onClick={()=>setChat(false)}/>
        ): (<div className="fixed bottom-10 right-10 z-50">
            <form action={setAuth}>
                <button className="rounded-full relative p-3 border border-slate-900 dark:border-slate-300 bg-slate-400 dark:bg-slate-700 bg-opacity-80" onClick={onClick}>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-10">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
                    </svg>
                    {
                        click ? null : <p className="absolute transform -translate-x-1/2 -translate-y-1/2 -right-1 top-2 text-orange-600 dark:text-orange-200 text-md z-50 font-bold">01</p>
                    }
                </button>
            </form>
        </div>)
}