export async function loadFontFace(name: string, url: string) {
  const ff = new FontFace(name, `url(${url})`, { display: 'swap' });
  await ff.load();
  (document as any).fonts.add(ff);
  const root = document.documentElement;
  const cur = getComputedStyle(root).getPropertyValue('--tp-font-family').trim();
  const family = `"${name}", ${cur || 'system-ui, sans-serif'}`;
  root.style.setProperty('--tp-font-family', family);
}

export default loadFontFace;
