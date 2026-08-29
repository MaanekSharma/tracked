function Block({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />;
}

export default function OverviewLoading() {
  return (
    <div aria-label="Loading character dashboard" aria-busy="true" className="space-y-5">
      <div className="rounded-lg border bg-card p-6">
        <Block className="h-3 w-28" />
        <Block className="mt-5 h-10 w-64" />
        <Block className="mt-5 h-3 w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        {Array.from({ length: 7 }, (_, index) => <Block key={index} className="h-32 border" />)}
      </div>
      <div className="grid gap-4 xl:grid-cols-12">
        <Block className="h-72 xl:col-span-7" />
        <Block className="h-72 xl:col-span-5" />
        <Block className="h-56 xl:col-span-5" />
        <Block className="h-56 xl:col-span-7" />
      </div>
      <span className="sr-only">Loading LIFE RPG data</span>
    </div>
  );
}
