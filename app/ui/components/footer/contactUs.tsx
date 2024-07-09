import EmailItem from "./emailItem";
import FacebookItem from "./facebookItem";
import GithubItem from "./githubItem";
import LinkedinItem from "./linkedinItem";
import PhoneItem from "./phoneItem";

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
                        <PhoneItem phone="+66 842 783 635" />
                    </li>
                </ul>
                <ul className="space-y-1">
                    {/* <li>
                        <FacebookItem href="https://www.facebook.com/lwinmgmg97" name="facebook.com/lwinmgmg97" />
                    </li> */}
                    <li>
                        <GithubItem href="https://www.github.com/lwinmgmg" name="github.com/lwinmgmg" />
                    </li>
                    <li>
                        <LinkedinItem href="https://www.linkedin.com/in/lwinmgmg/" name="linkedin.com/in/lwinmgmg" />
                    </li>
                </ul>
            </div>
        </div>
    );
}