import Link from "next/link";

type Menu = {
    title: string,
    href: string
}

const menus: Array<Menu> = [
    {
        title: "About",
        href: "#about"
    },
    {
        title: "Projects",
        href: "#projects"
    },
    {
        title: "Certifications",
        href: "#certifications"
    },
    {
        title: "Contact",
        href: "#contact"
    }
]

export default function NavBar(){
    return (
        <nav className="w-full fixed top-0 left-0 z-10 bg-opacity-50">
            <div className="flex flex-row flex-wrap items-center justify-between mx-auto p-8">
                <Link href={"/"} className="text-5xl font-semibold dark:text-slate-100 dark:hover:text-white">LOGO</Link>
                <div className="menu hidden lg:block lg:w-auto">
                    <ul className="flex flex-row">
                        {
                            menus.length>0 ? menus.map(({title, href})=>
                                (<li key={title}><Link href={href} className="block py-3 px-4 dark:text-slate-200 dark:hover:text-white font-bold">{title}</Link></li>))
                                : null
                        }
                    </ul>
                </div>
            </div>
        </nav>
    );
}