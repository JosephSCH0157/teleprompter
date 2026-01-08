export interface Motor {
  start(): void;
  stop(): void;
  setVelocityPxPerSec(pxPerSec: number): void;
  isRunning(): boolean;
  setWriter(el: HTMLElement | null): void;
  movedRecently(now?: number): boolean;
}

export interface MotorDeps {
  start?: () => void;
  stop?: () => void;
  setVelocity?: (pxPerSec: number) => void;
}

export type MotorFactory = (deps: MotorDeps) => Motor;
