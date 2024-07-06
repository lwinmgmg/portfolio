import ContactUs from "../components/footer/contactUs"

export default function Footer(){
    return (
        <footer className="w-full bg-slate-200 dark:bg-slate-800">
            <div className="container px-12 py-5 mx-auto">
                <ContactUs />
            </div>
            <p className="text-center text-xs pb-3">&copy; 2024 Lwin Maung Maung</p>
        </footer>
    );
}