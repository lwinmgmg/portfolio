"use client";

export default function SubMenu(){
    return (
        <div className="flex flex-row text-xl font-semibold space-x-2">
            <h3 className="cursor-pointer">Skills</h3>
            <h3 className="cursor-pointer">Education</h3>
            <h3 className="cursor-pointer">Experience</h3>
        </div>
    );
}