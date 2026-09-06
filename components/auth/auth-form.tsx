"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { GithubIcon } from "@/components/ui/brand-icons";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export type AuthMode = "login" | "register";

interface AuthFormProps {
  mode: AuthMode;
}

export function AuthForm({ mode }: AuthFormProps): React.ReactElement {
  const router = useRouter();
  const [loading, setLoading] = React.useState<"demo" | "github" | null>(null);

  const isLogin = mode === "login";

  const handleDemo = async (): Promise<void> => {
    setLoading("demo");
    try {
      const res = await signIn("demo", { redirect: false });
      if (res?.ok) {
        router.push("/dashboard");
        router.refresh();
      }
    } finally {
      setLoading(null);
    }
  };

  const handleGithub = (): void => {
    setLoading("github");
    void signIn("github", { callbackUrl: "/dashboard", redirect: true });
  };

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={() => void handleDemo()}
        disabled={loading !== null}
        className="group relative w-full overflow-hidden rounded-btn2 bg-gradient-to-r from-primary to-primary-deep px-5 py-3.5 text-sm font-bold text-white shadow-btn-primary transition-all duration-300 hover:-translate-y-0.5 hover:shadow-btn-primary-hover disabled:opacity-60"
      >
        <span className="relative z-10 flex items-center justify-center gap-2">
          {loading === "demo" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Explore with demo access
        </span>
        <span className="absolute inset-y-0 left-0 w-1/3 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-[300%]" />
      </button>

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

      <Button
        type="button"
        variant="outline"
        className="w-full gap-2 py-5 font-semibold text-slate-700"
        disabled={loading !== null}
        onClick={handleGithub}
        loading={loading === "github"}
      >
        <GithubIcon className="h-4 w-4" />
        Continue with GitHub
      </Button>

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
