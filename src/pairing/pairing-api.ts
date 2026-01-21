type PairQrPayload = {
  token: string;
  expiresAt: string;
  pairUrl: string;
  qrSvg: string;
};

type PairQrOpts = {
  baseUrl: string;
  pairPath?: string;
  ttlMinutes?: number;
  metadata?: Record<string, unknown>;
};

const w = typeof window !== 'undefined' ? (window as any) : {};
const metaEnv = typeof import.meta !== 'undefined' ? (import.meta as any).env || {} : {};

const PAIR_QR_URL =
  w.__TP_PAIR_QR_URL ||
  metaEnv.VITE_PAIR_QR_URL ||
  '';

const DEFAULT_PAIR_PATH = '/display/pair';
const DEFAULT_TTL_MINUTES = Number(w.__TP_PAIR_QR_TTL_MINUTES ?? metaEnv.VITE_PAIR_QR_TTL_MINUTES ?? 10);
const DEFAULT_METADATA =
  typeof w.__TP_PAIR_QR_METADATA === 'object' && w.__TP_PAIR_QR_METADATA !== null
    ? { ...w.__TP_PAIR_QR_METADATA }
    : { role: 'display', app: 'anvil' };

export async function requestPairQr(opts: PairQrOpts): Promise<PairQrPayload> {
  if (!PAIR_QR_URL) {
    throw new Error('Pairing endpoint unavailable (configure __TP_PAIR_QR_URL or VITE_PAIR_QR_URL).');
  }

  const pairPath = (opts.pairPath || DEFAULT_PAIR_PATH).trim() || DEFAULT_PAIR_PATH;
  const ttlMinutes =
    Number.isFinite(opts.ttlMinutes ?? DEFAULT_TTL_MINUTES) && (opts.ttlMinutes ?? DEFAULT_TTL_MINUTES) > 0
      ? opts.ttlMinutes ?? DEFAULT_TTL_MINUTES
      : DEFAULT_TTL_MINUTES;

  const payload = {
    baseUrl: opts.baseUrl,
    pairPath,
    ttlMinutes,
    metadata: opts.metadata || DEFAULT_METADATA,
  };

  const res = await fetch(PAIR_QR_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let detail = '';
    try {
      const parsed = await res.json();
      detail = parsed?.error ? `: ${parsed.error}` : '';
    } catch {
      // ignore
    }
    throw new Error(`Failed to create pairing session${detail}`);
  }

  const json = await res.json();
  if (!json || typeof json !== 'object') {
    throw new Error('Invalid pairing response');
  }

  return {
    token: String(json.token ?? ''),
    pairUrl: String(json.pairUrl ?? ''),
    qrSvg: String(json.qrSvg ?? ''),
    expiresAt: String(json.expiresAt ?? ''),
  };
}

export type { PairQrPayload };
