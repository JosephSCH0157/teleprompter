import crypto from 'node:crypto';
import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import { WebSocketServer, type WebSocket } from 'ws';
import type { DisplayRelayOptions, PairingInfo } from './display-ws-protocol';

const DEFAULT_PAIRING_TOKEN_TTL = 3 * 60 * 1000;
const DEFAULT_MAX_PAIRING_TOKENS = 64;

type RelayRole = 'main' | 'display';

export interface DisplayRelay {
	attach(server: http.Server): void;
	tryHandleApi(req: IncomingMessage, res: ServerResponse): boolean;
	getConnectedDisplays(): number;
	getPendingTokens(): number;
}

export function createDisplayRelay(options?: DisplayRelayOptions): DisplayRelay {
	let attachedServer: http.Server | null = null;
	const pairingTokenTTL = Math.max(1000, options?.pairingTokenTTL ?? DEFAULT_PAIRING_TOKEN_TTL);
	const maxPairingTokens = Math.max(8, options?.maxPairingTokens ?? DEFAULT_MAX_PAIRING_TOKENS);

	const pairingTokens = new Map<string, number>();
	const displayClients = new Set<WebSocket>();
	const mainClients = new Set<WebSocket>();
	const wss = new WebSocketServer({ noServer: true });

	let cleanupTimer: ReturnType<typeof setInterval> | null = null;

	const logStatus = (msg: string, data?: unknown) => {
		if (process.env.DISPLAY_RELAY_DEBUG) {
			console.debug('[display-relay]', msg, data ?? '');
		}
	};

	const cleanupTokens = () => {
		const now = Date.now();
		for (const [token, expires] of pairingTokens) {
			if (expires <= now) {
				pairingTokens.delete(token);
			}
		}
	};

	const broadcastStatus = () => {
		const payload = JSON.stringify({ type: 'tp-display-status', connected: displayClients.size });
		for (const client of mainClients) {
			try {
				client.send(payload);
			} catch {
				// ignore send failures; close will clean up
			}
		}
	};

	const sendJson = (res: ServerResponse, status: number, body: unknown) => {
		try {
			const payload = JSON.stringify(body);
			res.statusCode = status;
			res.setHeader('Content-Type', 'application/json; charset=utf-8');
			res.setHeader('Cache-Control', 'no-store');
			res.end(payload);
		} catch (err) {
			res.statusCode = 500;
			res.end('display relay error');
			console.warn('[display-relay] sendJson failed', err);
		}
	};

	const getOrigins = (req: IncomingMessage) => {
		const forwardedProto = typeof req.headers['x-forwarded-proto'] === 'string'
			? String(req.headers['x-forwarded-proto']).split(',')[0].trim()
			: '';
		const scheme = forwardedProto || (req.socket.encrypted ? 'https' : 'http');
		const host = String(req.headers.host || req.socket.localAddress || '127.0.0.1');
		const origin = `${scheme}://${host}`;
		const wsScheme = scheme === 'https' ? 'wss' : 'ws';
		const wsOrigin = `${wsScheme}://${host}`;
		return { origin, wsOrigin };
	};

	const buildPairingInfo = (req: IncomingMessage, token: string): PairingInfo => {
		const now = Date.now();
		const expiresAt = pairingTokens.get(token) ?? (now + pairingTokenTTL);
		const { origin, wsOrigin } = getOrigins(req);
		return {
			token,
			expiresAt,
			expiresInMs: Math.max(0, expiresAt - now),
			displayUrl: `${origin.replace(/\/$/, '')}/display.html?pair=${token}`,
			wsUrl: `${wsOrigin.replace(/\/$/, '')}/ws/display`,
		};
	};

	const consumePairingToken = (token: string): boolean => {
		const normalized = token ? String(token).trim() : '';
		if (!normalized) return false;
		const expires = pairingTokens.get(normalized);
		if (!expires || expires <= Date.now()) {
			pairingTokens.delete(normalized);
			return false;
		}
		pairingTokens.delete(normalized);
		return true;
	};

	const maybeCreateToken = (): string | null => {
		cleanupTokens();
		if (pairingTokens.size >= maxPairingTokens) {
			return null;
		}
		const token = crypto.randomBytes(12).toString('hex');
		pairingTokens.set(token, Date.now() + pairingTokenTTL);
		return token;
	};

	const handleApi = (req: IncomingMessage, res: ServerResponse): boolean => {
		const base = getOrigins(req).origin;
		let pathname: string;
		try {
			const url = new URL(req.url || '/', base);
			pathname = url.pathname;
		} catch {
			return false;
		}
		if (pathname === '/display/pair') {
			const token = maybeCreateToken();
			if (!token) {
				sendJson(res, 429, { error: 'Too many pending pairings' });
				return true;
			}
			const info = buildPairingInfo(req, token);
			sendJson(res, 200, info);
			return true;
		}
		if (pathname === '/display/status') {
			sendJson(res, 200, {
				connectedDisplays: displayClients.size,
				connectedMains: mainClients.size,
				pairingTokens: pairingTokens.size,
			});
			return true;
		}
		return false;
	};

	const handleConnectionClose = (ws: WebSocket, role: RelayRole) => {
		if (role === 'display') {
			displayClients.delete(ws);
			broadcastStatus();
		} else {
			mainClients.delete(ws);
		}
	};

	const handleDisplayMessage = (data: unknown) => {
		const payload = typeof data === 'string' ? data : (Buffer.isBuffer(data) ? data.toString('utf8') : null);
		if (!payload) return;
		for (const client of displayClients) {
			try {
				client.send(payload);
			} catch {
				// ignore; close events will clean
			}
		}
	};

	const handleHandshake = (ws: WebSocket, raw: string, req: IncomingMessage): RelayRole | null => {
		let parsed: { type?: string; role?: RelayRole; token?: string } | null = null;
		try {
			parsed = JSON.parse(raw);
		} catch {
			ws.close(1002, 'invalid handshake');
			return null;
		}
		if (!parsed || parsed.type !== 'hello') {
			ws.close(1002, 'expected hello');
			return null;
		}
		const role: RelayRole = parsed.role === 'display' ? 'display' : 'main';
		if (role === 'display') {
			if (!consumePairingToken(parsed.token || '')) {
				ws.close(4003, 'invalid token');
				return null;
			}
			displayClients.add(ws);
			ws.send(JSON.stringify({ type: 'display:connected', ts: Date.now() }));
			broadcastStatus();
		} else {
			mainClients.add(ws);
			ws.send(JSON.stringify({
				type: 'tp-display-status',
				connected: displayClients.size,
			}));
		}
		return role;
	};

	const handleWsConnection = (ws: WebSocket, req: IncomingMessage) => {
		let role: RelayRole | null = null;
		let handshakeDone = false;
		const cleanup = () => {
			if (role) {
				handleConnectionClose(ws, role);
			}
		};
		const onMessage = (data: unknown) => {
			const payload = typeof data === 'string' ? data : Buffer.isBuffer(data) ? data.toString('utf8') : null;
			if (!payload) return;
			if (!handshakeDone) {
				role = handleHandshake(ws, payload, req);
				if (!role) return;
				handshakeDone = true;
				return;
			}
			if (role === 'main') {
				handleDisplayMessage(payload);
			}
		};
		ws.on('message', onMessage);
		ws.on('close', cleanup);
		ws.on('error', cleanup);
	};

	const handleUpgrade = (req: IncomingMessage, socket: Socket, head: Buffer) => {
		if (!req.url) {
			socket.destroy();
			return;
		}
		const path = req.url.split('?')[0] || '/';
		if (path !== '/ws/display') {
			socket.destroy();
			return;
		}
		wss.handleUpgrade(req, socket, head, (ws) => {
			handleWsConnection(ws, req);
		});
	};

	return {
		attach(server: http.Server) {
			if (attachedServer === server) return;
			attachedServer = server;
			server.on('upgrade', handleUpgrade);
			if (!cleanupTimer) {
				cleanupTimer = setInterval(() => cleanupTokens(), 60_000);
				cleanupTimer.unref?.();
			}
			logStatus('relay attached');
		},
		tryHandleApi(req: IncomingMessage, res: ServerResponse) {
			return handleApi(req, res);
		},
		getConnectedDisplays() {
			return displayClients.size;
		},
		getPendingTokens() {
			cleanupTokens();
			return pairingTokens.size;
		},
	};
}
