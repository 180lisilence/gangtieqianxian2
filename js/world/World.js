// js/world/World.js
// 世界/地图管理器:
//   - 程序化生成地形(高度图噪声)
//   - 建筑/掩体/植被(根据 campaign 主题)
//   - 据点(占点)
//   - 射线检测(地形 + 障碍 AABB + 士兵命中盒)
//   - 投掷物(手雷/火箭)物理与爆炸
//   - 天空/光照/雾

import * as THREE from 'three';
import { ValueNoise, RNG, clamp, randRange, randInt, randPick } from '../utils/MathUtils.js';
import { CAMPAIGNS } from '../data/campaigns.js';

const MAP_SIZE = 200;       // 地图边长(米)
const TERRAIN_SEG = 128;    // 地形分段

export class World {
  constructor(scene, campaign, audio) {
    this.scene = scene;
    this.campaign = campaign;
    this.audio = audio;

    this.rng = new RNG(campaign.seed);
    this.noise = new ValueNoise(campaign.seed);

    this.groundMesh = null;
    this.heightField = null;     // 二维高度数组
    this.obstacles = [];         // { mesh, box, penetrable }
    this.coverPoints = [];       // THREE.Vector3 掩体位置
    this.objectives = [];        // 据点 { id, name, position, radius, holder, capProgress, capDir }
    this.soldiers = [];          // 所有士兵(用于射线)
    this.grenades = [];          // 投掷物
    this.vehicles = [];

    this._buildEnvironment();
    this._buildTerrain();
    this._buildProps();
    this._buildObjectives();
    this._buildGrass();
    this._buildSky();

    this.onFootstep = null;
  }

  // ========== 环境(光照/雾) ==========
  _buildEnvironment() {
    const c = this.campaign;
    // 雾
    this.scene.fog = new THREE.FogExp2(c.skyColor, c.fog);
    this.scene.background = new THREE.Color(c.skyColor);

    // 半球光(天空/地面)
    this.hemi = new THREE.HemisphereLight(c.skyColor, c.groundColor, 1.0);
    this.scene.add(this.hemi);

    // 太阳(方向光)
    const sunAngles = {
      morning: [60, 30], noon: [80, 90], afternoon: [60, 220],
      evening: [25, 270], night: [10, 300],
    };
    const [elev, azim] = sunAngles[c.timeOfDay] || [60, 90];
    const elevR = THREE.MathUtils.degToRad(elev);
    const azimR = THREE.MathUtils.degToRad(azim);
    this.sun = new THREE.DirectionalLight(c.sunColor, c.sunIntensity * 1.3);
    this.sun.position.set(
      Math.cos(elevR) * Math.cos(azimR) * 100,
      Math.sin(elevR) * 100,
      Math.cos(elevR) * Math.sin(azimR) * 100
    );
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 250;
    const s = 120;
    this.sun.shadow.camera.left = -s; this.sun.shadow.camera.right = s;
    this.sun.shadow.camera.top = s; this.sun.shadow.camera.bottom = -s;
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // 环境光补充
    this.ambient = new THREE.AmbientLight(c.ambientColor, 0.7);
    this.scene.add(this.ambient);
  }

  // ========== 地形 ==========
  _buildTerrain() {
    const c = this.campaign;
    const geo = new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, TERRAIN_SEG, TERRAIN_SEG);
    geo.rotateX(-Math.PI / 2);

    // 高度场
    this.heightField = new Float32Array((TERRAIN_SEG + 1) * (TERRAIN_SEG + 1));
    const amp = c.map === 'stalingrad' || c.map === 'berlin' ? 2.5 :
                c.map === 'pearlHarbor' ? 1.5 :
                c.map === 'lighthouse' ? 8 : 6;
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      // 多层噪声
      let h = this.noise.sample(x * 0.02, z * 0.02, 1) * amp;
      h += this.noise.sample(x * 0.06, z * 0.06, 1) * amp * 0.3;
      // 海滩(诺曼底): 一侧压平为滩涂
      if (c.map === 'normandy' && z > 30) h *= 0.1;
      // 奥马哈: 南侧为海滩,再南为海面(压到 -0.5)
      if (c.map === 'omaha' && z > 35) h = -0.5 + (z > 55 ? -0.3 : 0.1);
      // 灯塔岛: 边缘为海(压到 -0.5), 中心为岛(保留地形)
      if (c.map === 'lighthouse') {
        const distCenter = Math.hypot(x, z);
        if (distCenter > 55) h = -0.3;
        else if (distCenter > 40) h *= 0.3;
      }
      // 珍珠港: 东西两侧为水域
      if (c.map === 'pearlHarbor' && Math.abs(x) > 55) h = -0.4;
      pos.setY(i, h);
      this.heightField[i] = h;
    }
    geo.computeVertexNormals();

    // UV 扩展: 平面大地图, 让纹理重复平铺 (原 UV 已是 0-1 对应整张平面,
    // 这里再乘以一个 repeat 因子到额外 UV 属性,用于程序化纹理)
    const uvs = geo.attributes.uv;
    const repeatFactor = MAP_SIZE / 4;    // 每 4m 一次草地纹理重复
    const uv2 = new Float32Array(uvs.count * 2);
    for (let i = 0; i < uvs.count; i++) {
      uv2[i*2]   = uvs.getX(i) * repeatFactor;
      uv2[i*2+1] = uvs.getY(i) * repeatFactor;
    }
    geo.setAttribute('uv2', new THREE.BufferAttribute(uv2, 2));

    // 顶点颜色: 根据战役 + 海拔 + 区域 + 噪声 混合(草绿/泥褐/沙白/岩石/雪)
    const colors = new Float32Array(pos.count * 3);
    const baseCol = new THREE.Color(c.groundColor);

    // 不同战役的调色板
    const palette = this._getGroundPalette(c);

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      // 基础颜色: 先用调色板
      const col = new THREE.Color(baseCol);

      // ---- 1. 区域特化覆盖 ----
      // 海滩(诺曼底滩涂): 沙地
      const isBeach = (c.map === 'normandy' && z > 30) ||
                      (c.map === 'omaha' && z > 35 && z <= 55) ||
                      (c.map === 'lighthouse' && Math.hypot(x,z) > 40 && Math.hypot(x,z) <= 55) ||
                      (c.map === 'pearlHarbor' && Math.abs(x) > 50 && Math.abs(x) <= 60);
      // 海面: 渲染为深色(与天空呼应, 低地形处)
      const isSea = (c.map === 'omaha' && z > 55) ||
                    (c.map === 'lighthouse' && Math.hypot(x,z) > 55) ||
                    (c.map === 'pearlHarbor' && Math.abs(x) > 60);
      // 城市/废墟: 泥土为主,很少草
      const isUrban = c.map === 'stalingrad' || c.map === 'berlin' || c.map === 'shanghai' || c.map === 'pearlHarbor';
      // 雪地: 白茫茫
      const isSnow  = c.weather === 'snow';

      if (isSea) {
        col.setHex(0x1a3a5a);  // 深海蓝
      } else if (isBeach) {
        col.setHex(palette.sand);
      } else if (isSnow) {
        col.setHex(palette.snow);
      } else {
        // 草绿/泥土按噪声混合,得到自然草地斑驳感
        const n = this.noise.sample(x * 0.35, z * 0.35, 1);
        const m = clamp(n * 0.5 + 0.5, 0, 1);
        const grassCol = new THREE.Color(palette.grass);
        const dirtCol  = new THREE.Color(palette.dirt);
        const rockCol  = new THREE.Color(palette.rock);
        const tintCol  = new THREE.Color(palette.tint);
        // 城市更偏向泥土
        const urbanDirt = isUrban ? 0.55 : 0;
        const dirtMix = clamp(m * 0.85 + urbanDirt, 0, 1);
        grassCol.lerp(dirtCol, dirtMix);
        // 高海拔 -> 岩石
        const rockT = clamp((y - 3) / 5, 0, 1);
        grassCol.lerp(rockCol, rockT);
        col.copy(grassCol);
        // 滇缅丛林更深绿, 百团田野黄绿, 莫斯科偏枯草
        col.lerp(tintCol, 0.35);
      }

      // ---- 2. 高度明暗 ----
      col.multiplyScalar(0.82 + clamp(y / 8, -0.28, 0.28));
      // 顶点色随机抖动(避免单色块)
      const jitter = 0.92 + this.rng.next() * 0.14;
      col.r = clamp(col.r * jitter, 0, 1);
      col.g = clamp(col.g * jitter, 0, 1);
      col.b = clamp(col.b * jitter, 0, 1);

      colors[i*3] = col.r; colors[i*3+1] = col.g; colors[i*3+2] = col.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // 材质: 顶点色 + 程序化草地纹理(CanvasTexture), 带重复平铺 + 法线微细节
    const grassTex = this._makeGroundTexture(c);
    grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
    grassTex.repeat.set(repeatFactor, repeatFactor);
    grassTex.anisotropy = 8;
    const normalTex = this._makeGroundNormalTexture(c);
    normalTex.wrapS = normalTex.wrapT = THREE.RepeatWrapping;
    normalTex.repeat.set(repeatFactor, repeatFactor);
    normalTex.anisotropy = 4;

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: grassTex,
      normalMap: normalTex,
      normalScale: new THREE.Vector2(0.6, 0.6),
      roughness: 0.95,
      metalness: 0,
    });
    this.groundMesh = new THREE.Mesh(geo, mat);
    this.groundMesh.receiveShadow = true;
    this.scene.add(this.groundMesh);

    // 地形段尺寸(用于 getGroundHeight 双线性采样)
    this._terrainSeg = TERRAIN_SEG;
    this._terrainSize = MAP_SIZE;
    this._terrainHalf = MAP_SIZE / 2;
  }

  // ---- 地面调色板(按战役) ----
  _getGroundPalette(c) {
    switch (c.map) {
      case 'normandy':  return { grass:0x4f6b2f, dirt:0x6b5a3a, rock:0x7a7060, sand:0xc4b080, snow:0xe8e8e8, tint:0x5a7a3a };
      case 'stalingrad':return { grass:0x5a5e4a, dirt:0x6a5a4a, rock:0x8a7f70, sand:0xb4a48a, snow:0xe8e8e8, tint:0x555545 };
      case 'berlin':    return { grass:0x5a5648, dirt:0x6a5a4a, rock:0x90887a, sand:0xb8a88a, snow:0xe0e0e0, tint:0x555545 };
      case 'shanghai':  return { grass:0x5a6a3a, dirt:0x6b5a48, rock:0x7a7060, sand:0xb4a080, snow:0xe0e0e0, tint:0x506a3a };
      case 'baidatuan': return { grass:0x6a8a3a, dirt:0x7a6a3a, rock:0x7a7060, sand:0xc0a880, snow:0xe8e8e8, tint:0x8aaa3a };
      case 'burma':     return { grass:0x3a6a2a, dirt:0x5a4a2a, rock:0x6a6050, sand:0xa0946a, snow:0xe0e0e0, tint:0x2a5a2a };
      case 'moscow':    return { grass:0x7a7a4a, dirt:0x7a6a4a, rock:0x908a80, sand:0xbab090, snow:0xf0f0f0, tint:0x9a946a };
      case 'omaha':     return { grass:0x4a5a2a, dirt:0x6b5a3a, rock:0x7a7060, sand:0xd4c090, snow:0xe8e8e8, tint:0x5a6a3a };
      case 'lighthouse':return { grass:0x3a6a2a, dirt:0x5a4a2a, rock:0x6a5a4a, sand:0xc4b080, snow:0xe8e8e8, tint:0x4a7a3a };
      case 'pearlHarbor':return{ grass:0x4a5a3a, dirt:0x5a5a4a, rock:0x7a7060, sand:0xb8a878, snow:0xe0e0e0, tint:0x5a7a4a };
      default:          return { grass:0x5a7a3a, dirt:0x7a6a4a, rock:0x7a7060, sand:0xc0a880, snow:0xe8e8e8, tint:0x5a7a3a };
    }
  }

  // ---- 程序化地面纹理:绿色斑块+泥斑+微噪点 ----
  _makeGroundTexture(c) {
    const size = 256;
    const cv = document.createElement('canvas'); cv.width = cv.height = size;
    const g = cv.getContext('2d');
    // 基础
    const pal = this._getGroundPalette(c);
    const base = c.weather === 'snow' ? pal.snow :
                 c.map === 'normandy' ? pal.grass : pal.grass;
    g.fillStyle = '#' + new THREE.Color(base).getHexString();
    g.fillRect(0, 0, size, size);
    // 噪声斑点(深色草簇)
    const rng = new RNG(c.seed + 1);
    const spots = 900;
    const dirtCol = new THREE.Color(pal.dirt);
    const grassDark = new THREE.Color(pal.grass).multiplyScalar(0.7);
    for (let i = 0; i < spots; i++) {
      const x = rng.next() * size, y = rng.next() * size;
      const r = 2 + rng.next() * 10;
      const useDirt = rng.next() < 0.35;
      const col = useDirt ? dirtCol : grassDark;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `rgba(${(col.r*255)|0},${(col.g*255)|0},${(col.b*255)|0},0.75)`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI*2); g.fill();
    }
    // 细颗粒
    const img = g.getImageData(0, 0, size, size);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (rng.next() - 0.5) * 28;
      img.data[i  ] = clamp(img.data[i  ] + n, 0, 255);
      img.data[i+1] = clamp(img.data[i+1] + n, 0, 255);
      img.data[i+2] = clamp(img.data[i+2] + n, 0, 255);
    }
    g.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // ---- 程序化法线贴图(起伏细节) ----
  _makeGroundNormalTexture(c) {
    const size = 128;
    const cv = document.createElement('canvas'); cv.width = cv.height = size;
    const g = cv.getContext('2d');
    const rng = new RNG(c.seed + 2);
    const h = new Float32Array(size * size);
    // 噪声高度
    for (let i = 0; i < h.length; i++) {
      const x = i % size, y = (i / size) | 0;
      h[i] = (this.noise.sample(x * 0.15, y * 0.15, 1) + this.noise.sample(x*0.5, y*0.5, 1) * 0.5);
    }
    const data = g.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const xl = (x - 1 + size) % size, xr = (x + 1) % size;
        const yu = (y - 1 + size) % size, yd = (y + 1) % size;
        const dx = h[y*size+xr] - h[y*size+xl];
        const dy = h[yd*size+x] - h[yu*size+x];
        // 法线 = (-dx, -dy, 1) 归一化, 映射到 [0,255]
        const l = Math.sqrt(dx*dx + dy*dy + 1);
        const nx = clamp(128 + 128 * (-dx/l), 0, 255);
        const ny = clamp(128 + 128 * (-dy/l), 0, 255);
        const nz = clamp(128 + 128 * (1/l), 0, 255);
        const k = (y*size + x) * 4;
        data.data[k  ] = nx;
        data.data[k+1] = ny;
        data.data[k+2] = nz;
        data.data[k+3] = 255;
      }
    }
    g.putImageData(data, 0, 0);
    return new THREE.CanvasTexture(cv);
  }

  getGroundHeight(x, z) {
    // 双线性插值采样高度场
    const seg = this._terrainSeg;
    const fx = (x + this._terrainHalf) / this._terrainSize * seg;
    const fz = (z + this._terrainHalf) / this._terrainSize * seg;
    if (fx < 0 || fx >= seg || fz < 0 || fz >= seg) return 0;
    const ix = Math.floor(fx), iz = Math.floor(fz);
    const tx = fx - ix, tz = fz - iz;
    const i00 = iz * (seg + 1) + ix;
    const i10 = i00 + 1;
    const i01 = i00 + (seg + 1);
    const i11 = i01 + 1;
    const h00 = this.heightField[i00], h10 = this.heightField[i10];
    const h01 = this.heightField[i01], h11 = this.heightField[i11];
    const h0 = h00 + (h10 - h00) * tx;
    const h1 = h01 + (h11 - h01) * tx;
    return h0 + (h1 - h0) * tz;
  }

  // ========== 道具/建筑 ==========
  _buildProps() {
    const c = this.campaign;
    const mapType = c.map;

    if (mapType === 'normandy') this._buildNormandy();
    else if (mapType === 'omaha') this._buildOmaha();
    else if (mapType === 'lighthouse') this._buildLighthouse();
    else if (mapType === 'pearlHarbor') this._buildPearlHarbor();
    else if (mapType === 'stalingrad' || mapType === 'berlin') this._buildUrban();
    else if (mapType === 'shanghai') this._buildUrban();
    else if (mapType === 'baidatuan') this._buildRural();
    else if (mapType === 'burma') this._buildJungle();
    else if (mapType === 'moscow') this._buildRural();
    else this._buildRural();

    // 通用: 散落掩体(沙袋/木箱)
    for (let i = 0; i < 40; i++) {
      const x = randRange(-80, 80), z = randRange(-80, 80);
      if (Math.abs(x) < 8 && Math.abs(z) < 8) continue;
      this._addSandbag(x, z, randRange(0, Math.PI*2));
    }
  }

  _buildNormandy() {
    // 海堤 + 碉堡 + 反坦克锥
    // 海堤(长墙)
    this._addWall(0, 20, 80, 2, 1.5, 0x6b6048);
    // 碉堡(混凝土)
    this._addBunker(-20, 10);
    this._addBunker(25, 5);
    // 反坦克锥(三角形障碍)
    for (let i = 0; i < 30; i++) {
      const x = randRange(-70, 70), z = randRange(25, 35);
      this._addCzechHedgehog(x, z);
    }
    // 登陆艇残骸
    this._addBoatHull(-40, 40);
  }

  _buildUrban() {
    // 多栋建筑(废墟)
    for (let i = 0; i < 18; i++) {
      const x = randRange(-70, 70), z = randRange(-70, 70);
      if (Math.abs(x) < 10 && Math.abs(z) < 10) continue;
      this._addBuilding(x, z, randRange(0, Math.PI*2), randRange(8, 18), randRange(8, 14));
    }
    // 瓦砾堆
    for (let i = 0; i < 25; i++) {
      this._addRubble(randRange(-70, 70), randRange(-70, 70));
    }
  }

  _buildRural() {
    // 农舍 + 树林 + 篱笆
    for (let i = 0; i < 8; i++) {
      this._addBuilding(randRange(-70, 70), randRange(-70, 70), 0, randRange(6,10), randRange(5,8));
    }
    for (let i = 0; i < 60; i++) {
      this._addTree(randRange(-90, 90), randRange(-90, 90));
    }
  }

  _buildJungle() {
    // 密集丛林 + 河流
    for (let i = 0; i < 120; i++) {
      this._addTree(randRange(-90, 90), randRange(-90, 90), 0.6);
    }
    for (let i = 0; i < 5; i++) {
      this._addBuilding(randRange(-70, 70), randRange(-70, 70), 0, 5, 4);
    }
  }

  _buildOmaha() {
    // 奥马哈滩头: 海堤 + 碉堡群 + 反坦克锥 + 登陆艇残骸
    this._addSea(0, 65, 120, 30); // 海面
    // 海堤(长墙,横向延伸)
    for (let i = -3; i <= 3; i++) {
      this._addWall(i * 15, 35, 14, 2.5, 1.5, 0x6b6048);
    }
    // 碉堡群(混凝土)
    this._addBunker(-25, 20);
    this._addBunker(-10, 25);
    this._addBunker(15, 22);
    this._addBunker(30, 18);
    // 碉堡之间连接掩体
    this._addWall(-20, 25, 20, 1.8, 1.2, 0x5a5248);
    this._addWall(20, 20, 20, 1.8, 1.2, 0x5a5248);
    // 反坦克锥
    for (let i = 0; i < 40; i++) {
      const x = randRange(-80, 80), z = randRange(38, 52);
      this._addCzechHedgehog(x, z);
    }
    // 登陆艇残骸
    this._addBoatHull(-35, 50);
    this._addBoatHull(20, 48);
    this._addBoatHull(-60, 55);
    // 铁丝网障碍
    for (let i = 0; i < 15; i++) {
      const x = randRange(-75, 75), z = randRange(40, 50);
      this._addBarricade(x, z);
    }
    // 沙滩上的沙袋掩体
    for (let i = 0; i < 20; i++) {
      this._addSandbag(randRange(-70, 70), randRange(36, 42), randRange(0, Math.PI*2));
    }
  }

  _buildLighthouse() {
    // 灯塔岛: 中央岛 + 灯塔 + 码头 + 岩石
    this._addSea(0, 0, 200, 200); // 全地图海面
    // 岛边缘岩石
    for (let i = 0; i < 25; i++) {
      const ang = randRange(0, Math.PI * 2);
      const r = randRange(38, 55);
      this._addRock(Math.cos(ang) * r, Math.sin(ang) * r, randRange(1.5, 3.5));
    }
    // 码头(南侧)
    this._addPier(-30, -25, 25);
    // 灯塔(中心)
    this._addLighthouse(0, 10);
    // 日军碉堡
    this._addBunker(-20, 5);
    this._addBunker(25, 25);
    this._addBunker(-10, 30);
    // 守军建筑
    this._addBuilding(15, 0, 0.3, 6, 5);
    this._addBuilding(-25, 15, 0, 5, 4);
    this._addBuilding(20, 20, 0.5, 7, 6);
    // 棕榈树
    for (let i = 0; i < 30; i++) {
      const ang = randRange(0, Math.PI * 2);
      const r = randRange(10, 35);
      this._addPalmTree(Math.cos(ang) * r, Math.sin(ang) * r);
    }
    // 沙袋防线
    for (let i = 0; i < 12; i++) {
      const ang = randRange(0, Math.PI * 2);
      const r = randRange(15, 25);
      this._addSandbag(Math.cos(ang) * r, Math.sin(ang) * r, randRange(0, Math.PI * 2));
    }
  }

  _buildPearlHarbor() {
    // 珍珠港: 干船坞 + 仓库 + 舰船 + 码头
    // 海面(两侧)
    this._addSea(-75, 0, 50, 200);
    this._addSea(75, 0, 50, 200);
    // 干船坞(大型建筑)
    this._addDryDock(0, -20);
    // 军火仓库
    this._addBuilding(25, 10, 0.3, 10, 8);
    this._addBuilding(35, 5, 0, 8, 6);
    this._addBuilding(20, 20, 0.5, 9, 7);
    // 战列舰码头(含舰船)
    this._addBattleship(-20, 20);
    this._addBattleship(20, -30);
    // 集装箱区
    for (let i = 0; i < 18; i++) {
      this._addContainer(randRange(10, 45), randRange(-25, 25), randRange(0, Math.PI*2));
    }
    // 小仓库
    for (let i = 0; i < 8; i++) {
      this._addBuilding(randRange(10, 45), randRange(-35, 35), randRange(0, Math.PI), randRange(5, 9), randRange(4, 7));
    }
    // 码头栈桥
    this._addPier(-55, 0, 30);
    this._addPier(55, 0, 30);
    // 小型巡逻艇
    this._addShip(-40, 40, 'patrol');
    this._addShip(40, -40, 'patrol');
    // 沙袋掩体
    for (let i = 0; i < 15; i++) {
      this._addSandbag(randRange(-45, 45), randRange(-40, 40), randRange(0, Math.PI * 2));
    }
  }

  // ---- 道具构造 ----
  _addWall(x, z, len, h, thick, color) {
    const geo = new THREE.BoxGeometry(len, h, thick);
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, this.getGroundHeight(x,z) + h/2, z);
    m.castShadow = true; m.receiveShadow = true;
    this.scene.add(m);
    const box = new THREE.Box3().setFromObject(m);
    this.obstacles.push({ mesh: m, box, penetrable: false });
    this.coverPoints.push(new THREE.Vector3(x, 0, z + thick));
  }

  _addBunker(x, z) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x6a6a5a, roughness: 0.95 });
    // 主体
    const body = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 6), mat);
    body.position.y = 2; g.add(body);
    // 射击孔(减去视觉)
    const slit = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.5, 1),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
    slit.position.set(0, 2.5, 3); g.add(slit);
    // 顶
    const roof = new THREE.Mesh(new THREE.BoxGeometry(9, 0.6, 7), mat);
    roof.position.y = 4.3; g.add(roof);
    g.position.set(x, this.getGroundHeight(x,z), z);
    g.castShadow = true;
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.scene.add(g);
    const box = new THREE.Box3().setFromObject(g);
    this.obstacles.push({ mesh: g, box, penetrable: false });
    this.coverPoints.push(new THREE.Vector3(x, 0, z + 5));
  }

  _addCzechHedgehog(x, z) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x5a4a3a, metalness: 0.6, roughness: 0.5 });
    for (let i = 0; i < 3; i++) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.2, 0.15), mat);
      beam.rotation.set(i * Math.PI / 3, 0, i * Math.PI / 4);
      g.add(beam);
    }
    g.position.set(x, this.getGroundHeight(x,z) + 0.8, z);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    this.scene.add(g);
    const box = new THREE.Box3().setFromObject(g);
    this.obstacles.push({ mesh: g, box, penetrable: false });
  }

  _addBoatHull(x, z) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.85 });
    const hull = new THREE.Mesh(new THREE.BoxGeometry(8, 2, 3), mat);
    hull.position.set(x, this.getGroundHeight(x,z) + 0.5, z);
    hull.rotation.z = 0.15; hull.castShadow = true; hull.receiveShadow = true;
    this.scene.add(hull);
    const box = new THREE.Box3().setFromObject(hull);
    this.obstacles.push({ mesh: hull, box, penetrable: false });
    this.coverPoints.push(new THREE.Vector3(x, 0, z + 3));
  }

  _addBuilding(x, z, rot, w, h) {
    const g = new THREE.Group();
    const wallMat = new THREE.MeshStandardMaterial({
      color: this.campaign.map === 'stalingrad' || this.campaign.map === 'berlin' ? 0x7a6a5a : 0x8a7a5a,
      roughness: 0.92
    });
    // 四面墙(留门窗洞)
    const t = 0.3;
    const makeWall = (ww, hh) => new THREE.Mesh(new THREE.BoxGeometry(ww, hh, t), wallMat);
    const front = makeWall(w, h); front.position.set(0, h/2, w/2 - t); g.add(front);
    const back = makeWall(w, h); back.position.set(0, h/2, -w/2 + t); g.add(back);
    const left = makeWall(w, h); left.rotation.y = Math.PI/2; left.position.set(-w/2 + t, h/2, 0); g.add(left);
    const right = makeWall(w, h); right.rotation.y = Math.PI/2; right.position.set(w/2 - t, h/2, 0); g.add(right);
    // 屋顶(平顶废墟)
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, w),
      new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 0.9 }));
    roof.position.y = h; g.add(roof);
    // 破损(随机移除部分墙段, 用矮墙代替)
    if (Math.random() < 0.5) {
      front.scale.y = 0.5; front.position.y = h * 0.25;
    }

    g.position.set(x, this.getGroundHeight(x,z), z);
    g.rotation.y = rot;
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.scene.add(g);
    const box = new THREE.Box3().setFromObject(g);
    this.obstacles.push({ mesh: g, box, penetrable: false });
    // 掩体点
    this.coverPoints.push(new THREE.Vector3(x + w/2 + 1, 0, z));
    this.coverPoints.push(new THREE.Vector3(x - w/2 - 1, 0, z));
  }

  _addRubble(x, z) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x6a5a4a, roughness: 0.95 });
    const g = new THREE.Mesh(new THREE.DodecahedronGeometry(randRange(0.6, 1.5), 0), mat);
    g.position.set(x, this.getGroundHeight(x,z) + 0.4, z);
    g.rotation.set(Math.random()*3, Math.random()*3, Math.random()*3);
    g.castShadow = true; g.receiveShadow = true;
    this.scene.add(g);
    const box = new THREE.Box3().setFromObject(g);
    this.obstacles.push({ mesh: g, box, penetrable: false });
    this.coverPoints.push(new THREE.Vector3(x, 0, z));
  }

  _addSandbag(x, z, rot) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x6a5a3a, roughness: 0.95 });
    for (let i = 0; i < 4; i++) {
      const bag = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.4), mat);
      bag.position.set((i - 1.5) * 0.55, 0.12 + (i%2)*0.05, 0);
      g.add(bag);
    }
    for (let i = 0; i < 3; i++) {
      const bag = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.4), mat);
      bag.position.set((i - 1) * 0.55, 0.4, 0);
      g.add(bag);
    }
    g.position.set(x, this.getGroundHeight(x,z), z);
    g.rotation.y = rot;
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.scene.add(g);
    const box = new THREE.Box3().setFromObject(g);
    this.obstacles.push({ mesh: g, box, penetrable: false });
    this.coverPoints.push(new THREE.Vector3(x, 0, z + 0.5));
  }

  // ---- 海面 ----
  _addSea(x, z, w, d) {
    const geo = new THREE.PlaneGeometry(w, d, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x1a3a5a, roughness: 0.3, metalness: 0.6,
      transparent: true, opacity: 0.85,
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, -0.3, z);
    m.receiveShadow = true;
    this.scene.add(m);
    // 海面不做障碍(可通行), 仅视觉
  }

  // ---- 灯塔 ----
  _addLighthouse(x, z) {
    const g = new THREE.Group();
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf0ece0, roughness: 0.6 });
    const redMat = new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.6 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.5 });
    // 基座
    const base = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 3, 2, 12), whiteMat);
    base.position.y = 1; g.add(base);
    // 塔身(红白条纹分段)
    for (let i = 0; i < 5; i++) {
      const seg = new THREE.Mesh(
        new THREE.CylinderGeometry(1.6 - i * 0.15, 1.8 - i * 0.15, 1.5, 12),
        i % 2 === 0 ? whiteMat : redMat
      );
      seg.position.y = 2 + i * 1.5;
      g.add(seg);
    }
    // 顶部灯室
    const lampRoom = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 1.5, 12), darkMat);
    lampRoom.position.y = 9.75; g.add(lampRoom);
    // 灯罩(发光)
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0xffee88, emissive: 0xffcc44, emissiveIntensity: 0.8, transparent: true, opacity: 0.9 }));
    lamp.position.y = 10.5; g.add(lamp);
    // 光源
    const light = new THREE.PointLight(0xffcc44, 3, 25, 2);
    light.position.copy(lamp.position); g.add(light);
    // 屋顶
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.5, 1.2, 12), redMat);
    cap.position.y = 11.6; g.add(cap);
    // 风向标
    const vane = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.4, 0.6), darkMat);
    vane.position.set(0, 12.5, 0); g.add(vane);

    g.position.set(x, this.getGroundHeight(x, z), z);
    g.castShadow = true;
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.scene.add(g);
    const box = new THREE.Box3().setFromObject(g);
    this.obstacles.push({ mesh: g, box, penetrable: false });
    this.coverPoints.push(new THREE.Vector3(x + 3, 0, z));
  }

  // ---- 舰船 ----
  _addShip(x, z, type) {
    const g = new THREE.Group();
    const hullMat = new THREE.MeshStandardMaterial({ color: type === 'patrol' ? 0x3a4a5a : 0x4a3a2a, roughness: 0.7 });
    const superMat = new THREE.MeshStandardMaterial({ color: 0x6a6a5a, roughness: 0.8 });
    // 船体
    const hullW = type === 'patrol' ? 4 : 6;
    const hullL = type === 'patrol' ? 18 : 25;
    const hull = new THREE.Mesh(new THREE.BoxGeometry(hullW, 2, hullL), hullMat);
    hull.position.y = 1; g.add(hull);
    // 船首(尖)
    const bow = new THREE.Mesh(new THREE.ConeGeometry(hullW / 2, 3, 4), hullMat);
    bow.rotation.x = Math.PI / 2;
    bow.position.set(0, 1, hullL / 2 + 1.5); g.add(bow);
    // 上层建筑
    const superW = hullW * 0.6;
    const superL = type === 'patrol' ? 6 : 10;
    const superstr = new THREE.Mesh(new THREE.BoxGeometry(superW, 2.5, superL), superMat);
    superstr.position.set(0, 3.25, -2); g.add(superstr);
    // 桅杆
    if (type === 'patrol') {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4, 6), hullMat);
      mast.position.set(0, 5.5, -2); g.add(mast);
    } else {
      // 货船: 多个烟囱
      const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 2, 8), hullMat);
      stack.position.set(0, 5, -3); g.add(stack);
      const stack2 = stack.clone(); stack2.position.set(0, 5, 1); g.add(stack2);
    }
    // 货物集装箱(仅货船)
    if (type !== 'patrol') {
      const contMat = new THREE.MeshStandardMaterial({ color: 0x8a4a3a, roughness: 0.8 });
      const cont = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 2.5), contMat);
      cont.position.set(-1.5, 4.2, 5); g.add(cont);
      const cont2 = cont.clone(); cont2.position.set(1.5, 4.2, 5); g.add(cont2);
    }

    g.position.set(x, -0.2, z); // 半浮在水面
    g.castShadow = true;
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
    this.scene.add(g);
    const box = new THREE.Box3().setFromObject(g);
    this.obstacles.push({ mesh: g, box, penetrable: false });
    this.coverPoints.push(new THREE.Vector3(x, 0, z + hullL / 2));
  }

  // ---- 战列舰 ----
  _addBattleship(x, z) {
    const g = new THREE.Group();
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x3a4a5a, roughness: 0.5 });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x5a6a7a, metalness: 0.4, roughness: 0.5 });
    // 主船体
    const hull = new THREE.Mesh(new THREE.BoxGeometry(8, 3.5, 30), hullMat);
    hull.position.y = 1.75; g.add(hull);
    // 船首
    const bow = new THREE.Mesh(new THREE.ConeGeometry(4, 5, 4), hullMat);
    bow.rotation.x = Math.PI / 2; bow.position.set(0, 1.75, 17.5); g.add(bow);
    // 主炮塔
    const turret = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 4), steelMat);
    turret.position.set(0, 4.5, -5); g.add(turret);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 8, 8), steelMat);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 5.5, -1); g.add(barrel);
    // 第二炮塔
    const turret2 = turret.clone(); turret2.position.set(0, 4.5, 8); g.add(turret2);
    const barrel2 = barrel.clone(); barrel2.position.set(0, 5.5, 12); g.add(barrel2);
    // 上层建筑
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 6), steelMat);
    bridge.position.set(0, 5, -10); g.add(bridge);
    // 桅杆
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 6, 6), hullMat);
    mast.position.set(0, 8.5, -10); g.add(mast);

    g.position.set(x, -0.15, z);
    g.castShadow = true;
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
    this.scene.add(g);
    const box = new THREE.Box3().setFromObject(g);
    this.obstacles.push({ mesh: g, box, penetrable: false });
    this.coverPoints.push(new THREE.Vector3(x, 0, z + 15));
  }

  // ---- 集装箱 ----
  _addContainer(x, z, rot) {
    const colors = [0x8a4a3a, 0x3a6a8a, 0x6a6a3a, 0x5a4a6a, 0x7a5a3a];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const g = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 2.4, 4.8),
      new THREE.MeshStandardMaterial({ color, roughness: 0.85 })
    );
    g.position.set(x, this.getGroundHeight(x, z) + 1.2, z);
    g.rotation.y = rot;
    g.castShadow = true; g.receiveShadow = true;
    this.scene.add(g);
    const box = new THREE.Box3().setFromObject(g);
    this.obstacles.push({ mesh: g, box, penetrable: false });
    this.coverPoints.push(new THREE.Vector3(x, 0, z + 1));
  }

  // ---- 码头/栈桥 ----
  _addPier(x, z, len) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x6a5a3a, roughness: 0.9 });
    // 木板平台
    const deck = new THREE.Mesh(new THREE.BoxGeometry(4, 0.3, len), mat);
    deck.position.y = 0.15; g.add(deck);
    // 支柱
    for (let i = 0; i < len / 3; i++) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.5, 0.2), mat);
      post.position.set(-1.5, -0.5, -len/2 + 1.5 + i * 3); g.add(post);
      const post2 = post.clone(); post2.position.x = 1.5; g.add(post2);
    }
    // 护栏
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.6, len),
      new THREE.MeshStandardMaterial({ color: 0x4a3a2a }));
    rail.position.set(-2, 0.5, 0); g.add(rail);
    const rail2 = rail.clone(); rail2.position.x = 2; g.add(rail2);

    g.position.set(x, 0, z);
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.scene.add(g);
    const box = new THREE.Box3().setFromObject(g);
    this.obstacles.push({ mesh: g, box, penetrable: false });
  }

  // ---- 干船坞 ----
  _addDryDock(x, z) {
    const g = new THREE.Group();
    const concreteMat = new THREE.MeshStandardMaterial({ color: 0x6a6a6a, roughness: 0.95 });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x5a5a5a, metalness: 0.5, roughness: 0.5 });
    // 坞壁(三面墙)
    const wall1 = new THREE.Mesh(new THREE.BoxGeometry(40, 8, 1), concreteMat);
    wall1.position.set(0, 4, -5); g.add(wall1);
    const wall2 = new THREE.Mesh(new THREE.BoxGeometry(1, 8, 15), concreteMat);
    wall2.position.set(-20, 4, 2.5); g.add(wall2);
    const wall3 = wall2.clone(); wall3.position.set(20, 4, 2.5); g.add(wall3);
    // 坞内地面(低)
    const floor = new THREE.Mesh(new THREE.BoxGeometry(38, 0.5, 14),
      new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.9 }));
    floor.position.set(0, -0.25, 0); g.add(floor);
    // 起重机(龙门吊)
    const crane1 = new THREE.Mesh(new THREE.BoxGeometry(1, 10, 1), steelMat);
    crane1.position.set(-15, 5, -8); g.add(crane1);
    const crane2 = crane1.clone(); crane2.position.set(15, 5, -8); g.add(crane2);
    const craneBeam = new THREE.Mesh(new THREE.BoxGeometry(32, 0.6, 0.6), steelMat);
    craneBeam.position.set(0, 10, -8); g.add(craneBeam);
    // 吊钩
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 4, 6), steelMat);
    cable.position.set(0, 7.5, -8); g.add(cable);

    g.position.set(x, 0, z);
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.scene.add(g);
    const box = new THREE.Box3().setFromObject(g);
    this.obstacles.push({ mesh: g, box, penetrable: false });
    this.coverPoints.push(new THREE.Vector3(x, 0, z + 8));
  }

  // ---- 棕榈树(热带岛屿) ----
  _addPalmTree(x, z) {
    const g = new THREE.Group();
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6a5a3a, roughness: 0.9 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2a6a2a, roughness: 0.8 });
    // 树干(弯曲)
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, 5, 6), trunkMat);
    trunk.position.y = 2.5; trunk.rotation.z = randRange(-0.15, 0.15);
    g.add(trunk);
    // 叶簇(多片叶子)
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.5, 4), leafMat);
      const ang = (i / 6) * Math.PI * 2;
      leaf.position.set(Math.cos(ang) * 0.5, 5 + Math.sin(ang) * 0.3, Math.sin(ang) * 0.5);
      leaf.rotation.z = Math.cos(ang) * 0.6;
      leaf.rotation.x = Math.sin(ang) * 0.6;
      g.add(leaf);
    }
    g.position.set(x, this.getGroundHeight(x, z), z);
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
    this.scene.add(g);
    const box = new THREE.Box3().setFromObject(g);
    this.obstacles.push({ mesh: g, box, penetrable: false });
  }

  // ---- 岩石 ----
  _addRock(x, z, size) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x6a6a6a, roughness: 0.9 });
    const g = new THREE.Mesh(new THREE.DodecahedronGeometry(size, 0), mat);
    g.position.set(x, this.getGroundHeight(x, z) + size * 0.4, z);
    g.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    g.scale.set(1, 0.6, 1);
    g.castShadow = true; g.receiveShadow = true;
    this.scene.add(g);
    const box = new THREE.Box3().setFromObject(g);
    this.obstacles.push({ mesh: g, box, penetrable: false });
    this.coverPoints.push(new THREE.Vector3(x, 0, z));
  }

  // ---- 铁丝网障碍 ----
  _addBarricade(x, z) {
    const g = new THREE.Group();
    const postMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.9 });
    const wireMat = new THREE.MeshStandardMaterial({ color: 0x6a6a5a, metalness: 0.3, roughness: 0.7 });
    // 木桩
    for (let i = 0; i < 3; i++) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 0.1), postMat);
      post.position.set((i - 1) * 0.8, 0.6, 0);
      g.add(post);
    }
    // 铁丝网(简化为薄板)
    const wire = new THREE.Mesh(new THREE.BoxGeometry(2, 0.8, 0.02), wireMat);
    wire.position.set(0, 0.7, 0); g.add(wire);
    g.position.set(x, this.getGroundHeight(x, z), z);
    g.rotation.y = randRange(0, Math.PI);
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.scene.add(g);
    const box = new THREE.Box3().setFromObject(g);
    this.obstacles.push({ mesh: g, box, penetrable: false });
    this.coverPoints.push(new THREE.Vector3(x, 0, z + 0.5));
  }

  _addTree(x, z, density = 0.4) {
    const g = new THREE.Group();
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.9 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x3a5a2a, roughness: 0.85 });
    const h = randRange(4, 8);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, h, 6), trunkMat);
    trunk.position.y = h/2; g.add(trunk);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(randRange(2, 3.5), 8, 6), leafMat);
    crown.position.y = h + 1.5; g.add(crown);
    g.position.set(x, this.getGroundHeight(x,z), z);
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.scene.add(g);
    const box = new THREE.Box3().setFromObject(g);
    this.obstacles.push({ mesh: g, box, penetrable: false });
  }

  // ========== 据点 ==========
  _buildObjectives() {
    const c = this.campaign;
    for (const obj of c.objectives) {
      const o = {
        id: obj.id, name: obj.name,
        position: obj.position, radius: obj.radius,
        holder: null,           // 谁占领: team id 或 null(争夺中)
        capProgress: 0,         // -100..100, 正=攻击方, 负=防守方
        capDir: 0,
        flagMesh: null,
      };
      // 旗杆(视觉)
      const flagGroup = new THREE.Group();
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 5, 6),
        new THREE.MeshStandardMaterial({ color: 0x4a3a2a })
      );
      pole.position.y = 2.5; flagGroup.add(pole);
      const flag = new THREE.Mesh(
        new THREE.PlaneGeometry(1.5, 1),
        new THREE.MeshStandardMaterial({ color: 0x888888, side: THREE.DoubleSide })
      );
      flag.position.set(0.8, 4.2, 0); flagGroup.add(flag);
      o.flagMesh = flagGroup;
      o.flagCloth = flag;
      // 占点圈
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(o.radius - 0.3, o.radius, 48),
        new THREE.MeshBasicMaterial({ color: 0xc9a96a, transparent: true, opacity: 0.4, side: THREE.DoubleSide })
      );
      ring.rotation.x = -Math.PI/2;
      ring.position.set(obj.position[0], this.getGroundHeight(obj.position[0], obj.position[2]) + 0.05, obj.position[2]);
      this.scene.add(ring);
      flagGroup.position.set(obj.position[0], this.getGroundHeight(obj.position[0], obj.position[2]), obj.position[2]);
      this.scene.add(flagGroup);
      this.objectives.push(o);
    }
  }

  // ========== 天空盒 ==========
  _buildSky() {
    // 渐变天空(大球)
    const skyGeo = new THREE.SphereGeometry(400, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        topColor: { value: new THREE.Color(this.campaign.skyColor) },
        bottomColor: { value: new THREE.Color(this.campaign.skyColor).multiplyScalar(0.6) },
        offset: { value: 50 }, exponent: { value: 0.6 },
      },
      vertexShader: `varying vec3 vWorldPos; void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vWorldPos = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: `uniform vec3 topColor; uniform vec3 bottomColor; uniform float offset; uniform float exponent; varying vec3 vWorldPos;
        void main(){ float h = normalize(vWorldPos + vec3(0.0, offset, 0.0)).y; float t = max(pow(max(h,0.0), exponent), 0.0); gl_FragColor = vec4(mix(bottomColor, topColor, t), 1.0); }`,
    });
    this.sky = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(this.sky);

    // 太阳精灵
    const sunTex = this._makeSunTexture();
    const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    sunSprite.scale.set(30, 30, 1);
    sunSprite.position.copy(this.sun.position).multiplyScalar(2);
    this.scene.add(sunSprite);
    this.sunSprite = sunSprite;

    // 云(简化: 几个白色精灵)
    if (this.campaign.weather !== 'snow') {
      for (let i = 0; i < 12; i++) {
        const cloud = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._makeCloudTexture(), transparent: true, opacity: 0.5, depthWrite: false }));
        cloud.scale.set(randRange(40, 80), randRange(20, 35), 1);
        cloud.position.set(randRange(-200, 200), randRange(80, 130), randRange(-200, 200));
        this.scene.add(cloud);
      }
    }
  }

  _makeSunTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64,64,0,64,64,64);
    grad.addColorStop(0, 'rgba(255,250,220,1)');
    grad.addColorStop(0.2, 'rgba(255,230,160,0.7)');
    grad.addColorStop(1, 'rgba(255,200,100,0)');
    g.fillStyle = grad; g.fillRect(0,0,128,128);
    return new THREE.CanvasTexture(c);
  }
  _makeCloudTexture() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(255,255,255,0.9)';
    for (let i = 0; i < 8; i++) {
      g.beginPath();
      g.arc(40 + i*25, 64 + Math.sin(i)*15, randRange(20, 35), 0, Math.PI*2);
      g.fill();
    }
    return new THREE.CanvasTexture(c);
  }

  // ========== 碰撞 ==========
  collidePlayer(pos, height) {
    // 简易: 阻止穿过障碍 AABB(水平)
    const half = 0.4;
    for (const ob of this.obstacles) {
      if (pos.y + height < ob.box.min.y || pos.y > ob.box.max.y) continue;
      if (pos.x > ob.box.min.x - half && pos.x < ob.box.max.x + half &&
          pos.z > ob.box.min.z - half && pos.z < ob.box.max.z + half) {
        // 推出(最近边)
        const dxL = pos.x - (ob.box.min.x - half);
        const dxR = (ob.box.max.x + half) - pos.x;
        const dzL = pos.z - (ob.box.min.z - half);
        const dzR = (ob.box.max.z + half) - pos.z;
        const m = Math.min(dxL, dxR, dzL, dzR);
        if (m === dxL) pos.x = ob.box.min.x - half;
        else if (m === dxR) pos.x = ob.box.max.x + half;
        else if (m === dzL) pos.z = ob.box.min.z - half;
        else pos.z = ob.box.max.z + half;
      }
    }
    // 地图边界
    pos.x = clamp(pos.x, -95, 95); pos.z = clamp(pos.z, -95, 95);
  }
  collideSoldier(pos, height) { this.collidePlayer(pos, height); }

  // ========== 射线检测 ==========
  // 返回 { point, normal, soldier, headshot, limb, object }
  // excludeShooter: 排除发射者自身(防止命中自己的命中盒)
  raycast(origin, dir, maxDist, excludeShooter = null) {
    const ray = new THREE.Ray(origin, dir.clone().normalize());
    let best = null, bestDist = maxDist;

    // 1. 士兵命中盒(优先, 但需要被障碍挡住)
    // 先找最近障碍距离
    let obstacleDist = maxDist;
    let obstacleHit = null;
    for (const ob of this.obstacles) {
      const hitPt = new THREE.Vector3();
      if (ray.intersectBox(ob.box, hitPt)) {
        const d = origin.distanceTo(hitPt);
        if (d < obstacleDist && d > 0.01) {
          obstacleDist = d;
          obstacleHit = { point: hitPt, normal: new THREE.Vector3(0,1,0), object: ob.mesh };
          // 计算法线(简化: 用面法线)
          const local = hitPt.clone().sub(ob.box.getCenter(new THREE.Vector3()));
          const ext = ob.box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
          const nx = Math.abs(local.x/ext.x), ny = Math.abs(local.y/ext.y), nz = Math.abs(local.z/ext.z);
          if (nx > ny && nx > nz) obstacleHit.normal.set(Math.sign(local.x),0,0);
          else if (ny > nz) obstacleHit.normal.set(0,Math.sign(local.y),0);
          else obstacleHit.normal.set(0,0,Math.sign(local.z));
        }
      }
    }

    // 2. 士兵(取最近且在障碍之前,排除自己)
    let soldierHit = null, soldierDist = maxDist;
    for (const s of this.soldiers) {
      if (!s.alive) continue;
      if (s === excludeShooter) continue;
      const r = s.hitTest(origin, dir, maxDist);
      if (r && origin.distanceTo(r.point) < soldierDist) {
        soldierDist = origin.distanceTo(r.point);
        soldierHit = { ...r, soldier: s };
      }
    }

    // 2b. 坦克(命中载具, 不算 soldier)
    let tankHit = null, tankDist = maxDist;
    for (const t of (this.tanks || [])) {
      if (!t.alive) continue;
      const r = t.hitTest(origin, dir, maxDist);
      if (r && origin.distanceTo(r.point) < tankDist) {
        tankDist = origin.distanceTo(r.point);
        tankHit = { ...r, soldier: t };  // 复用 soldier 字段以走伤害逻辑
      }
    }

    if (soldierHit && soldierDist <= obstacleDist && soldierDist <= tankDist) {
      return soldierHit;
    }
    if (tankHit && tankDist <= obstacleDist) {
      return tankHit;
    }
    if (obstacleHit) return obstacleHit;

    // 3. 地形(粗略: 沿射线步进检测高度)
    const stepLen = 2;
    let d = 0;
    while (d < bestDist) {
      d += stepLen;
      const p = origin.clone().addScaledVector(dir, d);
      const gh = this.getGroundHeight(p.x, p.z);
      if (p.y <= gh + 0.1) {
        return { point: new THREE.Vector3(p.x, gh, p.z), normal: new THREE.Vector3(0,1,0), object: this.groundMesh };
      }
    }
    return null;
  }

  // ========== 投掷物 ==========
  spawnGrenade(origin, dir, weapon, thrower) {
    const g = {
      type: 'grenade', weapon, thrower,
      pos: origin.clone(), vel: dir.clone().multiplyScalar(weapon.throwRange),
      fuse: weapon.fuseTime, mesh: null, exploded: false,
    };
    g.vel.y += 6;
    // 视觉
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x3a4a2a, metalness: 0.4, roughness: 0.6 })
    );
    mesh.position.copy(g.pos);
    this.scene.add(mesh);
    g.mesh = mesh;
    this.grenades.push(g);
  }

  spawnRocket(origin, dir, weapon, thrower) {
    const g = {
      type: 'rocket', weapon, thrower,
      pos: origin.clone(), vel: dir.clone().multiplyScalar(weapon.bulletSpeed),
      fuse: 5, mesh: null, exploded: false,
    };
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.4, 8),
      new THREE.MeshStandardMaterial({ color: 0x5a3a1a, metalness: 0.5, roughness: 0.5 })
    );
    mesh.rotation.x = Math.PI/2;
    mesh.position.copy(g.pos);
    this.scene.add(mesh);
    g.mesh = mesh;
    this.grenades.push(g);
  }

  spawnTracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const mat = new THREE.LineBasicMaterial({ color: 0xffcc66, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this._tracers = this._tracers || [];
    this._tracers.push({ line, life: 0.08, total: 0.08 });
  }

  // ========== 投掷物/曳光 更新 ==========
  updateProjectiles(dt) {
    // 投掷物
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      if (g.exploded) { this.grenades.splice(i, 1); continue; }
      // 物理
      g.vel.y -= 9.8 * dt;
      const newPos = g.pos.clone().addScaledVector(g.vel, dt);
      // 地面碰撞(弹跳)
      const gh = this.getGroundHeight(newPos.x, newPos.z);
      if (newPos.y <= gh + 0.1) {
        newPos.y = gh + 0.1;
        g.vel.y = -g.vel.y * 0.4;
        g.vel.x *= 0.7; g.vel.z *= 0.7;
      }
      g.pos.copy(newPos);
      g.mesh.position.copy(g.pos);
      g.fuse -= dt;
      if (g.fuse <= 0) {
        this._explode(g);
        g.exploded = true;
        this.scene.remove(g.mesh);
        g.mesh.geometry.dispose();
      }
    }
    // 曳光衰减
    if (this._tracers) {
      for (let i = this._tracers.length - 1; i >= 0; i--) {
        const t = this._tracers[i];
        t.life -= dt;
        t.line.material.opacity = Math.max(0, t.life / t.total) * 0.6;
        if (t.life <= 0) {
          this.scene.remove(t.line);
          t.line.geometry.dispose(); t.line.material.dispose();
          this._tracers.splice(i, 1);
        }
      }
    }
  }

  _explode(g) {
    const pos = g.pos.clone();
    if (this.audio) this.audio.explosion(pos, 1.2);
    // 范围伤害
    const r = g.weapon.radius;
    const all = [this.player, ...this.soldiers].filter(Boolean);
    for (const target of all) {
      if (!target.alive) continue;
      const d = target.position.distanceTo(pos);
      if (d > r) continue;
      const dmg = g.weapon.damage * (1 - d / r);
      if (target.isPlayer) {
        target.takeDamage(dmg, pos);
      } else {
        target.takeDamage(dmg, new THREE.Vector3().subVectors(target.position, pos).normalize(), false, g.thrower);
      }
    }
    // 视觉: 爆炸火球
    this._spawnExplosionFx(pos, r);
    // 破坏掩体(可选, 此处略)
  }

  _spawnExplosionFx(pos, radius) {
    // 火球
    const fireball = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 0.5, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xffaa33, transparent: true, opacity: 0.9 })
    );
    fireball.position.copy(pos);
    this.scene.add(fireball);
    // 光
    const light = new THREE.PointLight(0xffaa44, 8, radius * 4, 2);
    light.position.copy(pos);
    this.scene.add(light);
    // 烟尘精灵
    const smokeTex = this._makeSmokeTexture();
    const smoke = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, opacity: 0.8, depthWrite: false }));
    smoke.scale.set(radius*2, radius*2, 1);
    smoke.position.copy(pos); smoke.position.y += 1;
    this.scene.add(smoke);

    let t = 0;
    const animate = () => {
      t += 0.016;
      fireball.scale.setScalar(1 + t * 2);
      fireball.material.opacity = Math.max(0, 0.9 - t * 1.5);
      light.intensity = Math.max(0, 8 - t * 12);
      smoke.scale.setScalar((radius*2) * (1 + t * 0.8));
      smoke.material.opacity = Math.max(0, 0.8 - t * 0.5);
      if (t < 1.5) requestAnimationFrame(animate);
      else {
        this.scene.remove(fireball); this.scene.remove(light); this.scene.remove(smoke);
        fireball.geometry.dispose(); fireball.material.dispose();
        smoke.material.dispose();
      }
    };
    animate();
  }

  _makeSmokeTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64,64,0,64,64,64);
    grad.addColorStop(0, 'rgba(80,70,60,0.9)');
    grad.addColorStop(1, 'rgba(40,35,30,0)');
    g.fillStyle = grad; g.fillRect(0,0,128,128);
    return new THREE.CanvasTexture(c);
  }

  // ========== 草叶装饰: InstancedMesh 散立草叶 ==========
  _buildGrass() {
    const c = this.campaign;
    // 草叶总数按战役类型自动调整
    let blades;
    if (c.weather === 'snow') blades = 0;                                    // 雪地无草
    else if (c.map === 'normandy') blades = 18000;
    else if (c.map === 'omaha') blades = 10000;
    else if (c.map === 'lighthouse') blades = 8000;
    else if (c.map === 'pearlHarbor') blades = 6000;
    else if (c.map === 'burma')    blades = 22000;                              // 丛林茂密
    else if (c.map === 'baidatuan') blades = 14000;                            // 田野草
    else if (c.map === 'moscow' || c.map === 'stalingrad') blades = 6000;      // 城市/冬都 稀疏
    else if (c.map === 'berlin' || c.map === 'shanghai') blades = 4500;         // 废墟更少
    else blades = 12000;

    if (blades <= 0) return;

    // 单个草叶几何体: 细长四边形(两三角), 用顶点色黄绿渐变顶端
    const bladeGeo = this._makeGrassBladeGeometry();
    // 按战役草色调色
    const pal = this._getGroundPalette(c);
    const grassColorBottom = new THREE.Color(pal.grass).multiplyScalar(0.75);
    const grassColorTop    = new THREE.Color(pal.grass).lerp(new THREE.Color(0xaacc55), 0.45);
    // 滇缅更油亮深绿,莫斯科/斯大林格勒偏枯草黄
    if (c.map === 'burma') { grassColorBottom.lerp(new THREE.Color(0x1f4020), 0.4); grassColorTop.lerp(new THREE.Color(0x4a8a2a), 0.4); }
    if (c.map === 'moscow') { grassColorTop.lerp(new THREE.Color(0xc4b040), 0.35); grassColorBottom.lerp(new THREE.Color(0x8a7030), 0.3); }

    const bladeMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 0.85,
      metalness: 0,
      transparent: false,
    });

    const imesh = new THREE.InstancedMesh(bladeGeo, bladeMat, blades);
    imesh.receiveShadow = false;
    imesh.castShadow = true;
    this._grassInstances = imesh;

    const dummy = new THREE.Object3D();
    let placed = 0, attempts = 0, rejects = 0;
    const maxAttempts = blades * 6;

    while (placed < blades && attempts < maxAttempts) {
      attempts++;
      const x = this.rng.range(-MAP_SIZE / 2 + 2, MAP_SIZE / 2 - 2);
      const z = this.rng.range(-MAP_SIZE / 2 + 2, MAP_SIZE / 2 - 2);
      // 过滤沙地/据点/城市中心建筑密集区
      const y = this.getGroundHeight(x, z);
      // 诺曼底海滩不生草
      if (c.map === 'normandy' && z > 28) { rejects++; continue; }
      // 奥马哈: 海面(z>55)和海滩(z>35)不生草
      if (c.map === 'omaha' && z > 35) { rejects++; continue; }
      // 灯塔岛: 海面(距中心>55)不生草
      if (c.map === 'lighthouse' && Math.hypot(x, z) > 45) { rejects++; continue; }
      // 珍珠港: 水面(|x|>55)不生草
      if (c.map === 'pearlHarbor' && Math.abs(x) > 55) { rejects++; continue; }
      // 斯大林格勒 & 柏林: 城市中心 40m 范围内少草(建筑/废墟)
      if ((c.map === 'stalingrad' || c.map === 'berlin') && Math.abs(x) < 35 && Math.abs(z) < 35 && this.rng.next() > 0.25) { rejects++; continue; }
      // 据点周围保持干净(6m)
      let nearObjective = false;
      for (const obj of this.objectives) {
        if (Math.hypot(x - obj.position[0], z - obj.position[2]) < obj.radius + 4) { nearObjective = true; break; }
      }
      if (nearObjective) { rejects++; continue; }
      // 障碍物(墙体/碉堡/沙袋)周围 2m 不种草,避免穿插
      let insideObs = false;
      for (const ob of this.obstacles) {
        if (x > ob.box.min.x - 2 && x < ob.box.max.x + 2 && z > ob.box.min.z - 2 && z < ob.box.max.z + 2) { insideObs = true; break; }
      }
      if (insideObs) { rejects++; continue; }
      // 高海拔岩石区(>5m)减少草
      if (y > 5 && this.rng.next() < 0.7) { rejects++; continue; }

      // 尺寸抖动
      const scale = 0.8 + this.rng.next() * 0.9;
      dummy.position.set(x, y + 0.01, z);
      dummy.rotation.y = this.rng.next() * Math.PI * 2;
      dummy.rotation.z = (this.rng.next() - 0.5) * 0.2;  // 微倾斜
      dummy.scale.set(scale * (0.85 + this.rng.next() * 0.4), scale, 1);
      dummy.updateMatrix();
      imesh.setMatrixAt(placed, dummy.matrix);
      // 让每簇草的颜色顶部有微妙差异(通过 setColorAt 或自定义 attribute)
      // 简单做法: 用 matrix 的 scale.y 再乘以颜色, 这里统一用材质颜色足够

      placed++;
    }
    imesh.instanceMatrix.needsUpdate = true;
    this.scene.add(imesh);
    // console.debug(`草叶放置 ${placed}/${attempts}, 跳过 ${rejects}`);

    // ---- 简单"风摇摆"动画: 直接每帧改写矩阵(不暴力,用时间统一扰动) ----
    // 为了让顶点做弯曲, 我们改用自定义 attribute instancePhase + 顶点 shader; 但考虑复杂度,
    // 这里用另一种方式: 给每个实例加 Y 轴方向的"风相"到 userData, 每帧旋转少许即可。
    this._grassPhases = new Float32Array(placed);
    for (let i = 0; i < placed; i++) this._grassPhases[i] = this.rng.next() * Math.PI * 2;
    this._grassT0 = 0;

    // 覆盖 instancedMesh 的 update, 通过 Game 主循环每帧调用 World.update(dt)
    if (!this._updateHandlers) this._updateHandlers = [];
    this._updateHandlers.push(this._updateGrass.bind(this));
  }

  // 单个草叶几何体: 细长四边形(4 顶点, 2 三角), 底部暗绿, 顶部亮黄
  _makeGrassBladeGeometry() {
    const geo = new THREE.BufferGeometry();
    const W = 0.12, H = 0.8;
    const positions = new Float32Array([
      -W/2, 0,   0,
       W/2, 0,   0,
       W/2, H,   0,
      -W/2, H,   0,
    ]);
    // 三角形
    const indices = [0,1,2, 0,2,3];
    // 法线(简单朝 +Z 以及 -Z, DoubleSide 会处理背面)
    const normals = new Float32Array([0,0,1, 0,0,1, 0,0,1, 0,0,1]);
    const colors = new Float32Array([
      0.2,0.4,0.15,  0.2,0.4,0.15,
      0.5,0.7,0.3,   0.5,0.7,0.3,
    ]);
    const uvs = new Float32Array([0,0, 1,0, 1,1, 0,1]);
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    // 顶点在顶部略弯(不是平三角) — 对 x 做轻微收缩,使其近看像草
    // (已在 positions 中用简单四边形, 保持性能)
    return geo;
  }

  // 草风摆动: 分块更新 instanceMatrix 数组, 避免大量对象分解/组合
  _updateGrass(dt, time) {
    if (!this._grassInstances) return;
    const mesh = this._grassInstances;
    const N = mesh.count;
    if (!N) return;

    // 每帧只更新总数的 1/10, 10 帧一轮,肉眼看不出来掉帧但省算力
    const BATCH = Math.max(1, Math.ceil(N / 10));
    const start = (this._grassBatchStart || 0);
    const end = Math.min(N, start + BATCH);
    this._grassBatchStart = end >= N ? 0 : end;

    const speed = 1.6; const bend = 0.12;
    const arr = mesh.instanceMatrix.array;

    const tmpPos = new THREE.Vector3();
    const tmpRot = new THREE.Quaternion();
    const tmpScale = new THREE.Vector3();
    const tmpMtx = new THREE.Matrix4();
    const tmpEuler = new THREE.Euler();
    const els = tmpMtx.elements;

    for (let i = start; i < end; i++) {
      const base = i * 16;
      for (let k = 0; k < 16; k++) els[k] = arr[base + k];
      tmpMtx.decompose(tmpPos, tmpRot, tmpScale);

      const phase = this._grassPhases[i] + time * speed;
      const sway = Math.sin(phase) * bend + Math.cos(phase * 1.6 + this._grassPhases[i]) * bend * 0.5;
      tmpEuler.setFromQuaternion(tmpRot);
      tmpEuler.x = sway * 0.45;
      tmpEuler.z = sway * 0.3;
      tmpRot.setFromEuler(tmpEuler);
      tmpMtx.compose(tmpPos, tmpRot, tmpScale);
      for (let k = 0; k < 16; k++) arr[base + k] = els[k];
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  // ----------- 通用 World.update(每帧调用, 目前驱动草摆动) -----------
  update(dt) {
    this._timeSec = (this._timeSec || 0) + dt;
    if (this._updateHandlers) {
      for (const fn of this._updateHandlers) fn(dt, this._timeSec);
    }
  }

  // ========== 占点更新 ==========
  updateObjectives(dt, attackerTeam, defenderTeam) {
    for (const obj of this.objectives) {
      // 统计圈内双方人数
      const op = new THREE.Vector3(...obj.position);
      let atk = 0, def = 0;
      // 玩家
      if (this.player && this.player.alive && this.player.position.distanceTo(op) < obj.radius) {
        if (this.player.team === attackerTeam) atk++; else if (this.player.team === defenderTeam) def++;
      }
      for (const s of this.soldiers) {
        if (!s.alive) continue;
        if (s.position.distanceTo(op) < obj.radius) {
          if (s.team === attackerTeam) atk++; else if (s.team === defenderTeam) def++;
        }
      }
      // 占领进度
      const rate = 25; // 每秒每人的占领速率
      if (atk > 0 && def === 0) {
        obj.capProgress = clamp(obj.capProgress + atk * rate * dt, -100, 100);
        obj.capDir = 1;
      } else if (def > 0 && atk === 0) {
        obj.capProgress = clamp(obj.capProgress - def * rate * dt, -100, 100);
        obj.capDir = -1;
      } else {
        obj.capDir = 0;
      }
      // 切换占领
      if (obj.capProgress >= 100 && obj.holder !== attackerTeam) {
        obj.holder = attackerTeam;
        obj.flagCloth.material.color.set(0xc0392b);
      } else if (obj.capProgress <= -100 && obj.holder !== defenderTeam) {
        obj.holder = defenderTeam;
        obj.flagCloth.material.color.set(0x3074d8);
      } else if (obj.capProgress > -100 && obj.capProgress < 100 && obj.holder === null) {
        obj.flagCloth.material.color.set(0x888888);
      }
    }
  }
}
