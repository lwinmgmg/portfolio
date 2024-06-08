import clsx from "clsx";
import React from "react";

export default function IconButton({
    children,
    className = ""
}:{
    children: React.ReactNode
    className?: string
}){
    return (
        <button className={clsx("btn-secondary p-2 rounded-full", className)}>
            {children}
        </button>
    );
}
