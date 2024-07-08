import clsx from "clsx";

export default function ChatMesgText({
    role,
    parts
}:{
    role: "user" | "model",
    parts: Array<{
        text: string
    }>
}){
    return (
        <div className={clsx("flex m-1 mb-2", {
            "flex-row-reverse": role==="user",
            "flex-row": role==="model"
        })}>
            <div>
            <p style={{whiteSpace: "pre-wrap"}} className="p-3 rounded-lg bg-slate-100 dark:bg-slate-950">
                {
                    parts.map((part) =>part.text).join("\n\n")
                }
            </p>
            </div>
        </div>
    );
}