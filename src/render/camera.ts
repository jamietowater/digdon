import type { Vec2 } from '../sim/math';

export type MobileCamera = 'focus' | 'fit';
export const mobileCameraPreference = (value: unknown): MobileCamera => value === 'fit' ? 'fit' : 'focus';

export interface CameraSubject {
  pos: Vec2;
  facing: Vec2;
  moving: boolean;
}

export interface CameraRequest {
  width: number;
  height: number;
  columns: number;
  rows: number;
  top: number;
  focus: boolean;
  platform: boolean;
  invasion: boolean;
  conga?: boolean;
  subjects: readonly CameraSubject[];
}

export interface CameraFrame {
  x: number;
  y: number;
  halfHeight: number;
  focused: boolean;
}

export interface CameraBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

export function cameraBounds(frame: CameraFrame, aspect: number): CameraBounds {
  return { left: frame.x - frame.halfHeight * aspect, right: frame.x + frame.halfHeight * aspect,
    top: frame.y - frame.halfHeight, bottom: frame.y + frame.halfHeight };
}

export function fitCamera(request: CameraRequest): CameraFrame {
  const aspect = Math.max(1, request.width) / Math.max(1, request.height);
  return { x: (request.columns - 1) / 2, y: request.top + (request.rows - 1) / 2 - 0.6,
    halfHeight: Math.max(request.rows / 2 + 1.2, (request.columns / 2 + 0.5) / aspect), focused: false };
}

function constrain(frame: CameraFrame, request: CameraRequest): CameraFrame {
  const halfWidth = frame.halfHeight * request.width / Math.max(1, request.height);
  const left = -0.85;
  const right = request.columns - 0.15;
  const top = request.top - 1.8;
  const bottom = request.top + request.rows - 0.15;
  return { ...frame,
    x: halfWidth * 2 >= right - left ? (right + left) / 2 : clamp(frame.x, left + halfWidth, right - halfWidth),
    y: frame.halfHeight * 2 >= bottom - top ? (bottom + top) / 2 : clamp(frame.y, top + frame.halfHeight, bottom - frame.halfHeight),
  };
}

export class CameraTracker {
  private current: CameraFrame | null = null;
  private anchor: CameraFrame | null = null;
  private layout = '';

  reset(): void {
    this.current = null;
    this.anchor = null;
  }

  update(request: CameraRequest, dt: number, reducedMotion = false): CameraFrame {
    const fit = fitCamera(request);
    const focused = request.focus && !request.invasion && request.subjects.length > 0;
    const layout = `${request.width}:${request.height}:${request.columns}:${request.rows}:${focused}`;
    const changed = layout !== this.layout;
    this.layout = layout;
    if (!focused) {
      this.anchor = this.current = fit;
      return { ...fit };
    }
    const aspect = request.width / Math.max(1, request.height);
    const positions = request.subjects.map(subject => subject.pos);
    const left = Math.min(...positions.map(pos => pos.x));
    const right = Math.max(...positions.map(pos => pos.x));
    const top = Math.min(...positions.map(pos => pos.y));
    const bottom = Math.max(...positions.map(pos => pos.y));
    const together = positions.length > 1;
    const halfHeight = Math.min(fit.halfHeight, Math.max(8.5 / aspect / 2,
      together ? (right - left + 3) / aspect / 2 : 0, together ? (bottom - top + 3) / 2 : 0));
    const lead = request.subjects[0];
    const target = {
      x: together ? (left + right) / 2 : lead.pos.x + (lead.moving ? lead.facing.x * 0.9 : 0),
      y: together ? (top + bottom) / 2 : lead.pos.y - (request.platform ? halfHeight * 0.25 : 0) +
        (!request.platform && lead.moving ? lead.facing.y * 0.9 : 0) - (request.conga ? 0.9 : 0),
      halfHeight, focused: true,
    };
    if (!this.current || !this.current.focused || changed) {
      this.anchor = this.current = constrain(target, request);
      return { ...this.current };
    }
    const anchor = this.anchor!;
    const deadX = together ? 0 : halfHeight * aspect * 0.3;
    const deadY = together ? 0 : halfHeight * 0.25;
    const desired = constrain({ ...target,
      x: target.x - clamp(target.x - anchor.x, -deadX, deadX),
      y: target.y - clamp(target.y - anchor.y, -deadY, deadY),
    }, request);
    this.anchor = desired;
    const blend = reducedMotion ? 1 : 1 - Math.exp(-Math.max(0, dt) / 0.15);
    const eased = { ...desired,
      x: this.current.x + (desired.x - this.current.x) * blend,
      y: this.current.y + (desired.y - this.current.y) * blend,
      halfHeight: desired.halfHeight > this.current.halfHeight ? desired.halfHeight :
        this.current.halfHeight + (desired.halfHeight - this.current.halfHeight) * blend,
    };
    if (together) {
      const margin = 0.85;
      eased.x = clamp(eased.x, right + margin - eased.halfHeight * aspect, left - margin + eased.halfHeight * aspect);
      eased.y = clamp(eased.y, bottom + margin - eased.halfHeight, top - margin + eased.halfHeight);
    }
    this.current = constrain(eased, request);
    return { ...this.current };
  }
}