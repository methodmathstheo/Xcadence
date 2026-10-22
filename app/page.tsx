import Link from "next/link";
import { featuredMedia, posts, profile, resolveMedia, venues, formatDate } from "@/lib/content";
import FeaturedStrip from "@/components/FeaturedStrip";

export default function Home() {
  const hero = resolveMedia(posts.find((p) => p.shortcode === "DcBPEN-jdmV")!, posts.find((p) => p.shortcode === "DcBPEN-jdmV")!.media[0]);
  const feat = featuredMedia();
  const recent = venues.slice(0, 4);

  return (
    <>
      {/* Hero */}
      <section className="grain relative flex min-h-[100svh] flex-col justify-end overflow-hidden">
        <div className="absolute inset-0">
          {hero.videoSrc ? (
            <video src={hero.videoSrc} poster={hero.src} autoPlay muted loop playsInline className="h-full w-full object-cover" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={hero.src} alt="" className="drift h-full w-full object-cover" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-ink/30" />
        </div>
        <div className="relative px-5 pb-12 sm:px-8 lg:px-12 lg:pb-16">
          <p className="eyebrow rise rise-1">DJ &amp; Producer · East London · Essex</p>
          <h1 className="serif rise rise-2 mt-4 text-[17vw] leading-[0.85] sm:text-[13vw] lg:text-[10.5vw]">
            Henry
            <br />
            Hamilton
          </h1>
          <div className="rise rise-3 mt-8 flex flex-wrap items-center gap-x-8 gap-y-3 text-sm text-bone-2">
            <a href={profile.instagram} target="_blank" rel="noreferrer" className="hover:text-bone transition-colors">
              @{profile.username} · {profile.followersLabel} followers
            </a>
            <a href={profile.soundcloud[0]} target="_blank" rel="noreferrer" className="hover:text-bone transition-colors">
              Listen on SoundCloud ↗
            </a>
            <a href="#book" className="text-brass hover:text-bone transition-colors">
              Book Henry
            </a>
          </div>
        </div>
      </section>

      {/* Bio */}
      <section className="px-5 py-24 sm:px-8 lg:px-12 lg:py-32">
        <div className="grid gap-10 lg:grid-cols-12">
          <p className="eyebrow reveal lg:col-span-3">About</p>
          <div className="reveal lg:col-span-7">
            <p className="serif text-3xl leading-[1.15] sm:text-4xl lg:text-5xl">
              House and garage with weight behind it. Henry Hamilton plays the kind of records that fill a floor slowly and
              keep it there: warm, groove led, built for the long set.
            </p>
            <p className="mt-8 max-w-xl text-base leading-relaxed text-bone-2">
              Raised between Essex and East London, Henry came up through the Dance On Arrival family and has since taken the
              sound from Studio 338 to the beach clubs of Phuket. Alongside the sets he produces his own music, with his first
              mix series, Every Sound Has Roots, out now on SoundCloud and a run of unreleased originals on the way.
            </p>
          </div>
        </div>
      </section>

      {/* Featured */}
      <section className="px-5 pb-24 sm:px-8 lg:px-12 lg:pb-32">
        <div className="mb-8 flex items-end justify-between">
          <h2 className="serif reveal text-4xl sm:text-5xl">Selected</h2>
          <Link href="/gallery" className="eyebrow reveal hover:text-bone transition-colors">
            Full gallery →
          </Link>
        </div>
        <FeaturedStrip items={feat} />
      </section>

      {/* Recently played */}
      <section className="border-t hairline px-5 py-24 sm:px-8 lg:px-12 lg:py-32">
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-3">
            <p className="eyebrow reveal">Recently played</p>
          </div>
          <ol className="lg:col-span-9">
            {recent.map((v, i) => (
              <li key={v.id} className="reveal flex flex-col gap-1 border-b hairline py-6 sm:flex-row sm:items-baseline sm:justify-between" style={{ transitionDelay: `${i * 80}ms` }}>
                <Link href={`/venues#${v.id}`} className="serif text-3xl hover:text-brass transition-colors sm:text-4xl">
                  {v.name}
                </Link>
                <span className="text-sm text-bone-2">
                  {v.location} · {formatDate(v.dates[v.dates.length - 1])}
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div className="mt-10 lg:pl-[25%]">
          <Link href="/venues" className="eyebrow reveal hover:text-bone transition-colors">
            All venues →
          </Link>
        </div>
      </section>

      {/* Book */}
      <section id="book" className="border-t hairline px-5 py-24 sm:px-8 lg:px-12 lg:py-32">
        <div className="grid gap-10 lg:grid-cols-12">
          <p className="eyebrow reveal lg:col-span-3">Bookings</p>
          <div className="reveal lg:col-span-7">
            <h2 className="serif text-4xl leading-tight sm:text-5xl lg:text-6xl">
              Clubs, festivals, day parties and private events. UK and abroad.
            </h2>
            <p className="mt-6 max-w-lg text-bone-2">
              Send dates, venue and set length and Henry will come back to you.
            </p>
            <a
              href={`mailto:${profile.bookingEmail}?subject=Booking%20enquiry`}
              className="mt-10 inline-flex items-center gap-3 border border-brass px-6 py-4 text-sm uppercase tracking-[0.2em] text-brass transition-colors duration-300 hover:bg-brass hover:text-ink"
            >
              {profile.bookingEmail}
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
