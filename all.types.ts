type Menu = {
    title: string,
    href: string
}

type Message = {
    parts: Array<{
        text: string
    }>,
    role: "user" | "model"
}
