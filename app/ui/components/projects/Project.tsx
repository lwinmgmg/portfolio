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
        <div className="max-w-sm shadow-sm hover:shadow-slate-600 rounded-xl bg-slate-100 dark:bg-slate-800">
            <div className="h-40 w-full relative rounded-xl shadow-lg hover:shadow-slate-600 group" style={{
                background: `url(${imageUrl})`,
                backgroundSize: "cover"
            }}>
                <div className="overlay absolute top-0 left-0 rounded-xl h-full w-full bg-slate-200 dark:bg-slate-800 bg-opacity-0 hidden group-hover:flex group-hover:bg-opacity-50 transition-all duration-500"></div>
            </div>
            <div className="p-5">
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className="text-sm">{detail}</p>
            </div>
        </div>
    );
}