import {
    nudgeBrainSpeed as implNudgeBrainSpeed,
    setBrainBaseSpeed as implSetBrainBaseSpeed,
    submitBrainSpeechSample as implSubmitBrainSpeechSample,
} from './brain-hooks.js';
import type { ScrollBrain } from './scroll-brain';

export function setBrainBaseSpeed(pxPerSec: number): void {
  implSetBrainBaseSpeed(pxPerSec);
}

export function nudgeBrainSpeed(deltaPxPerSec: number): void {
  implNudgeBrainSpeed(deltaPxPerSec);
}

export function submitBrainSpeechSample(sample: Parameters<ScrollBrain['onSpeechSample']>[0]): void {
  implSubmitBrainSpeechSample(sample);
}
