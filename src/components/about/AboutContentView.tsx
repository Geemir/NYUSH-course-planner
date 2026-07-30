"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  Code2,
  ExternalLink,
  Heart,
  Mail,
  MessageCircle,
  QrCode,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AboutContact, AboutContent } from "@/lib/about/types";

function contactIcon(kind: AboutContact["kind"]) {
  if (kind === "email") return Mail;
  if (kind === "wechat") return MessageCircle;
  return ExternalLink;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

/** Renders the admin-editable About content as plain, structured text. */
export function AboutContentView({
  content,
  updatedAt,
}: {
  content: AboutContent;
  updatedAt: string | null;
}) {
  const [qrRevealed, setQrRevealed] = useState(false);
  const donation = content.donation;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-5 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-col gap-4">
        <Button
          variant="ghost"
          size="sm"
          className="w-fit -ml-2"
          nativeButton={false}
          render={<Link href="/" />}
        >
          <ArrowLeft aria-hidden="true" />
          Back to the planner
        </Button>

        <h1 className="text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">
          {content.headline}
        </h1>

        {content.badges.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {content.badges.map((badge) => (
              <Badge key={badge} variant="secondary">
                {badge}
              </Badge>
            ))}
          </div>
        )}

        {/* Split on blank lines so admins can write paragraphs without markup. */}
        <div className="flex flex-col gap-3">
          {content.intro
            .split(/\n\s*\n/)
            .map((paragraph) => paragraph.trim())
            .filter(Boolean)
            .map((paragraph, index) => (
              <p key={index} className="text-sm leading-relaxed text-muted-foreground">
                {paragraph}
              </p>
            ))}
        </div>
      </div>

      {content.links.length > 0 && (
        <Section title="Links">
          <ul className="flex flex-col gap-1.5">
            {content.links.map((link) => (
              <li key={link.url}>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline"
                >
                  {/^https:\/\/github\.com\//i.test(link.url) ? (
                    <Code2 className="size-4" aria-hidden="true" />
                  ) : (
                    <ExternalLink className="size-4" aria-hidden="true" />
                  )}
                  {link.label}
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {content.contributors.length > 0 && (
        <Section title="Contributors">
          <ul className="flex flex-col gap-1.5">
            {content.contributors.map((person) => (
              <li key={person.name} className="text-sm">
                <span className="font-medium">{person.name}</span>
                {person.note && (
                  <span className="text-muted-foreground"> — {person.note}</span>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Testers and special thanks">
        {content.thanks.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {content.thanks.map((person) => (
              <li key={person.name} className="text-sm">
                <span className="font-medium">{person.name}</span>
                {person.note && (
                  <span className="text-muted-foreground"> — {person.note}</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            To be named — if you tested this planner and would like to be credited,
            get in touch.
          </p>
        )}
      </Section>

      {content.contacts.length > 0 && (
        <Section title="Contact">
          <ul className="flex flex-col gap-1.5">
            {content.contacts.map((contact) => {
              const Icon = contactIcon(contact.kind);
              return (
                <li key={`${contact.kind}:${contact.value}`} className="flex items-center gap-2 text-sm">
                  <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="text-muted-foreground">{contact.label}:</span>
                  {contact.kind === "email" ? (
                    <a className="font-medium text-primary underline" href={`mailto:${contact.value}`}>
                      {contact.value}
                    </a>
                  ) : (
                    <span className="font-medium">{contact.value}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {donation && (donation.note || donation.qrImage) && (
        <Section title="Support this project">
          {donation.note && (
            <p className="text-sm leading-relaxed text-muted-foreground">{donation.note}</p>
          )}
          {donation.qrImage ? (
            <div className="flex flex-col items-start gap-2">
              {/* Hidden until tapped, so a payment code is never on screen by default. */}
              <Button
                variant="outline"
                className="h-11 w-fit"
                aria-expanded={qrRevealed}
                onClick={() => setQrRevealed((value) => !value)}
              >
                {qrRevealed ? <Heart aria-hidden="true" /> : <QrCode aria-hidden="true" />}
                {qrRevealed ? "Hide the donation code" : "Show the donation code"}
              </Button>
              {qrRevealed && (
                <figure className="flex flex-col items-start gap-1.5 rounded-xl border bg-card p-3">
                  <Image
                    src={donation.qrImage}
                    alt={donation.qrCaption ?? "Donation QR code"}
                    width={220}
                    height={220}
                    unoptimized
                    className="size-[220px] rounded-lg object-contain"
                  />
                  {donation.qrCaption && (
                    <figcaption className="text-xs text-muted-foreground">
                      {donation.qrCaption}
                    </figcaption>
                  )}
                </figure>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              A donation code has not been added yet.
            </p>
          )}
        </Section>
      )}

      <footer className="border-t pt-4 text-xs text-muted-foreground">
        <p>
          This site is not affiliated with, endorsed by, or operated by New York
          University. Always verify requirements against the official NYU Shanghai
          Bulletin and with your adviser.
        </p>
        {updatedAt && (
          <p className="mt-1">
            Page last updated{" "}
            <time dateTime={updatedAt}>
              {new Date(updatedAt).toLocaleDateString("en-US")}
            </time>
            .
          </p>
        )}
      </footer>
    </main>
  );
}
