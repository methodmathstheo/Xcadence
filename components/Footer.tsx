import { profile } from "@/lib/content";

export default function Footer() {
  return (
    <footer className="border-t hairline px-5 py-10 sm:px-8 lg:px-12">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="serif text-3xl">Henry Hamilton</p>
          <p className="eyebrow mt-2">DJ &amp; Producer · East London · Essex</p>
        </div>
        <div className="flex flex-col gap-2 text-sm text-bone-2 sm:items-end">
          <a className="hover:text-bone transition-colors" href={profile.instagram} target="_blank" rel="noreferrer">
            Instagram @{profile.username}
          </a>
          <a className="hover:text-bone transition-colors" href={profile.soundcloud[0]} target="_blank" rel="noreferrer">
            SoundCloud
          </a>
          <a className="hover:text-bone transition-colors" href={`mailto:${profile.bookingEmail}`}>
            {profile.bookingEmail}
          </a>
        </div>
      </div>
      <div className="mt-10 flex flex-col gap-1 text-[11px] text-bone-3 sm:flex-row sm:justify-between">
        <span>© {new Date().getFullYear()} Henry Hamilton</span>
        <span>Site by Theo Elwell</span>
      </div>
    </footer>
  );
}
