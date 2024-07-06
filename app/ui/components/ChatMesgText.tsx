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
        <div className={clsx("flex m-1", {
            "flex-row-reverse": role==="user",
            "flex-row": role==="model"
        })}>
            <div>
                {
                    parts.map((part, idx) => (
                        <p style={{whiteSpace: "pre-wrap"}} key={part + idx.toString()} className="p-3 rounded-lg bg-slate-100 dark:bg-slate-950">
                            {part.text}
                        </p>
                    ))
                }
            </div>
        </div>
    );
}