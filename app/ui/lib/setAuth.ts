"use server";

import { cookies } from "next/headers";
import { keyList, uuidv4 } from "./enums";

export default async function setAuth(formData: FormData){
    const cookieStore = cookies();
    const uuid4 = uuidv4();
    cookieStore.set("auth", uuid4);
    keyList.set(uuid4, 1);
}
