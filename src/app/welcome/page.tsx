import { redirect } from "next/navigation";

/**
 * The combined landing-and-login screen that used to live here is now split
 * into `/` and `/login`. Kept as a redirect rather than deleted: the old URL
 * has already been shared with people.
 */
export default function WelcomeRedirect() {
  redirect("/");
}
