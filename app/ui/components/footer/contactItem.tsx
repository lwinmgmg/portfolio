import Link from "next/link";
import React from "react";

export default function ContactItem({
    children,
}:{
    children: React.ReactNode,
}){
    return (
        <div className="flex flex-row items-center space-x-3 text-sm">
            {
                children
            }
        </div>
    );
}