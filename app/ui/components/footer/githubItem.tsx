import GitHubIcon from "../projects/GitHubIcon";
import LinkItem from "./LinkItem";

export default function GithubItem({
    href,
    name
}:{
    href: string,
    name: string
}){
    return (
        <LinkItem href={href} name={name} label="Github">
            <GitHubIcon className="size-2" />
        </LinkItem>
    );
}