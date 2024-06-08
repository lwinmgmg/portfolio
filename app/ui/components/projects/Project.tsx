import Link from "next/link";
import GitHubIcon from "./GitHubIcon";
import IconButton from "./IconButton"
import InfoIcon from "./InfoIcon";
import GlobalIcon from "./GlobalIcon";

export default function Project({
title,
detail,
githubUrl,
webUrl,
infoUrl,
imageUrl = "/images/pp.png"
}:{
    title: string,
    detail: string,
    githubUrl: string,
    webUrl: string,
    infoUrl: string,
    imageUrl?: string
}){
    return (
        <div className="w-[22rem] shadow-sm hover:shadow-slate-600 rounded-xl bg-slate-100 dark:bg-slate-800">
            <div className="h-40 w-full relative rounded-xl shadow-lg hover:shadow-slate-600 group" style={{
                background: `url(${imageUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center"
            }}>
                <div className="overlay absolute top-0 left-0 rounded-xl h-full w-full bg-slate-500 dark:bg-slate-800 bg-opacity-0 hidden group-hover:flex group-hover:bg-opacity-50 transition-all duration-500">
                    <div className="flex flex-row space-x-2 h-full w-full items-center justify-center">
                        <Link target="_blank" href={githubUrl}>
                            <IconButton>
                                <GitHubIcon className="h-7 w-7" />
                            </IconButton>
                        </Link>
                        <Link target="_blank" href={infoUrl}>
                            <IconButton>
                                <InfoIcon className="h-7 w-7" />
                            </IconButton>
                        </Link>
                        <Link target="_blank" href={webUrl}>
                            <IconButton>
                                <GlobalIcon className="h-7 w-7" />
                            </IconButton>
                        </Link>
                    </div>
                </div>
            </div>
            <div className="p-5">
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className="text-sm">{detail}</p>
            </div>
        </div>
    );
}