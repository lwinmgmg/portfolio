export default async function getMesgClient(mesgs: Array<Message>): Promise<{
    messages: Array<Message>
}>{
    const res = await fetch(
        "/api/messages/send",
        {
            method: "POST",
            body: JSON.stringify({
                mesgs
            }),
            headers: {
                "Content-Type": "application/json"
            }
        }
    )
    if (res.status === 200 || res.status === 422){
        return res.json()
    }
    return {
        messages: []
    }
}
