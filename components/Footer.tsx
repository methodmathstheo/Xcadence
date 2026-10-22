import { profile } from "@/lib/content";

export default function Footer() {
  return (
    <footer className="border-t hairline px-5 pb-8 pt-12 sm:px-8 lg:px-12">
      <div className="grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-6">
          <p className="display text-[18vw] leading-[0.82] sm:text-[12vw] lg:text-[8vw]">
            Henry
            <br />
            Hamilton
          </p>
        </div>
        <div className="grid grid-cols-2 gap-8 lg:col-span-6 lg:pt-3">
          <div>
            <p className="mono mb-4">Follow</p>
            <ul className="space-y-2 text-sm">
              <li>
                <a className="hover:text-acid transition-colors" href={profile.instagram} target="_blank" rel="noreferrer">
                  Instagram ↗
                </a>
              </li>
              <li>
                <a className="hover:text-acid transition-colors" href={profile.soundcloudProfile} target="_blank" rel="noreferrer">
                  SoundCloud ↗
                </a>
              </li>
            </ul>
          </div>
          <div>
            <p className="mono mb-4">Bookings</p>
            <a className="text-sm hover:text-acid transition-colors break-all" href={`mailto:${profile.bookingEmail}`}>
              {profile.bookingEmail}
            </a>
            <p className="mono mt-4">East London · Essex · Worldwide</p>
          </div>
        </div>
      </div>
      <div className="mono mt-14 flex flex-col gap-1 sm:flex-row sm:justify-between" style={{ color: "var(--color-bone-3)" }}>
        <span>© {new Date().getFullYear()} Henry Hamilton</span>
        <span>Site by Theo Elwell</span>
      </div>
    </footer>
  );
}
