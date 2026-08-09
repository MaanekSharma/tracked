import Link from "next/link";
import { forgotPasswordAction } from "@/features/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TextField } from "@/components/ui/form";
import { PageNotice } from "@/components/ui/page-notice";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reset password</CardTitle>
        <CardDescription>We will send a secure reset link to your email.</CardDescription>
      </CardHeader>
      <CardContent>
        <PageNotice error={params.error} />
        <form action={forgotPasswordAction} className="space-y-4">
          <TextField label="Email" name="email" type="email" required />
          <Button type="submit" className="w-full">
            Send reset link
          </Button>
        </form>
        <Link href="/login" className="mt-4 block text-center text-sm font-semibold text-primary hover:underline">
          Back to sign in
        </Link>
      </CardContent>
    </Card>
  );
}
