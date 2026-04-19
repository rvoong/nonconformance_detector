import { redirect } from "next/navigation";

/**
 * Root route - redirect to login.
 */
export default function RootPage() {
    redirect("/login");
}
