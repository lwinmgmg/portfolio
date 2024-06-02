"use client";

import { useState } from "react";
import SkillMeter from "./SkillMeter";
import clsx from "clsx";
import SkillName from "./SkillName";

type SkillType = Array<[string, Array<[string, number]>]>;

export default function Skills(){
    const skills: SkillType = [
        ["Programming Languages", [
            ["Python", 100],
            ["Golang", 95],
            ["NodeJS", 90],
            ["TypeScript", 90],
            ["Java", 65],
            ["C++", 50]
        ]],
        ["Databases", [
            ["Postgres", 100],
            ["MySQL", 95],
            ["MongoDB", 95],
            ["Redis", 95],
        ]],
        ["Back-End Frameworks", [
            ["FastAPI (Python)", 100],
            ["Odoo", 100],
            ["Django", 100],
            ["Gin (Golang)", 95],
            ["ExpressJS (NodeJS)", 90],
        ]],
        ["Front-End Frameworks", [
            ["ReactJS", 100],
            ["NextJS", 100],
            ["Tailwind Css", 95],
            ["VueJS", 90],
            ["Bootstrap", 80],
        ]],
        ["CI/CD", [
            ["Gitlab CI", 100],
            ["Github Action", 100],
            ["Docker", 100],
            ["Kubernetes", 75],
            ["Jenkin", 75],
        ]],
        ["Operating Systems", [
            ["Linux", 100],
            ["Window", 75],
            ["Mac", 50]
        ]]
    ];
    const [selectedSkill, setSelectedSkill] = useState(skills[0][0]);
    const skillValues = skills.filter(skill=>skill[0] == selectedSkill)[0]
    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            <div className="p-8 rounded-3xl bg-slate-100 dark:bg-slate-800">
                {
                    skills.map(skill=>(
                        <div key={skill[0]} className="mb-3 lg:mr-3">
                            <h2  onClick={()=>setSelectedSkill(skill[0])} className={clsx("text-xl font-semibold cursor-pointer inline-block border-green-800 dark:border-green-200", {
                                "border-b-2": skill[0] === selectedSkill
                            })}>{skill[0]}</h2>
                        </div>
                    ))
                }
            </div>
            <div className="grid grid-cols-1 gap-1 justify-center items-center p-8 rounded-3xl bg-slate-100 dark:bg-slate-800">
                {
                    skillValues[1].map(([name, value])=>(
                        <div key={name}>
                            <SkillName>{name}</SkillName>
                            <SkillMeter percentage={value} />
                        </div>
                    ))
                }
            </div>
        </div>
    );
}