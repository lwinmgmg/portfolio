import Link from "next/link";
import ContactItem from "./contact_item";
import GitHubIcon from "../projects/GitHubIcon";

export default function GithubItem({
    href,
    name
}:{
    href: string,
    name: string
}){
    return (
        <ContactItem>
                <div>
                    <GitHubIcon className="size-6" />
                </div>
                <p>Github : </p>
                <p><Link target="_next" href={href}>{name}</Link></p>
        </ContactItem>
    );
}