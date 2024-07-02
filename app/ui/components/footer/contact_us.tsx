import EmailItem from "./email_item";
import GithubItem from "./github_item";
import PhoneItem from "./phone_item";

export default function ContactUs(){
    return (
        <div className="space-y-5"id="contact-us">
            <h3 className="text-lg font-semibold">Contact Me</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-1 lg:gap-5">
                <ul className="space-y-1">
                    <li>
                        <EmailItem email="lwinmaungmaung.ytu@gmail.com" />
                    </li>
                    <li>
                        <PhoneItem phone="+66842783635" />
                    </li>
                    <li>
                        <GithubItem href="https://www.github.com/lwinmgmg" name="github.com/lwinmgmg" />
                    </li>
                </ul>
                <ul className="space-y-1">
                    <li>
                        <EmailItem email="lwinmaungmaung.ytu@gmail.com" />
                    </li>
                    <li>
                        <PhoneItem phone="+66842783635" />
                    </li>
                </ul>
            </div>
        </div>
    );
}