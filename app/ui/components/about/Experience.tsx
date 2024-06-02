"use client";

import { useState } from "react";
import ExperienceItem from "./ExperienceItem";

type ExperienceType = {
    name: string,
    title: string,
    location: string,
    startDate: Date,
    endDate: Date,
    website: string,
    description: string[]
}

const experiences: ExperienceType[] = [
    {
        name:"Software Engineer",
        title:"Frontiir Co., Ltd",
        location:"Yangon, Myanmar",
        startDate:new Date("2021/01/18"),
        endDate:new Date("2024/03/18"),
        website:"https://www.frontiir.com/",
        description: [
            "Consistently achieving an average rating of 4.5 out of 5 in biannual performance reviews.",
            "Delivered a successful system migration, optimizing performance and responsiveness, leading to enhanced user satisfaction.",
            "Performed in-depth analysis of database systems to identify performance bottlenecks.",
            "Built a robust Python Fast API-based Rest API serving as a dedicated external ERP API to seamlessly integrate with and support various systems.",
            "Managed CI/CD pipelines for both front-end and back-end applications, ensuring smooth deployment across production and UAT environments.",
            "Exporting Financial Reports using SQL and Pandas.",
            "Handled a large financial datasets by chunking for better memory management.",
            "Delivered Python programming training to junior developers and QA personnel, fostering skill development in data structures and algorithms.",
            "Implemented Kafka with Inbox-Outbox pattern to enable asynchronous and transactional communication between microservices."
        ]
    },
    {
        name:"System and Network Engineer",
        title:"T3K Technology Co., Ltd",
        location:"Yangon, Myanmar",
        startDate:new Date("2020/06/01"),
        endDate:new Date("2020/12/30"),
        website:"https://www.t3ktechnology.com/",
        description: [
            "Learned server setups and Linux server administration. Configured and managed servers for various applications. Ensured system security and efficient performance.",
            "Got (HCIA and HCPA) Data Center Facility Certification"
        ]
    },
    {
        name:"Software Developer",
        title:"Cosmos Solutions & Services",
        location:"Yangon, Myanmar",
        startDate:new Date("2019/11/01"),
        endDate:new Date("2020/04/30"),
        website:"https://www.cosmosmm.com/",
        description: [
            "Mastered Python, Django, and Odoo through independent learning and hands-on experience. Completed numerous projects to demonstrate the practical implementation of acquired skills, attaining a high level of proficiency in Python and Django.",
            "Designed and developed a RESTful API for the order module in an e-commerce application using Django REST framework.",
            "Developed a fleet management system with vehicle rental and tracking features. Seamlessly deploy the application on Digital Ocean, prioritising both high performance and reliability."
        ]
    },
    {
        name:"Internship",
        title:"DigiNet Co., Ltd",
        location:"Yangon, Myanmar",
        startDate:new Date("2018/11/26"),
        endDate:new Date("2019/01/31"),
        website:"https://www.diginet-sg.com/",
        description: [
            "Learned Industrial IoT System, ELV System, Smart Home System and Building Control System."
        ]
    }
];

export default function Experience(){
    const [selectedId, setSelectedId] = useState(0);
    return (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
            <div className="py-8 rounded-3xl bg-slate-100 dark:bg-slate-800">
                {
                    experiences.map((exp, idx)=>(<ExperienceItem key={exp.title}
                        onClick={()=>setSelectedId(idx)}
                        name={exp.name}
                        title={exp.title}
                        location={exp.location}
                        startDate={exp.startDate}
                        endDate={exp.endDate}
                        website={exp.website}
                        selected={idx===selectedId}
                        />))
                }
            </div>
            <div className="grid grid-cols-1 gap-1 p-8 rounded-3xl bg-slate-100 dark:bg-slate-800">
                <ul className="list-disc text-sm">
                    {
                        experiences[selectedId].description.map((desc)=>(<li key={desc}>{desc}</li>))
                    }
                </ul>
            </div>
        </div>
    );
}