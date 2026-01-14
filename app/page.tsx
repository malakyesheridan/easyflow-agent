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
          <a href="/prospecting" className="rounded-lg bg-bg-card p-6 shadow-soft hover:shadow-lift transition-shadow">
            <p className="text-sm font-semibold text-text-primary">Prospecting</p>
            <p className="mt-1 text-sm text-text-secondary">Build a pipeline of future sellers.</p>
          </a>
          <a href="/contacts" className="rounded-lg bg-bg-card p-6 shadow-soft hover:shadow-lift transition-shadow">
            <p className="text-sm font-semibold text-text-primary">Contacts</p>
            <p className="mt-1 text-sm text-text-secondary">Nurture past sellers and long-term contacts.</p>
          </a>
          <a href="/appraisals" className="rounded-lg bg-bg-card p-6 shadow-soft hover:shadow-lift transition-shadow">
            <p className="text-sm font-semibold text-text-primary">Appraisals</p>
            <p className="mt-1 text-sm text-text-secondary">Track booked appraisals and outcomes.</p>
          </a>
          <a href="/listings" className="rounded-lg bg-bg-card p-6 shadow-soft hover:shadow-lift transition-shadow">
            <p className="text-sm font-semibold text-text-primary">Listings</p>
            <p className="mt-1 text-sm text-text-secondary">Monitor active campaigns and vendor updates.</p>
          </a>
          <a href="/daily-plan" className="rounded-lg bg-bg-card p-6 shadow-soft hover:shadow-lift transition-shadow">
            <p className="text-sm font-semibold text-text-primary">Follow-ups</p>
            <p className="mt-1 text-sm text-text-secondary">Stay on top of priority seller tasks.</p>
          </a>
          <a href="/schedule" className="rounded-lg bg-bg-card p-6 shadow-soft hover:shadow-lift transition-shadow">
            <p className="text-sm font-semibold text-text-primary">Calendar</p>
            <p className="mt-1 text-sm text-text-secondary">Coordinate open homes and inspections.</p>
          </a>
        </div>
      </div>
    </div>
  );
}
