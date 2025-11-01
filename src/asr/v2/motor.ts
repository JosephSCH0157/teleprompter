import type { Motor } from './types';

export function createAutoMotor(): Motor {
  // Use existing Auto module on window
  const Auto: any = (window as any).__tpAuto || (window as any).Auto || {};
  // Fallback to features/autoscroll if exposed as module globals
  function setEnabled(on: boolean) { try { (Auto.setEnabled ?? Auto.toggle)?.(on); } catch {} }
  function setVelocity(pxs: number) { try { Auto.setSpeed?.(pxs); } catch {} }
  function tick(_now: number) { /* Auto handles its own RAF loop */ }
  return { setEnabled, setVelocity, tick };
}
