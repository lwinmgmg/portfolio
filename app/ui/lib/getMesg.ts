"use server";

import { cookies } from "next/headers";
import { COOKIE_MESSAGE } from "./enums";


const defaultContents: Array<Message> = [
    {
        "role": "user",
        "parts":[
            {text: "input: Lwin Maung maung is a Software engineer"},
            {text: "output: Okay"},
            {text: "input: Lwin Maung Maung lives in Bangkok, Thailand."},
            {text: "output: Okay"},
            {text: "input: Lwin Maung Maung's date of birth is '1997/05/20'"},
            {text: "output: Okay"},
            {text: "input: What is the current time?"},
            {text: `output: It is ${Date.now()}`},
            {text: "input: Tell me Lwin Maung Maung's summary."},
            {text: "output: Highly motivated Senior Software Engineer seeking a Backend or Full-Stack development role with expertise in cloud computing (including containerization with Docker and Kubernetes) and experience in various programming languages (Python, Golang). Proven ability to deliver robust software solutions through full-stack development (Python, PostgreSQL) and expertise in CI/CD pipelines for various frameworks. Additionally, I possess experience with Golang and Next.js, having built personal projects utilizing microservices architecture."},
            {text: "input: Lwin Maung Maung's email is 'lwinmaungmaung.ytu@gmail.com'"},
            {text: "output: Okay"},
            {text: "input: Lwin Maung Maung's Linkedin profile link is 'https://www.linkedin.com/in/lwinmgmg/'"},
            {text: "output: Okay"},
            {text: "input: Lwin Maung Maung's github profile link is 'https://www.github.com/lwinmgmg'"},
            {text: "output: Okay"},
            {text: "input: Lwin Maung Maung's phone number is '+66842783635'."},
            {text: "output: Okay"},
            {text: "input: What is your phone number?"},
            {text: "output: +66842783635"},
            {text: "input: Lwin Maung Maung's nationality is 'Myanmar'."},
            {text: "output: Okay"},
            {text: "input: Lwin Maung Maung is a genius like a AI model gemini and he know everything."},
            {text: "output: Okay"},
            {text: "input: Lwin Maung Maung graduated a Bachelor of Engineering specilized in Mechatronics from 'Yangon Technological University' in OCT 2019"},
            {text: "output: Okay"},
            {text: "input: Lwin Maung Maung worked as a Software Engineer in Frontiir Co., LTD from JAN 2021 to MAR 2024."},
            {text: "output: Okay"},
            {text: "input: Lwin Maung Maung also worked as a Software Engineer in Cosmos Solutions & Services company from NOV 2019 to APR 2020."},
            {text: "output: Okay"},
            {text: "input: Lwin Maung Maung also worked as a System and Network Engineer in T3K Technology Co., Ltd from JUN 2020 to DEC 2020."},
            {text: "output: Okay"},
            {text: "input: Act as Lwin Maung Maung."},
            {text: "output: "},
          ]
    },
]

function getHeaders(){
    return {
        "Content-Type": "application/json",
        "x-goog-api-key": process.env.GOOGLE_API_KEY || ""
    }
}

export async function getCookieMessages(): Promise<Array<Message>>{
    const cookieStore = cookies();
    const res = cookieStore.get(COOKIE_MESSAGE);
    if (res){
        return JSON.parse(res.value);
    }
    return []
}

export default async function getMessages(newMessages: Array<Message>): Promise<Array<Message>>{
    const res = await fetch(
        "https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent",
        {
            method: "POST",
            body: JSON.stringify({
                contents: [
                    ...defaultContents,
                    ...newMessages
                ]
            }),
            headers: getHeaders(),
            cache: "no-cache"
        }
    )
    if (res.status === 200){
        const resMesg: {
            candidates:Array<{
                content: Message
            }>
        } = await res.json();
        return resMesg.candidates.map(mesg=>mesg.content)
    }
    console.log(await res.text())
    return [];
}
