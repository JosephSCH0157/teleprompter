export type DisplayRelayHello = {
  type: 'hello';
  role?: 'main' | 'display';
  token?: string;
};

export type DisplayRelayStatus = {
  type: 'tp-display-status';
  connected: number;
};

export type DisplayRelayMessage = Record<string, unknown>;

export interface PairingInfo {
  token: string;
  expiresAt: number;
  expiresInMs: number;
  displayUrl: string;
  wsUrl: string;
}

export interface DisplayRelayOptions {
  pairingTokenTTL?: number;
  maxPairingTokens?: number;
}
