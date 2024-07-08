"use client";

import { ChangeEvent, FormEvent, KeyboardEvent, useRef, useState } from "react";
import getMesgClient from "../lib/getMesgCli";

export default function ChatForm({
    messages,
    loading,
    setMessages,
    setLoading
}: {
    messages: Array<Message>,
    loading: boolean,
    setMessages: (messgs: Array<Message>)=>void,
    setLoading: (value: boolean)=>void
}){
    const formRef = useRef<HTMLFormElement>(null);
    const textAreaRef = useRef<HTMLTextAreaElement>(null);

    const [mesg, setMesg] = useState("");

    const onKeyPress = (e: KeyboardEvent<HTMLTextAreaElement>)=>{
        if (e.key === "Enter" && !e.shiftKey){
            e.currentTarget.closest("form")?.requestSubmit();
            e.preventDefault();
        }
    }

    const onChange = async (e: ChangeEvent<HTMLTextAreaElement>)=>{
        setMesg(e.target.value);
    }

    const onSubmit = (e: FormEvent)=>{
        e.preventDefault();
        const message: Message = {
            "parts": [
                {
                    "text": mesg
                }
            ],
            "role": "user"
        };
        const allMesgs = [
            message,
            ...messages
        ]
        setMessages(allMesgs);
        setLoading(true);
        getMesgClient(
            allMesgs
        ).then((newMesgs)=>{
            setLoading(false);
            setMessages([
                ...newMesgs.messages,
                ...allMesgs,
            ])
        }).catch((err)=>{
            console.log(err);
            setLoading(false);
        })
        setMesg("");
    }

    return (
        <form ref={formRef} onSubmit={onSubmit} className="flex flex-row">
            <textarea readOnly={loading} autoFocus onKeyDown={onKeyPress} value={mesg} onChange={onChange} name="mesg" rows={1} className="flex-grow p-3 bg-slate-100 dark:bg-slate-950 rounded-md ring-0 border-none resize-y" />
            <button className="p-3 rounded-md border">Send</button>
        </form>
    );
}