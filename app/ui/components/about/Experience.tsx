"use client";

import { useState } from "react";
import ExperienceItem from "./ExperienceItem";

type ExperienceType = {
    name: string,
    title: string,
    location: string,
    startDate: Date,
    endDate?: Date,
    website: string,
    description: string[]
}

const experiences: ExperienceType[] = [
    {
        name:"Lead Software Developer (Remote)",
        title:"CMG Billing Ltd",
        location:"United Kingdom",
        startDate:new Date("2025/10/01"),
        endDate: undefined,
        website:"https://www.clinicsmedicalgroup.com/",
        description: [
            "Developing and maintaining GDPR-compliant telehealth software systems and backend microservices",
            "Working remotely full-time; income derived solely from UK employer",
            "Managing CI/CD pipelines, code deployments, and infrastructure security across AWS environments"
        ]
    },
    {
        name:"Full Stack Developer",
        title:"Future Makers",
        location:"Bangkok, Thailand",
        startDate:new Date("2024/09/16"),
        endDate: new Date("2025/09/30"),
        website:"https://www.linkedin.com/company/future-makers-living",
        description: [
            "Developed and successfully delivered the Purchase Order feature, enhancing operational efficiency and order management.",
            "Diagnosed and optimized GitHub Actions CI/CD pipelines, significantly improving build and deployment performance.",
            "Implemented zero-downtime deployment strategies to ensure seamless production releases.",
            "Designed and implemented the Promotion feature for orders, enabling dynamic discount and campaign management.",
            "Led the MongoDB version migration, ensuring data integrity and system stability during the transition.",
            "Architected and developed a multi-channel chat system from scratch, integrating major platforms such as Facebook, LINE, Shopee, and others — allowing users to manage and respond to all customer conversations from a unified interface.",
            "Upgraded TikTok Shop API integration to the latest version for enhanced partner compatibility.",
            "Integrated Noc Noc order system with the internal ERP from scratch, streamlining cross-platform order synchronization and automation.",
            "Set up Grafana and Prometheus for real-time Docker container monitoring, enabling resource tracking, alerting, and visualization across services.",
            "Implemented and migrated background job processing from NestJS Bull (Redis) to RabbitMQ, improving message reliability, scalability, and system throughput."
        ]
    },
    {
        name:"Freelance Software Developer",
        title:"Thamardaw",
        location:" Multiple Clients (Asia & UK)",
        startDate:new Date("2024/05/01"),
        endDate: new Date("2024/09/01"),
        website:"https://www.linkedin.com/in/lwinmgmg/",
        description: [
            "Implemented a comprehensive medical record backend system to streamline patient data management and improve healthcare efficiency including CI/CD.",
            "Developing REST APIs for seamless mobile integration with the medical record system.",
            "Currently developing and enhancing cross-platform mobile applications using Flutter for both Android and iOS, ensuring optimal performance and user experience.",
            "Currently integrating third-party applications such as payment systems, Google login, and Zoom meetings into cross-platform mobile apps using Flutter."
        ]
    },
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
            <div className="">
                <div className="flex flex-col py-8 rounded-3xl bg-slate-100 dark:bg-slate-800">
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
            </div>
            <div className="py-8 rounded-3xl flex flex-col bg-slate-100 dark:bg-slate-800">
                <h4 className="text-md font-semibold px-2">Achievements and Responsibilities</h4>
                <div className="flex-grow">
                    <ul className="list-disc max-w-full text-sm px-8 mt-1 text-justify space-y-1 overflow-y-auto">
                        {
                            experiences[selectedId].description.map((desc)=>(<li key={desc}>{desc}</li>))
                        }
                    </ul>
                </div>
            </div>
        </div>
    );
}