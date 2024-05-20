import Link from "next/link";
import NavWebMenu from "./NavWebMenu";
import NavMobileMenu from "./NavMobileMenu";
import DarkModeSwitch from "./DarkModeSwitch";

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
            <div className="relative">
                <div className="flex flex-row flex-wrap items-center justify-between mx-auto px-8 py-5">
                    <Link href={"/"} className="text-5xl font-semibold text-slate-800 hover:text-slate-500 dark:text-slate-100 dark:hover:text-white">LOGO</Link>
                    <div className="flex flex-row items-center">
                        <div className="mr-2 relative z-30">
                            <DarkModeSwitch />
                        </div>
                        <div className="menu block lg:hidden">
                            <NavMobileMenu menus={menus} />
                        </div>
                        <div className="menu hidden lg:block lg:w-auto">
                            <NavWebMenu menus={menus} />
                        </div>
                    </div>
                </div>
            </div>
        </nav>
    );
}