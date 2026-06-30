import { redirect } from "next/navigation"

/** No marketing root — send visitors to the dashboard (which gates on auth). */
export default function Page() {
  return redirect("/dashboard")
}
