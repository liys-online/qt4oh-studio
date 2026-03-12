import { redirect } from "next/navigation";
import RegisterPageClient from "./_client";

export default function RegisterPage() {
  if (process.env.ELECTRON_MODE === "1") {
    redirect("/");
  }
  return <RegisterPageClient />;
}
