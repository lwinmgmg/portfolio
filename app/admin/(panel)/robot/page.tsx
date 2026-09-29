import { Robot, type RobotTheme } from "@/app/(public)/_components/robot/robot";
import { ROBOT_MOODS, ROBOT_NAME } from "@/app/(public)/_components/robot/robot-mood";
import { note } from "@/app/admin/(panel)/rag/rag-styles";
import { requireAdmin } from "@/server/services/auth-service";

// Each panel forces its scheme, so both show whatever the system is set to.
const PANELS: { theme: RobotTheme; label: string; className: string }[] = [
  { theme: "light", label: "Light", className: "border-zinc-200 bg-white text-zinc-900" },
  { theme: "dark", label: "Dark", className: "border-zinc-700 bg-[#0a0a0a] text-zinc-100" },
];

export default async function RobotAdminPage() {
  await requireAdmin();

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <h2 className="text-lg font-semibold">Robot</h2>
      <p className={note}>
        Every mood of {ROBOT_NAME}, the robot that opens the chat. Each one shows at 128 px and 64 px,
        and still, as visitors who turn on reduced motion see it. With reduced motion on in your
        system settings, nothing on this page moves.
      </p>
      {PANELS.map((panel) => (
        <section
          key={panel.theme}
          aria-labelledby={`robot-${panel.theme}`}
          className={`space-y-4 rounded-lg border p-4 shadow-sm ${panel.className}`}
        >
          <h3 id={`robot-${panel.theme}`} className="font-semibold">
            {panel.label}
          </h3>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-4">
            {ROBOT_MOODS.map((mood) => (
              <li key={mood} className="space-y-2">
                <p className="font-mono text-sm">{mood}</p>
                <div className="flex items-end gap-3">
                  <Robot mood={mood} theme={panel.theme} className="size-32" />
                  <Robot mood={mood} theme={panel.theme} className="size-16" />
                  <Robot mood={mood} theme={panel.theme} className="size-16" still />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
