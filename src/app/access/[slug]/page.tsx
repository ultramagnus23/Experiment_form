import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { accessConfig, slugMatches } from '@/lib/admin-password';
import PasswordLoginForm from './PasswordLoginForm';

// Read the environment at request time (never baked in at build), so the feature state always matches the running server.
export const dynamic = 'force-dynamic';

// Not linked from anywhere. Served as noindex; every other case is indistinguishable from a missing page.
export const metadata: Metadata = {
  robots: { index: false, follow: false, noarchive: true, nosnippet: true, noimageindex: true },
};

export default async function AccessPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const cfg = accessConfig();
  if (!cfg || !slugMatches(slug, cfg.slug)) notFound();
  return <PasswordLoginForm slug={slug} />;
}
