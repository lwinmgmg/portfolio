import Link from "next/link";
import NavWebMenu from "./NavWebMenu";
import NavMobileMenu from "./NavMobileMenu";

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
                <div className="menu block lg:hidden">
                    <NavMobileMenu menus={menus} />
                </div>
                <div className="menu hidden lg:block lg:w-auto">
                    <NavWebMenu menus={menus} />
                </div>
            </div>
        </nav>
    );
}