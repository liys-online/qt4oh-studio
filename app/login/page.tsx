import { redirect } from "next/navigation";
import LoginPageClient from "./_client";

export default function LoginPage() {
  if (process.env.ELECTRON_MODE === "1") {
    redirect("/");
  }
  return <LoginPageClient />;
}
