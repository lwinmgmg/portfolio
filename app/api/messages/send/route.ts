import { keyList } from "@/app/ui/lib/enums";
import getMessages from "@/app/ui/lib/getMesg"
import { cookies } from "next/headers";

export async function POST(request: Request) {
    // const cookieStore = cookies();
    // const authToken = cookieStore.get("auth");
    // if (! authToken?.value){
    //     return Response.json({ messages: [{
    //         parts: [{
    //             text: "You have reached your limit and refresh the browser."
    //         }],
    //         role: "model"
    //     }] }, { status: 422 })
    // }
    // const tknValue = keyList.get(authToken.value);
    // if (!tknValue || tknValue > 4){
    //     return Response.json({ messages: [{
    //         parts: [{
    //             text: "You have reached your limit and refresh the browser."
    //         }],
    //         role: "model"
    //     }] }, { status: 422 })
    // }
    // keyList.set(authToken.value, tknValue + 1)
    const { mesgs } : { mesgs : Array<Message>} = await request.json();
    mesgs.reverse()
    const newMessages = await getMessages(mesgs);
    return Response.json({ messages: newMessages })
}
