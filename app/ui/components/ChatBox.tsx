"use client";

import { useEffect, useRef, useState } from "react";
import ChatForm from "./ChatForm";
import ChatMesgText from "./ChatMesgText";

export default function ChatBox({
    onClick
}:{
    onClick: ()=>void
}){
    const divRef = useRef<HTMLDivElement>(null);
    const [messages, setMessages] = useState<Array<Message>>([])
    const [loading, setLoading] = useState(false);
    useEffect(()=>{
        if (divRef.current){
            divRef.current.scrollTop = divRef.current.scrollHeight - divRef.current.clientHeight;
        }
    }, [divRef, messages])

    return (
        <>
            <div className="fixed w-screen h-screen z-40" onClick={onClick}>
            </div>
            <div className="fixed border border-slate-500 dark:border-slate-600 p-2 rounded-md w-[21rem] h-1/2 bottom-10 right-10 bg-slate-200 dark:bg-slate-800 z-50">
                <div className="w-full h-full rounded-md border border-slate-500 dark:border-slate-600 flex flex-col">
                    <div ref={divRef} className="flex-grow bg-slate-50 overflow-y-auto overflow-x-hidden">
                        <div className="min-h-full w-full bg-slate-300 dark:bg-slate-800 flex flex-col-reverse">
                            {
                                loading ? <ChatMesgText role="model" parts={[
                                    {
                                        text: "Typing..."
                                    }
                                ]} /> : null
                            }
                            {
                                messages.length > 0 && messages.map((message, idx)=>(
                                    <ChatMesgText key={ idx } role={message?.role || "model"} parts={message?.parts || []} />
                                ))
                            }
                            <ChatMesgText role="model" parts={[
                                {
                                    text: "I am a AI chat bot and you can ask me about Lwin Maung Maung."
                                },
                                {
                                    text: "How can I help you?"
                                }
                            ]} />
                        </div>
                    </div>
                    <ChatForm messages={messages} loading={loading} setMessages={setMessages} setLoading={setLoading}/>
                </div>
            </div>
        </>
    );
}