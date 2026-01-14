export default function Home() {
  return (
    <div className="min-h-screen bg-bg-base">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-text-primary">Agent OS (Real Estate)</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Lead-centric workflows for modern real estate teams.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <a href="/leads" className="rounded-lg bg-bg-card p-6 shadow-soft hover:shadow-lift transition-shadow">
            <p className="text-sm font-semibold text-text-primary">Leads</p>
            <p className="mt-1 text-sm text-text-secondary">Capture and qualify new inquiries in one inbox.</p>
          </a>
          <a href="/pipeline" className="rounded-lg bg-bg-card p-6 shadow-soft hover:shadow-lift transition-shadow">
            <p className="text-sm font-semibold text-text-primary">Pipeline</p>
            <p className="mt-1 text-sm text-text-secondary">Track deals from first contact to close.</p>
          </a>
          <a href="/daily-plan" className="rounded-lg bg-bg-card p-6 shadow-soft hover:shadow-lift transition-shadow">
            <p className="text-sm font-semibold text-text-primary">Daily Plan</p>
            <p className="mt-1 text-sm text-text-secondary">Prioritize follow-ups, showings, and tasks.</p>
          </a>
          <a href="/schedule" className="rounded-lg bg-bg-card p-6 shadow-soft hover:shadow-lift transition-shadow">
            <p className="text-sm font-semibold text-text-primary">Calendar</p>
            <p className="mt-1 text-sm text-text-secondary">Coordinate showings, tours, and key milestones.</p>
          </a>
        </div>
      </div>
    </div>
  );
}
