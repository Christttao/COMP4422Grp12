import { Mat4 } from './math.js';

export class SceneNode {
  constructor(name, opts = {}) {
    this.name = name;
    this.mesh = opts.mesh || null;
    this.texture = opts.texture || null;
    this.color = opts.color || [1, 1, 1];
    this.texMix = opts.texMix !== undefined ? opts.texMix : 1.0;
    this.localMatrix = opts.localMatrix || Mat4.identity();
    this.worldMatrix = Mat4.identity();
    this.children = [];
  }

  addChild(node) {
    this.children.push(node);
    return node;
  }

  updateWorld(parentWorld = Mat4.identity()) {
    this.worldMatrix = Mat4.multiply(parentWorld, this.localMatrix);
    for (const child of this.children) {
      child.updateWorld(this.worldMatrix);
    }
  }
}

export function drawScene(node, drawNode) {
  if (node.mesh) drawNode(node);
  for (const child of node.children) drawScene(child, drawNode);
}