"use client";

import React, { useState } from "react";
import SubMenuItem from "./SubMenuItem";
import Skills from "./Skills";
import Education from "./Education";
import Experience from "./Experience";

export default function SubMenu(){

    const [activeMenu, setActiveMenu] = useState("skill");

    const menuMap: Map<string, any> = new Map<string, any>([
        ["skill", <Skills key="skill"/>],
        ["education", <Education key="education" />],
        ["experience", <Experience key="experience"/>]
    ])

    return (
        <div>
            <div className="flex flex-row text-2xl font-semibold space-x-2 mb-4">
                <SubMenuItem setActive={()=>setActiveMenu("skill")} active={activeMenu == "skill"}>Skills</SubMenuItem>
                <SubMenuItem setActive={()=>setActiveMenu("education")} active={activeMenu == "education"}>Education</SubMenuItem>
                <SubMenuItem setActive={()=>setActiveMenu("experience")} active={activeMenu == "experience"}>Experience</SubMenuItem>
            </div>
            <div>
                {
                    menuMap.get(activeMenu)
                }
            </div>
        </div>
    );
}