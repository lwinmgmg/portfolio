export default function SkillName({children}:{
    children: string
}){
    return (
        <h3 className="text-lg font-semibold">{children}</h3>
    );
}