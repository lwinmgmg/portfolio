export default function SkillMeter({
    percentage
}:{
    percentage: number
}){
    return (
        <div className="w-full h-4 bg-slate-300 dark:bg-slate-500 rounded-full">
            <div className="h-full bg-blue-500 dark:bg-blue-400 rounded-full" style={{
                width: `${percentage}%`
            }}>
            </div>
        </div>
    );
}