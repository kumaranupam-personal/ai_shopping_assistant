import clsx from "clsx";
import { Activity, Cpu, Gauge, Languages, Search, ShieldCheck, type LucideIcon } from "lucide-react";

import ThemeSwitch from "../components/ThemeSwitch";
import { about, type IconName } from "./content";
import { NewTabLink, REPLAY_ID, scrollToReplay } from "./links";
import Replay from "./Replay";
import { Column, SectionHeading } from "./Section";

const ICONS: Record<IconName, LucideIcon> = { Cpu, ShieldCheck, Search, Languages, Activity, Gauge };

const CTA = "bg-accent font-semibold text-accent-fg transition-opacity duration-150 ease-out hover:opacity-90";

/**
 * The about page (docs/12-about-page.md, Structure): one column on surface-muted that scrolls inside its own root,
 * because the shared base styles keep the document body from scrolling.
 */
export default function AboutPage() {
  return (
    <div className="h-full overflow-y-auto bg-surface-muted">
      <Header />
      <main className="flex flex-col gap-10 pt-10 sm:gap-16 sm:pt-16">
        <Hero />
        <Column>
          <Replay />
        </Column>
        <Column>
          <Features />
        </Column>
        <Column>
          <Evidence />
        </Column>
        <Closing />
      </main>
      <Footer />
    </div>
  );
}

function Header() {
  const { header, repositoryUrl, linkedinUrl, chatUrl } = about;
  return (
    <header className="border-b border-line">
      <Column className="flex h-14 items-center justify-between gap-3">
        <span className="truncate font-serif text-2xl leading-none font-medium">{header.wordmark}</span>
        <nav className="flex shrink-0 items-center gap-2 sm:gap-4">
          <a href={`#${REPLAY_ID}`} onClick={scrollToReplay} className="hidden text-sm font-medium text-fg-muted hover:text-fg sm:inline">
            {header.howItWorks}
          </a>
          {/* Below 640 px the header's links are hidden; the wrappers hide these, since a link sets its own display. */}
          <span className="hidden sm:inline-flex">
            <NewTabLink href={repositoryUrl} className="text-sm font-medium text-fg-muted hover:text-fg">
              {header.github}
            </NewTabLink>
          </span>
          <span className="hidden sm:inline-flex">
            <NewTabLink href={linkedinUrl} className="text-sm font-medium text-fg-muted hover:text-fg">
              {header.linkedin}
            </NewTabLink>
          </span>
          <ThemeSwitch />
          <NewTabLink href={chatUrl} className={clsx("h-8 rounded-lg px-3 text-sm", CTA)}>
            {header.cta}
          </NewTabLink>
        </nav>
      </Column>
    </header>
  );
}

function Hero() {
  const { hero, chatUrl } = about;
  return (
    <Column className="flex flex-col items-center gap-5 text-center">
      <h1 className="font-serif text-[36px] leading-[1.1] font-medium tracking-[-0.02em] text-balance sm:text-5xl sm:leading-[1.05]">{hero.heading}</h1>
      <p className="max-w-[560px] text-fg-muted text-balance">{hero.line}</p>
      <div className="mt-2 flex flex-wrap justify-center gap-3">
        <NewTabLink href={chatUrl} className={clsx("h-11 rounded-lg px-5", CTA)}>
          {hero.cta}
        </NewTabLink>
        <a
          href={`#${REPLAY_ID}`}
          onClick={scrollToReplay}
          className="inline-flex h-11 items-center rounded-lg border border-line-strong bg-surface px-5 font-medium transition-colors duration-150 ease-out hover:bg-tile"
        >
          {hero.secondary}
        </a>
      </div>
    </Column>
  );
}

function Features() {
  const { features } = about;
  return (
    <section aria-labelledby="features-heading" className="flex flex-col gap-6">
      <SectionHeading id="features-heading" heading={features.heading} line={features.line} />
      <ul className="grid grid-cols-1 gap-4 min-[600px]:grid-cols-2 min-[900px]:grid-cols-3">
        {features.cards.map(({ icon, title, text }) => {
          const Icon = ICONS[icon];
          return (
            <li key={title} className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5">
              <span className="grid size-9 place-items-center rounded-lg bg-accent-soft text-accent-soft-fg">
                <Icon aria-hidden className="size-[18px]" />
              </span>
              <h3 className="font-semibold">{title}</h3>
              <p className="text-sm text-fg-muted">{text}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Evidence() {
  const { evidence } = about;
  return (
    <section aria-labelledby="evidence-heading" className="flex flex-col gap-6">
      <SectionHeading id="evidence-heading" heading={evidence.heading} line={evidence.line} />
      <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {evidence.tiles.map(({ label, value }) => (
          <div key={label} className="flex flex-col gap-1 rounded-lg bg-tile p-4">
            <dt className="text-xs text-fg-muted">{label}</dt>
            <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-5">
        <h3 className="font-semibold">{evidence.note.title}</h3>
        <p className="text-sm text-fg-muted">{evidence.note.text}</p>
        <NewTabLink href={evidence.note.url} className="self-start text-sm font-medium text-accent underline-offset-2 hover:underline">
          {evidence.note.link}
        </NewTabLink>
      </div>
    </section>
  );
}

function Closing() {
  const { closing, chatUrl } = about;
  return (
    <section aria-labelledby="closing-heading" className="bg-panel py-14 sm:py-16">
      <Column className="flex flex-col items-center gap-4 text-center">
        <h2 id="closing-heading" className="font-serif text-[30px] leading-tight font-medium text-balance text-panel-accent">
          {closing.heading}
        </h2>
        <p className="text-panel-muted text-balance">{closing.line}</p>
        <NewTabLink
          href={chatUrl}
          className="mt-2 h-11 rounded-lg bg-panel-accent px-5 font-semibold text-panel-accent-fg transition-opacity duration-150 ease-out hover:opacity-90 focus-visible:outline-panel-accent"
        >
          {closing.cta}
        </NewTabLink>
      </Column>
    </section>
  );
}

function Footer() {
  const { footer, repositoryUrl, linkedinUrl } = about;
  return (
    <footer className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-6 text-center text-xs text-fg-muted">
      <span>{footer.text}</span>
      <NewTabLink href={repositoryUrl} className="font-medium underline-offset-2 hover:text-fg hover:underline">
        {footer.github}
      </NewTabLink>
      <NewTabLink href={linkedinUrl} className="font-medium underline-offset-2 hover:text-fg hover:underline">
        {footer.linkedin}
      </NewTabLink>
    </footer>
  );
}
