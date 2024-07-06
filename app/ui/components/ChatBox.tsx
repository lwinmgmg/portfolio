"use client";

import { useEffect, useRef } from "react";
import ChatForm from "./ChatForm";
import ChatMesgText from "./ChatMesgText";

export default function ChatBox({
    onClick
}:{
    onClick: ()=>void
}){
    const divRef = useRef<HTMLDivElement>(null);
    useEffect(()=>{
        if (divRef.current){
            divRef.current.scrollTop = divRef.current.scrollHeight - divRef.current.clientHeight;
        }
    }, [divRef])
    return (
        <>
            <div className="fixed w-screen h-screen z-40" onClick={onClick}>
            </div>
            <div className="fixed border border-slate-500 dark:border-slate-600 p-2 rounded-md w-80 h-1/2 bottom-10 right-10 bg-slate-200 dark:bg-slate-800 z-50">
                <div className="w-full h-full rounded-md border border-slate-500 dark:border-slate-600 flex flex-col">
                    <div ref={divRef} className="flex-grow bg-slate-50 overflow-y-auto">
                        <div className="min-h-full w-full bg-slate-300 dark:bg-slate-900 flex flex-col-reverse">
                            <ChatMesgText role="model" parts={[
                                {
                                    text: "This is the AI chat bot\r\ntrained as Lwin Maung Maung"
                                },
                                {
                                    text: "How can I help you?"
                                }
                            ]} />
                        </div>
                    </div>
                    <ChatForm/>
                </div>
            </div>
        </>
    );
}