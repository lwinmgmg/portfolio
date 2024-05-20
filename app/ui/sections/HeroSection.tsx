import Image from "next/image";

import TextAnimator from "../components/TextAnimator";


export default function HeroSection(){
    return (
        <section>
            <div className="grid grid-cols-1 lg:grid-cols-12">
                <div className="col-span-7 w-full place-self-center text-center lg:text-left">
                    <h1 className="mb-4 text-4xl lg:text-6xl font-extrabold">
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-green-400">Hello, I&apos;m {" "}</span>
                        <br/>
                        <TextAnimator />
                    </h1>
                    <p className="text-lg lg:text-xl ">Thank you for visiting my Portfolio Website. If you want to contribute the design and source code, please visit <a className="text-blue-500 dark:text-blue-300 underline capitalize" href="https://github.com/lwinmgmg/portfolio" target="_blank">here</a>.</p>
                    <div className="space-y-3 lg:space-x-3 mt-3">
                        <button className="px-6 py-3 rounded-full w-full lg:w-fit text-white bg-gradient-to-r from-blue-400 to-green-400 hover:from-green-400 hover:to-blue-400">Hire Me</button>
                        <button className="px-6 py-3 rounded-full w-full lg:w-fit dark:bg-transparent border border-black dark:text-white dark:bg-slate-800 dark:border-white hover:bg-slate-400">Download Resume</button>
                    </div>
                </div>
                <div className="col-span-5 place-self-center mt-4 lg:mt-0">
                    <div className="rounded-full w-[350px] h-[350px] lg:w-[400px] lg:h-[400px] relative bg-gray-100 dark:bg-slate-800">
                        <Image className="absolute transform -translate-x-1/2 -translate-y-1/2 top-1/2 left-1/2" src="/images/avatar.jpg" alt="Avatar" width={300} height={300} priority />
                    </div>
                </div>
            </div>
        </section>
    );
}