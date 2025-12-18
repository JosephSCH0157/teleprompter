import { appStore } from '../state/app-store';

export type MicAccessResult =
  | { allowed: true }
  | { allowed: false; reason: 'NO_PERMISSION' | 'MIC_ERROR' };

async function queryMicPermission(): Promise<PermissionState | 'unsupported'> {
  if (!navigator.permissions || typeof navigator.permissions.query !== 'function') {
    return 'unsupported';
  }
  try {
    const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    return status.state;
  } catch {
    return 'unsupported';
  }
}

function stopStream(stream: MediaStream | null) {
  if (!stream) return;
  stream.getTracks().forEach((track) => {
    try { track.stop(); } catch {}
  });
}

async function attemptGetUserMedia(): Promise<MicAccessResult> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return { allowed: true };
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stopStream(stream);
    try { appStore.set('micGranted', true as any); } catch {}
    return { allowed: true };
  } catch (err: any) {
    stopStream((err as any)?.stream || null);
    const name = (err && err.name) || '';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      return { allowed: false, reason: 'NO_PERMISSION' };
    }
    return { allowed: false, reason: 'MIC_ERROR' };
  }
}

export async function ensureMicAccess(): Promise<MicAccessResult> {
  const state = await queryMicPermission();
  if (state === 'denied') {
    return { allowed: false, reason: 'NO_PERMISSION' };
  }
  if (state === 'granted') {
    try { appStore.set('micGranted', true as any); } catch {}
    return { allowed: true };
  }
  return attemptGetUserMedia();
}
