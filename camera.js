// camera.js — A controllable first-person style camera built on our own math library.

import { Vec3, Mat4 } from './math.js';

const WORLD_UP = new Vec3(0, 1, 0);

export class Camera {
  constructor({
    position = new Vec3(0, 3, 9),
    yaw = 0,          // radians, rotation around +Y
    pitch = -0.25,    // radians, up/down tilt
    fov = 60,         // vertical field of view, degrees
    near = 0.1,
    far = 200,
  } = {}) {
    this.position = position;
    this.yaw = yaw;
    this.pitch = pitch;
    this.fov = fov;
    this.near = near;
    this.far = far;
    this.moveSpeed = 6; // units per second
  }

  // Unit forward direction from yaw/pitch (yaw = 0 looks down -Z).
  front() {
    const cp = Math.cos(this.pitch);
    return new Vec3(
      cp * Math.sin(this.yaw),
      Math.sin(this.pitch),
      -cp * Math.cos(this.yaw),
    );
  }

  // Unit right direction, kept horizontal.
  right() {
    const f = this.front();
    return new Vec3(-f.z, 0, f.x).normalize();
  }

  rotate(dYaw, dPitch) {
    this.yaw += dYaw;
    const limit = Math.PI / 2 - 0.01;
    this.pitch = Math.max(-limit, Math.min(limit, this.pitch + dPitch));
  }

  moveForward(dist) { this.position = this.position.add(this.front().mul(dist)); }
  moveRight(dist) { this.position = this.position.add(this.right().mul(dist)); }
  moveUp(dist) { this.position = this.position.add(new Vec3(0, dist, 0)); }

  viewMatrix() {
    return Mat4.lookAt(this.position, this.position.add(this.front()), WORLD_UP);
  }

  projectionMatrix(aspect) {
    return Mat4.perspective((this.fov * Math.PI) / 180, aspect, this.near, this.far);
  }
}
