"use client";

import * as React from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { GithubIcon } from "@/components/ui/brand-icons";
import { Loader2, Sparkles } from "lucide-react";
import { loginWithGithub, loginWithDemo } from "@/app/actions/auth";

export type AuthMode = "login" | "register";

export interface AuthFormProps {
  mode: AuthMode;
  hasGithub?: boolean;
  hasGoogle?: boolean;
}

function DemoSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="group relative w-full overflow-hidden rounded-btn2 bg-gradient-to-r from-primary to-primary-deep px-5 py-3.5 text-sm font-bold text-white shadow-btn-primary transition-all duration-300 hover:-translate-y-0.5 hover:shadow-btn-primary-hover disabled:opacity-60"
    >
      <span className="relative z-10 flex items-center justify-center gap-2">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        Explore with demo access
      </span>
      <span className="absolute inset-y-0 left-0 w-1/3 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-[300%]" />
    </button>
  );
}

function GithubSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex w-full items-center justify-center gap-2 rounded-btn2 border border-slate-200 bg-white py-3 px-4 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:border-slate-300 disabled:opacity-60"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <GithubIcon className="h-4 w-4" />}
      Continue with GitHub
    </button>
  );
}

export function AuthForm({ mode }: AuthFormProps): React.ReactElement {
  const isLogin = mode === "login";

  return (
    <div className="space-y-5">
      <form action={loginWithDemo}>
        <DemoSubmitButton />
      </form>

      <div className="relative">
        <div className="absolute inset-0 flex items-center" aria-hidden="true">
          <span className="w-full border-t border-line" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-white px-3 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
            or continue with
          </span>
        </div>
      </div>

      <form action={loginWithGithub}>
        <GithubSubmitButton />
      </form>

      <p className="pt-2 text-center text-sm text-muted-foreground">
        {isLogin ? (
          <>
            Don&apos;t have an account?{" "}
            <Link href="/register" className="font-semibold text-primary hover:underline">
              Create one
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-primary hover:underline">
              Sign in
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
