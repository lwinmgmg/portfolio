"use server";

import { cookies } from "next/headers";
import { getCookieMessages } from "./getMesg";
import { COOKIE_MESSAGE } from "./enums";

export default async function setMesg(mesgs: Array<Message>) {
    const cookieStore = cookies();
    const mesgCookie = await getCookieMessages();
    try{
        cookieStore.set(COOKIE_MESSAGE, JSON.stringify(
            [...mesgs, ...mesgCookie]
        ));
    }catch(e){
        console.log(e);
        cookieStore.delete(COOKIE_MESSAGE);
    }
}
