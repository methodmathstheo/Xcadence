import Link from "next/link";
import { featuredMedia, posts, profile, resolveMedia, venues, formatDate } from "@/lib/content";
import FeaturedStrip from "@/components/FeaturedStrip";
import Ticker from "@/components/Ticker";

function Section({ n, title, children, id }: { n: string; title: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="scroll-mt-16 border-t hairline px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
      <div className="grid gap-8 lg:grid-cols-12">
        <div className="flex items-baseline gap-4 lg:col-span-3 lg:block">
          <span className="mono reveal">{n}</span>
          <h2 className="display reveal text-4xl sm:text-5xl lg:mt-2 lg:text-6xl">{title}</h2>
        </div>
        <div className="lg:col-span-9">{children}</div>
      </div>
    </section>
  );
}

export default function Home() {
  // Hero: the Dance On Arrival London clip plays once the .mp4 is pulled; the Studio 338 crowd shot is the still.
  const heroVideoPost = posts.find((p) => p.shortcode === "DQ2oJV2iOj6")!;
  const heroVideo = resolveMedia(heroVideoPost, heroVideoPost.media[0]);
  const heroStillPost = posts.find((p) => p.shortcode === "DcBPEN-jdmV")!;
  const heroStill = resolveMedia(heroStillPost, heroStillPost.media[0]);
  const feat = featuredMedia();
  const recent = venues.slice(0, 4);
  const tickerItems = venues.map((v) => v.name).concat(["House", "Tech House", "East London", "Essex"]);
  const player = `https://w.soundcloud.com/player/?url=${encodeURIComponent(profile.soundcloudTrack)}&color=%23d8ff2e&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false&visual=true`;

  return (
    <>
      {/* Hero */}
      <section className="grain vignette relative flex min-h-[100svh] flex-col justify-end overflow-hidden">
        <div className="absolute inset-0">
          {heroVideo.videoSrc ? (
            <video src={heroVideo.videoSrc} poster={heroVideo.src} autoPlay muted loop playsInline className="h-full w-full object-cover" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={heroStill.src} alt="" className="drift h-full w-full object-cover" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/30 to-ink/20" />
        </div>

        <div className="relative px-5 pb-6 sm:px-8 lg:px-12 lg:pb-8">
          <div className="rise rise-1 mb-5 flex flex-wrap items-center gap-x-6 gap-y-2">
            <span className="mono flex items-center gap-2 text-bone">
              <span className="pulse inline-block h-2 w-2 rounded-full bg-acid" />
              Available for bookings
            </span>
            <span className="mono">DJ / Producer</span>
            <span className="mono">House / Tech House</span>
            <span className="mono">East London / Essex</span>
          </div>
          <h1 className="display rise rise-2 text-[26vw] text-bone sm:text-[20vw] lg:text-[17vw]">
            Henry
            <br />
            Hamilton
          </h1>
          <div className="rise rise-3 mt-6 flex flex-wrap items-center gap-x-8 gap-y-3">
            <a href="#book" className="mono inline-flex items-center gap-3 bg-acid px-5 py-3 !text-ink transition-opacity hover:opacity-85">
              Book Henry →
            </a>
            <a href={profile.instagram} target="_blank" rel="noreferrer" className="mono hover:text-bone transition-colors">
              @{profile.username} · {profile.followersLabel}
            </a>
            <a href="#listen" className="mono hover:text-bone transition-colors">
              Listen
            </a>
          </div>
        </div>
        <Ticker items={tickerItems} className="relative mt-6 bg-ink/70 backdrop-blur-sm" />
      </section>

      {/* About */}
      <Section n="01" title="About">
        <p className="reveal max-w-3xl text-2xl leading-[1.25] text-bone sm:text-3xl lg:text-[2.6rem] lg:leading-[1.15]">
          House and tech house with weight behind it. Henry plays the kind of records that fill a floor slowly and keep it
          there: warm, groove led, built for the long set.
        </p>
        <div className="reveal mt-10 grid gap-8 sm:grid-cols-2">
          <p className="text-base leading-relaxed text-bone-2">
            Raised between Essex and East London, Henry came up through the Dance On Arrival family and has taken the sound
            from Studio 338 to the beach clubs of Phuket, with a Circoloco showcase and a B2B with Kodie along the way.
          </p>
          <p className="text-base leading-relaxed text-bone-2">
            Away from the booth he produces his own music. His first mix series, Every Sound Has Roots, is out now on
            SoundCloud, with a run of unreleased originals (Gimme Sum, Don&apos;t Go, Can You) on the way.
          </p>
        </div>
      </Section>

      {/* Selected */}
      <section className="border-t hairline px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
        <div className="mb-8 flex items-end justify-between">
          <div className="flex items-baseline gap-4">
            <span className="mono reveal">02</span>
            <h2 className="display reveal text-4xl sm:text-5xl lg:text-6xl">Selected</h2>
          </div>
          <Link href="/gallery" className="mono reveal hover:text-acid transition-colors">
            Full gallery →
          </Link>
        </div>
        <FeaturedStrip items={feat} />
      </section>

      {/* Played at */}
      <Section n="03" title="Played at">
        <ol>
          {recent.map((v, i) => (
            <li
              key={v.id}
              className="reveal flex flex-col gap-1 border-b hairline py-5 sm:flex-row sm:items-baseline sm:justify-between"
              style={{ transitionDelay: `${i * 70}ms` }}
            >
              <Link href={`/venues#${v.id}`} className="display text-3xl hover:text-acid transition-colors sm:text-4xl">
                {v.name}
              </Link>
              <span className="mono">
                {v.location} · {formatDate(v.dates[v.dates.length - 1], { month: "short", year: "numeric" })}
              </span>
            </li>
          ))}
        </ol>
        <Link href="/venues" className="mono reveal mt-8 inline-block hover:text-acid transition-colors">
          All venues →
        </Link>
      </Section>

      {/* Listen */}
      <Section n="04" title="Listen" id="listen">
        <div className="reveal">
          <p className="mono mb-4">{profile.soundcloudTrackTitle}</p>
          <div className="overflow-hidden border hairline bg-ink-2">
            <iframe
              title="Henny Live Mix, Volume 001 on SoundCloud"
              width="100%"
              height="300"
              scrolling="no"
              frameBorder="no"
              allow="autoplay"
              loading="lazy"
              src={player}
            />
          </div>
          <a href={profile.soundcloudProfile} target="_blank" rel="noreferrer" className="mono mt-4 inline-block hover:text-acid transition-colors">
            More on SoundCloud →
          </a>
        </div>
      </Section>

      {/* Book */}
      <Section n="05" title="Book" id="book">
        <div className="reveal">
          <p className="display text-4xl leading-[0.9] sm:text-5xl lg:text-7xl">
            Clubs. Festivals.
            <br />
            Day parties. Private.
            <br />
            UK and abroad.
          </p>
          <p className="mt-8 max-w-md text-bone-2">Send the date, venue and set length and Henry will come straight back to you.</p>
          <a
            href={`mailto:${profile.bookingEmail}?subject=Booking%20enquiry`}
            className="mono mt-10 inline-flex items-center gap-3 bg-acid px-6 py-4 !text-ink transition-opacity hover:opacity-85"
          >
            {profile.bookingEmail}
          </a>
        </div>
      </Section>
    </>
  );
}
