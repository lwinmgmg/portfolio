import { redirect } from "next/navigation";

// The CV workspace is the admin landing page.
export default function AdminPage() {
  redirect("/admin/cv");
}
