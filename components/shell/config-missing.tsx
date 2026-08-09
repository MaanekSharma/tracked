import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ConfigMissing() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="max-w-xl">
        <CardHeader>
          <div className="mb-3 flex size-10 items-center justify-center rounded-md bg-destructive/10 text-destructive">
            <ShieldAlert className="size-5" />
          </div>
          <CardTitle>Supabase is not configured</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            TRACKED is built against Supabase Auth and PostgreSQL. Add `NEXT_PUBLIC_SUPABASE_URL` and
            `NEXT_PUBLIC_SUPABASE_ANON_KEY` to `.env.local`, run the migration, then restart the dev server.
          </p>
          <Button asChild>
            <Link href="/login">Go to auth</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
