"use client";

export default function DarkModeSwitch(){
    const onClick = ()=>{
        const theme = localStorage.getItem("color-theme");
        localStorage.setItem("color-theme", theme && theme === "light" ? "dark":"light");
        document.documentElement.classList.remove(theme || "")
        const newTheme = localStorage.getItem("color-theme");
        document.documentElement.classList.add(newTheme || "")
    }
    return (
        <button onClick={onClick}>Switch Mode</button>
    );
}