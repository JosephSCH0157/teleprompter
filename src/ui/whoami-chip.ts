import type { SupabaseClient, Session } from '@supabase/supabase-js';

function pickDisplayName(session: Session | null): string {
  if (!session?.user) return 'Signed out';

  const u = session.user;

  const metaName =
    (u.user_metadata?.display_name as string | undefined) ||
    (u.user_metadata?.name as string | undefined);

  const email = u.email || 'unknown';

  const baseLabel = metaName?.trim() ? metaName.trim() : email;
  return baseLabel;
}

export function wireWhoamiChip(supabase: SupabaseClient): void {
  const el = document.getElementById('whoamiChip');
  if (!el) return;

  const apply = (session: Session | null) => {
    const label = pickDisplayName(session);
    const shortId = session?.user?.id ? session.user.id.slice(-6) : '';
    el.textContent = `Logged in: ${label}${shortId ? ` (${shortId})` : ''}`;
  };

  void supabase.auth
    .getSession()
    .then(({ data }) => apply(data.session ?? null))
    .catch(() => apply(null));

  supabase.auth.onAuthStateChange((_event, session) => {
    apply(session ?? null);
  });
}
