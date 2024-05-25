"use client";

import React, { useState, useTransition } from "react";
import SubMenuItem from "./SubMenuItem";
import Skills from "./Skills";
import Education from "./Education";
import Experience from "./Experience";

export default function SubMenu(){

    const [activeMenu, setActiveMenu] = useState("skill");
    const [isPending, startTransition] = useTransition();

    const menuMap: Map<string, any> = new Map<string, any>([
        ["skill", <Skills key="skill"/>],
        ["education", <Education key="education" />],
        ["experience", <Experience key="experience"/>]
    ]);

    const handleChange = (menuId: string)=>{
        startTransition(()=>{
            setActiveMenu(menuId);
        })
    };

    return (
        <div>
            <div className="flex flex-row text-2xl font-semibold space-x-2 mb-4">
                <SubMenuItem setActive={()=>handleChange("skill")} active={activeMenu == "skill"}>Skills</SubMenuItem>
                <SubMenuItem setActive={()=>handleChange("education")} active={activeMenu == "education"}>Education</SubMenuItem>
                <SubMenuItem setActive={()=>handleChange("experience")} active={activeMenu == "experience"}>Experience</SubMenuItem>
            </div>
            <div>
                {
                    menuMap.get(activeMenu)
                }
            </div>
        </div>
    );
}