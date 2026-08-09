import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="fixed inset-0 -z-10 dashboard-grid" />
      <div className="w-full max-w-md">
        <Link href="/" className="mb-6 block text-center text-2xl font-black tracking-[0.14em]">
          TRACKED
        </Link>
        {children}
      </div>
    </main>
  );
}
