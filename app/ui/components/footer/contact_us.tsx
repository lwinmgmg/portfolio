import EmailItem from "./email_item";
import PhoneItem from "./phone_item";

export default function ContactUs(){
    return (
        <div className="space-y-5"id="contact-us">
            <h3 className="text-lg font-semibold">Contact Me through the following:</h3>
            <ul className="space-y-1">
                <li>
                    <EmailItem email="lwinmaungmaung.ytu@gmail.com" />
                </li>
                <li>
                    <PhoneItem phone="+66842783635" />
                </li>
            </ul>
        </div>
    );
}