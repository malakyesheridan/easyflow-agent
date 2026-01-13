export default function Home() {
  return (
    <div className="min-h-screen bg-bg-base">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-text-primary">TGW Operations</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Choose where you want to go.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <a href="/dashboard" className="rounded-lg bg-bg-card p-6 shadow-soft hover:shadow-lift transition-shadow">
            <p className="text-sm font-semibold text-text-primary">Dashboard</p>
            <p className="mt-1 text-sm text-text-secondary">Today-first operational overview.</p>
          </a>
          <a href="/schedule" className="rounded-lg bg-bg-card p-6 shadow-soft hover:shadow-lift transition-shadow">
            <p className="text-sm font-semibold text-text-primary">Schedule</p>
            <p className="mt-1 text-sm text-text-secondary">Plan and view crew workloads.</p>
          </a>
          <a href="/jobs" className="rounded-lg bg-bg-card p-6 shadow-soft hover:shadow-lift transition-shadow">
            <p className="text-sm font-semibold text-text-primary">Jobs</p>
            <p className="mt-1 text-sm text-text-secondary">Track jobs and work progress.</p>
          </a>
          <a href="/notifications" className="rounded-lg bg-bg-card p-6 shadow-soft hover:shadow-lift transition-shadow">
            <p className="text-sm font-semibold text-text-primary">Notifications</p>
            <p className="mt-1 text-sm text-text-secondary">Progress updates and system activity.</p>
          </a>
        </div>
      </div>
    </div>
  );
}
