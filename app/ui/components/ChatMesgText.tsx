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
        <div className={clsx("flex m-1 mb-2 text-xs", {
            "flex-row-reverse": role==="user",
            "flex-row": role==="model"
        })}>
            <p style={{whiteSpace: "pre-wrap"}} className={clsx(" text-justify max-w-[17rem] p-3 rounded-xl bg-slate-100 dark:bg-slate-950",
                {
                    "rounded-br-none": role==="user",
                    "rounded-tl-none": role==="model"
                }
            )}>
                {
                    parts.map((part) =>part.text).join("\n\n")
                }
            </p>
        </div>
    );
}