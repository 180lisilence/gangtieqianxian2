// js/engine/Renderer.js
// 渲染管理器：Three.js WebGLRenderer 封装，支持画质分级、后处理(辉光/SSAO简版)

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

// 画质配置
const QUALITY = {
  low:    { dpr: 0.75, shadowMap: 1024, shadowNear: 1, shadowFar: 80,  bloom: false, fxaa: true,  fog: true },
  medium: { dpr: 1.0,  shadowMap: 2048, shadowNear: 1, shadowFar: 120, bloom: true,  fxaa: true,  fog: true },
  high:   { dpr: 1.25, shadowMap: 4096, shadowNear: 1, shadowFar: 180, bloom: true,  fxaa: true,  fog: true },
  ultra:  { dpr: 1.5,  shadowMap: 4096, shadowNear: 1, shadowFar: 250, bloom: true,  fxaa: true,  fog: true },
};

export class Renderer {
  constructor(canvas, quality = 'medium', options = {}) {
    this.canvas = canvas;
    this.quality = quality;
    this.cfg = QUALITY[quality] || QUALITY.medium;
    this.useBloom = options.bloom !== false && this.cfg.bloom;
    this.useShadows = options.shadows !== false;

    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: false, powerPreference: 'high-performance',
      stencil: false, depth: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio * this.cfg.dpr, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = this.useShadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.physicallyCorrectLights = true;

    this._setupComposer();
    window.addEventListener('resize', () => this.onResize());
  }

  _setupComposer() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.setPixelRatio(Math.min(window.devicePixelRatio * this.cfg.dpr, 2));
    this.composer.setSize(window.innerWidth, window.innerHeight);

    this.renderPass = new RenderPass();
    this.renderPass.clearColor = new THREE.Color(0x000000);
    this.composer.addPass(this.renderPass);

    if (this.useBloom) {
      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.55, 0.6, 0.85
      );
      this.composer.addPass(this.bloomPass);
    }

    this.fxaaPass = new ShaderPass(FXAAShader);
    const dpr = this.renderer.getPixelRatio();
    this.fxaaPass.material.uniforms['resolution'].value.set(
      1 / (window.innerWidth * dpr), 1 / (window.innerHeight * dpr)
    );
    this.composer.addPass(this.fxaaPass);
  }

  setScene(scene) { this.renderPass.scene = scene; }
  setCamera(camera) { this.renderPass.camera = camera; }

  setQuality(quality, options = {}) {
    this.quality = quality;
    this.cfg = QUALITY[quality] || QUALITY.medium;
    this.useBloom = options.bloom !== false && this.cfg.bloom;
    this.useShadows = options.shadows !== false;
    this.renderer.shadowMap.enabled = this.useShadows;
    // 注: 阴影贴图大小按光源设置(World 中 sun.shadow.mapSize), renderer.shadowMap 无 mapSize
    this._setupComposer();
    this.onResize();
  }

  render() { this.composer.render(); }

  onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    if (this.bloomPass) this.bloomPass.setSize(w, h);
    if (this.fxaaPass) {
      const dpr = this.renderer.getPixelRatio();
      this.fxaaPass.material.uniforms['resolution'].value.set(1/(w*dpr), 1/(h*dpr));
    }
  }

  dispose() {
    this.renderer.dispose();
  }
}

export { QUALITY };
