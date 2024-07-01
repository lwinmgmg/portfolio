import ContactUs from "../components/footer/contact_us"

export default function Footer(){
    return (
        <footer className="w-full bg-slate-200 dark:bg-slate-800">
            <div className="container grid grid-cols-1 lg:grid-cols-2 px-12 py-5 gap-5 mx-auto">
                <ContactUs />
                <div className="second"></div>
            </div>
            <p className="text-center">&copy; 2024 Lwin Maung Maung</p>
        </footer>
    );
}