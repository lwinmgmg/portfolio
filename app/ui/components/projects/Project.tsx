export default function Project({
title,
detail,
imageUrl = "/images/pp.png"
}:{
    title: string,
    detail: string,
    imageUrl?: string
}){
    return (
        <div className="max-w-sm border-2 rounded-xl border-slate-600 dark:border-slate-300 bg-slate-100 dark:bg-slate-800 p-5">
            <div className="h-32">

            </div>
            <h3 className="text-lg font-semibold">{title}</h3>
            <p className="text-sm">{detail}</p>
        </div>
    );
}