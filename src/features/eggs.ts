// Party Mode (eggs) installer: toggles a 'party' class on the root
type EggsBus = { addEventListener?: (evt: string, cb: () => void) => void } | null | undefined;

export function install({ bus }: { bus?: EggsBus } = {}) {
  let on = false;
  const root = document.documentElement;
  const apply = (v = !on) => { on = !!v; try { root.classList.toggle('party', on); } catch {} };

  try { document.getElementById('selfChecksChip')?.addEventListener('dblclick', () => apply()); } catch {}
  try { document.getElementById('dbMeterTop')?.addEventListener('dblclick', () => apply()); } catch {}

  try {
    bus?.addEventListener?.('ui:party:toggle', () => apply());
    bus?.addEventListener?.('ui:party:on',     () => apply(true));
    bus?.addEventListener?.('ui:party:off',    () => apply(false));
  } catch {}

  return { toggle: () => apply(), on: () => apply(true), off: () => apply(false) };
}

export const installEggs = install;
