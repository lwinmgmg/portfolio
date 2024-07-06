import Link from "next/link";
import ContactItem from "./contactItem";
import React from "react";

export default function LinkItem({
    href,
    name,
    label,
    children
}:{
    href: string,
    name: string,
    label: string,
    children: React.ReactNode
}){
    return (
        <ContactItem>
                <div>
                    {children}
                </div>
                <p>{label} : </p>
                <p><Link target="_next" href={href}>{name}</Link></p>
        </ContactItem>
    );
}