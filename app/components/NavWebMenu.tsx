import Link from "next/link";

export default function NavWebMenu({ menus }:{
    menus: Array<Menu>
}){
    return (
        <ul className="flex flex-row">
            {
                menus.length>0 ? menus.map(({title, href})=>
                    (<li key={title}><Link href={href} className="block py-3 px-4 text-slate-800 hover:text-slate-500 dark:text-slate-200 dark:hover:text-white font-bold">{title}</Link></li>))
                    : null
            }
        </ul>
    );
}
