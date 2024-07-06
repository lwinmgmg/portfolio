"use client";

import { FormEvent, KeyboardEvent, MouseEvent, useRef, useState } from "react";
import sendMesg from "../lib/sendMesg";

export default function ChatForm(){
    const formRef = useRef<HTMLFormElement>(null);
    const textAreaRef = useRef<HTMLTextAreaElement>(null);

    const onKeyPress = (e: KeyboardEvent<HTMLTextAreaElement>)=>{
        if (e.key === "Enter" && !e.shiftKey){
            if (formRef.current){
                if (formRef.current){
                    formRef.current.requestSubmit();
                    if (textAreaRef.current){
                        textAreaRef.current.value = "";
                    }
                    e.preventDefault();
                }
            }
        }
    }

    const onClick = (e: MouseEvent<HTMLButtonElement>)=>{
        if (formRef.current){
            formRef.current.requestSubmit();
            if (textAreaRef.current){
                textAreaRef.current.value = "";
            }
            e.preventDefault();
        }
    }

    return (
        <form ref={formRef} action={sendMesg} className="flex flex-row">
            <textarea ref={textAreaRef} onKeyDownCapture={onKeyPress}  name="mesg" rows={1} className="flex-grow p-3 bg-slate-100 dark:bg-slate-950 rounded-md ring-0 border-none resize-y" />
            <button className="p-3 rounded-md border" onClick={onClick}>Send</button>
        </form>
    );
}