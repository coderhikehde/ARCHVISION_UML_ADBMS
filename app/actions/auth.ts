"use server";

import { signIn } from "@/lib/auth";

export async function loginWithGithub() {
  await signIn("github", { redirectTo: "/dashboard" });
}

export async function loginWithDemo() {
  await signIn("demo", { redirectTo: "/dashboard" });
}
