import { resetPasswordAction } from "@/features/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TextField } from "@/components/ui/form";
import { PageNotice } from "@/components/ui/page-notice";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Choose a new password</CardTitle>
        <CardDescription>Set a fresh password for your TRACKED account.</CardDescription>
      </CardHeader>
      <CardContent>
        <PageNotice error={params.error} />
        <form action={resetPasswordAction} className="space-y-4">
          <TextField label="New password" name="password" type="password" required />
          <Button type="submit" className="w-full">
            Update password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
