import * as THREE from 'three';
import { CameraTracker, fitCamera, type CameraBounds, type CameraFrame, type CameraRequest, type CameraSubject, type MobileCamera } from './camera';

/** Characters stand on a plane in front of the dirt face, so blocks never cover them (GridToActorWorld). */
export const ACTOR_Z = 0.62;
/** Characters fill this share of a cell, like arcade sprites. */
export const CHARACTER_FILL = 0.9;

/** Grid (col, row) to world: one cell is one unit, row 0 at the top, +y up the screen. */
export function gridToWorld(x: number, y: number, z = 0): THREE.Vector3 {
  return new THREE.Vector3(x, -y, z);
}

export interface LevelLook {
  keyLightScale: number;
  gain: [number, number, number];
  background: number;
}

export const LOOKS: Record<'dig' | 'bricklayer' | 'conga' | 'invasion' | 'scaffold' | 'summit' | 'drive', LevelLook> = {
  // Drawn by RaceView; this only colours the stage behind it.
  drive: { keyLightScale: 0.8, gain: [1, 1, 1], background: 0x120b09 },
  scaffold: { keyLightScale: 0.8, gain: [1.04, 1, 0.96], background: 0x09161a },
  summit: { keyLightScale: 0.9, gain: [0.96, 1.02, 1.08], background: 0x111b23 },
  // Warm earth underground.
  dig: { keyLightScale: 0.6, gain: [1.06, 1.0, 0.9], background: 0x0c0708 },
  bricklayer: { keyLightScale: 0.6, gain: [1.06, 1.0, 0.9], background: 0x0c0708 },
  conga: { keyLightScale: 0.6, gain: [1.06, 1.0, 0.9], background: 0x0c0708 },
  // A cool night sky over the site.
  invasion: { keyLightScale: 0.8, gain: [0.95, 1.0, 1.08], background: 0x070a14 },
};

/** Unreal's FRotator(pitch, yaw) light direction, converted to this scene's axes (camera on +z). */
function lightDirection(pitchDeg: number, yawDeg: number): THREE.Vector3 {
  const p = THREE.MathUtils.degToRad(pitchDeg);
  const y = THREE.MathUtils.degToRad(yawDeg);
  const ue = new THREE.Vector3(Math.cos(p) * Math.cos(y), Math.cos(p) * Math.sin(y), Math.sin(p));
  return new THREE.Vector3(ue.x, ue.z, -ue.y).normalize();
}

/**
 * Renderer, camera and the three-light rig from ADigGameMode::SetupStage, framed like FrameCamera: a narrow lens
 * from far away with a slight downward tilt, so it reads as an arcade screen with a hint of diorama depth.
 */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(10, 1, 1, 1000);
  readonly world = new THREE.Group();
  private readonly key: THREE.DirectionalLight;
  private readonly fill: THREE.DirectionalLight;
  private readonly rim: THREE.DirectionalLight;
  private readonly hemi: THREE.HemisphereLight;
  private gridW = 14;
  private gridH = 18;
  private viewTop = 0;
  private pitch = -6;
  mobile = false;
  mobileCamera: MobileCamera = 'focus';
  peeking = false;
  focused = false;
  private readonly tracker = new CameraTracker();
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private subjects: readonly CameraSubject[] = [];
  private platform = false;
  private invasion = false;
  private conga = false;

  get mobileView(): boolean {
    return this.mobile && this.canvas.clientWidth <= 600 && window.innerHeight >= window.innerWidth;
  }

  constructor(readonly canvas: HTMLCanvasElement, lowEnd: boolean) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowEnd, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowEnd ? 1.25 : 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = !lowEnd;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene.add(this.world);

    this.key = new THREE.DirectionalLight(new THREE.Color(1, 0.93, 0.82), 2.6);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(1024, 1024);
    this.key.shadow.bias = -0.0015;
    this.key.shadow.normalBias = 0.02;
    this.fill = new THREE.DirectionalLight(new THREE.Color(0.55, 0.65, 1), 1.1);
    this.rim = new THREE.DirectionalLight(new THREE.Color(0.75, 0.85, 1), 0.9);
    this.hemi = new THREE.HemisphereLight(0xb8c4ff, 0x3a2418, 0.55);
    this.scene.add(this.key, this.key.target, this.fill, this.fill.target, this.rim, this.rim.target, this.hemi);
    this.placeLight(this.fill, lightDirection(-10, -120));
    this.placeLight(this.rim, lightDirection(-35, 90));
    this.placeLight(this.key, lightDirection(-40, -60));
  }

  private placeLight(light: THREE.DirectionalLight, dir: THREE.Vector3): void {
    const centre = new THREE.Vector3((this.gridW - 1) / 2, -(this.gridH - 1) / 2 - this.viewTop, 0);
    light.target.position.copy(centre);
    light.position.copy(centre).addScaledVector(dir, -40);
  }

  applyLook(look: LevelLook): void {
    this.scene.background = new THREE.Color(look.background);
    this.key.intensity = 4.2 * look.keyLightScale;
    this.key.color.setRGB(1 * look.gain[0], 0.93 * look.gain[1], 0.82 * look.gain[2]);
  }

  /** Fit the whole grid plus a little sky above, like ADigGameMode::FrameCamera. */
  frame(gridW: number, gridH: number, viewTop = 0): void {
    this.gridW = gridW;
    this.gridH = gridH;
    this.viewTop = viewTop;
    this.tracker.reset();
    this.subjects = [];
    this.placeLight(this.key, lightDirection(-40, -60));
    this.placeLight(this.fill, lightDirection(-10, -120));
    this.placeLight(this.rim, lightDirection(-35, 90));
    const shadow = this.key.shadow.camera;
    const span = Math.max(gridW, gridH) * 0.75;
    shadow.left = -span;
    shadow.right = span;
    shadow.top = span;
    shadow.bottom = -span;
    shadow.near = 1;
    shadow.far = 90;
    shadow.updateProjectionMatrix();
    this.resize();
  }

  resize(): void {
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.updateCamera(0);
  }

  follow(target: Pick<CameraRequest, 'top' | 'subjects' | 'platform' | 'invasion' | 'conga'>, dt: number, reset = false): void {
    this.viewTop = target.top;
    if (target.subjects.length) this.subjects = target.subjects;
    this.platform = target.platform;
    this.invasion = target.invasion;
    this.conga = !!target.conga;
    if (reset) this.tracker.reset();
    this.updateCamera(dt);
  }

  private updateCamera(dt: number): void {
    const request: CameraRequest = {
      width: this.canvas.clientWidth || 1, height: this.canvas.clientHeight || 1,
      columns: this.gridW, rows: this.gridH, top: this.viewTop,
      focus: this.mobileView && this.mobileCamera === 'focus' && !this.peeking,
      platform: this.platform, invasion: this.invasion, conga: this.conga, subjects: this.subjects,
    };
    const frame = this.subjects.length ? this.tracker.update(request, dt, this.reducedMotion.matches) : fitCamera(request);
    this.applyCamera(frame, request.width / request.height);
  }

  private applyCamera(frame: CameraFrame, aspect: number): void {
    this.focused = frame.focused;
    this.camera.aspect = aspect;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5));
    const distance = frame.halfHeight / tanHalf;
    const centre = new THREE.Vector3(frame.x, -frame.y, 0);
    const pitch = THREE.MathUtils.degToRad(-this.pitch);
    this.camera.position.set(centre.x, centre.y + Math.sin(pitch) * distance, Math.cos(pitch) * distance);
    this.camera.lookAt(centre);
    this.camera.near = distance * 0.5;
    this.camera.far = distance * 1.5;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    for (const light of [this.key, this.fill, this.rim]) {
      const shift = centre.clone().sub(light.target.position);
      light.position.add(shift);
      light.target.position.copy(centre);
      light.target.updateMatrixWorld();
    }
  }

  get visibleBounds(): CameraBounds {
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -ACTOR_Z);
    const points = [[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([horizontal, vertical]) => {
      const point = new THREE.Vector3(horizontal, vertical, 0).unproject(this.camera);
      return new THREE.Ray(this.camera.position, point.sub(this.camera.position).normalize())
        .intersectPlane(plane, new THREE.Vector3())!;
    });
    return { left: Math.min(...points.map(point => point.x)), right: Math.max(...points.map(point => point.x)),
      top: Math.min(...points.map(point => -point.y)), bottom: Math.max(...points.map(point => -point.y)) };
  }

  project(p: THREE.Vector3): { x: number; y: number } {
    const v = p.clone().add(this.world.position).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * this.canvas.clientWidth, y: (-v.y * 0.5 + 0.5) * this.canvas.clientHeight };
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  /** A JPEG of the current frame, taken straight after a render so the buffer is still intact. */
  snapshot(): HTMLCanvasElement {
    this.render();
    const out = document.createElement('canvas');
    out.width = this.canvas.width;
    out.height = this.canvas.height;
    out.getContext('2d')!.drawImage(this.canvas, 0, 0);
    return out;
  }
}
