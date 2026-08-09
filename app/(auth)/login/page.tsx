import Link from "next/link";
import { signInAction } from "@/features/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TextField } from "@/components/ui/form";
import { PageNotice } from "@/components/ui/page-notice";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = Array.isArray(params.next) ? params.next[0] : params.next;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Access your personal command center.</CardDescription>
      </CardHeader>
      <CardContent>
        <PageNotice notice={params.notice} error={params.error} />
        <form action={signInAction} className="space-y-4">
          <input type="hidden" name="next" value={next ?? "/overview"} />
          <TextField label="Email" name="email" type="email" required />
          <TextField label="Password" name="password" type="password" required />
          <Button type="submit" className="w-full">
            Sign in
          </Button>
        </form>
        <div className="mt-4 flex items-center justify-between text-sm">
          <Link href="/forgot-password" className="font-semibold text-primary hover:underline">
            Forgot password
          </Link>
          <Link href="/sign-up" className="font-semibold text-primary hover:underline">
            Create account
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
