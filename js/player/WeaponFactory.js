// js/player/WeaponFactory.js
// 用 Three.js 基本几何体程序化生成武器视图模型(写实低多边形风)
// 不同 type 对应不同枪型轮廓 + 配色

import * as THREE from 'three';

const matMetal = (color) => new THREE.MeshStandardMaterial({ color, metalness: 0.85, roughness: 0.35 });
const matWood = (color) => new THREE.MeshStandardMaterial({ color, metalness: 0.0, roughness: 0.72 });
const matPlastic = (color) => new THREE.MeshStandardMaterial({ color, metalness: 0.1, roughness: 0.6 });
const matGlass = (color) => new THREE.MeshStandardMaterial({
  color, metalness: 0.95, roughness: 0.08, transparent: true, opacity: 0.85,
  emissive: 0x335577, emissiveIntensity: 0.35
});
const matBrass = () => new THREE.MeshStandardMaterial({ color: 0xc0952a, metalness: 0.92, roughness: 0.3 });

const FACTION_PALETTES = {
  us:  { accent: 0x2e4f2a, wood: 0x6b4a22, mag: 0x3a3a2e, sling: 0x7a5a33 },  // 橄榄绿
  su:  { accent: 0x4a5a2a, wood: 0x6a4520, mag: 0x2e2e24, sling: 0x6a4a28 },  // 苏联绿
  ger: { accent: 0x4a5157, wood: 0x6a401c, mag: 0x2e3135, sling: 0x5a4020 },  // 德方钢铁灰
  jp:  { accent: 0x6a5a2a, wood: 0x6f4518, mag: 0x3a3020, sling: 0x5a3a1a },  // 日军枯草黄
  cn:  { accent: 0x4a5a6b, wood: 0x6a4820, mag: 0x35352a, sling: 0x7a5a30 },  // 国军深蓝灰
  cpc: { accent: 0x6b3a3a, wood: 0x684522, mag: 0x303028, sling: 0x6b4830 },  // 八路军红褐
};

export function createWeaponModel(weapon) {
  const group = new THREE.Group();
  const t = weapon.type;
  const pal = FACTION_PALETTES[weapon.faction] || FACTION_PALETTES.us;
  const metal = matMetal(pal.mag);  // 金属以弹匣/机匣色为主
  const barrelMat = matMetal(0x232427);  // 深蓝黑枪管
  const bodyMetal = matMetal(pal.accent);  // 机匣用阵营点缀色
  const wood = matWood(pal.wood);
  const brass = matBrass();
  const dark = matMetal(0x18181c);

  // 通用: 枪管
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.6, 8), barrelMat);
  barrel.rotation.z = Math.PI / 2;
  barrel.position.x = 0.3;
  group.add(barrel);
  // 枪口黄铜套
  const muzzleRing = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.04, 10), brass);
  muzzleRing.rotation.z = Math.PI / 2;
  muzzleRing.position.x = 0.6;
  group.add(muzzleRing);

  // 机匣(带阵营色点缀边)
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.08), bodyMetal);
  body.position.set(0.0, 0, 0);
  group.add(body);
  const bodyTop = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.02, 0.085), dark);
  bodyTop.position.set(0.0, 0.06, 0);
  group.add(bodyTop);

  // 枪托(木质)+ 黄铜托底板
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.09, 0.07), wood);
  stock.position.set(-0.32, -0.005, 0);
  group.add(stock);
  const butt = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.1, 0.075), brass);
  butt.position.set(-0.445, -0.005, 0);
  group.add(butt);
  // 背带
  const slingMat = matPlastic(pal.sling);
  const sling = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.015, 0.015), slingMat);
  sling.position.set(-0.05, -0.04, 0.045);
  group.add(sling);

  // 握把
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.07), wood);
  grip.position.set(-0.1, -0.1, 0);
  grip.rotation.x = 0.15;
  group.add(grip);
  // 扳机护圈
  const triggerGuard = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 6, 12, Math.PI), metal);
  triggerGuard.position.set(-0.05, -0.05, 0);
  triggerGuard.rotation.z = Math.PI;
  group.add(triggerGuard);

  if (t === 'rifle' || t === 'sniper' || t === 'semi') {
    // 长枪管
    barrel.scale.x = 1.4;
    barrel.position.x = 0.45;
    muzzleRing.scale.x = 1.4; muzzleRing.position.x = 0.87;
    // 护木(木) + 金属箍
    const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.06), wood);
    handguard.position.set(0.18, -0.02, 0);
    group.add(handguard);
    const band1 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 10), metal);
    band1.rotation.z = Math.PI / 2; band1.position.set(0.05, -0.02, 0);
    const band2 = band1.clone(); band2.position.set(0.32, -0.02, 0);
    group.add(band1, band2);
    // 弹仓(栓动)或弹匣(半自动)
    if (t === 'semi') {
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.05), metal);
      mag.position.set(0.02, -0.14, 0);
      group.add(mag);
      const magAccent = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.02, 0.055), bodyMetal);
      magAccent.position.set(0.02, -0.06, 0);
      group.add(magAccent);
    } else {
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.05), metal);
      mag.position.set(-0.02, -0.1, 0);
      group.add(mag);
    }
    if (t === 'sniper') {
      // 瞄准镜(镜身金属+两端蓝玻璃)
      const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 12), dark);
      scope.rotation.z = Math.PI / 2;
      scope.position.set(0.05, 0.12, 0);
      group.add(scope);
      const lensL = new THREE.Mesh(new THREE.CircleGeometry(0.03, 12), matGlass(0x66aaff));
      lensL.position.set(0.2, 0.12, 0); lensL.rotation.y = Math.PI / 2;
      const lensR = new THREE.Mesh(new THREE.CircleGeometry(0.03, 12), matGlass(0x88ccff));
      lensR.position.set(-0.1, 0.12, 0); lensR.rotation.y = -Math.PI / 2;
      group.add(lensL, lensR);
      const scopeRing1 = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.006, 6, 12), brass);
      scopeRing1.rotation.y = Math.PI / 2; scopeRing1.position.set(0.15, 0.12, 0);
      const scopeRing2 = scopeRing1.clone(); scopeRing2.position.set(-0.05, 0.12, 0);
      group.add(scopeRing1, scopeRing2);
    }
  } else if (t === 'smg') {
    // 短枪管
    barrel.scale.x = 0.7;
    barrel.position.x = 0.2;
    muzzleRing.scale.x = 0.7; muzzleRing.position.x = 0.41;
    // 大弹匣
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.06), metal);
    mag.position.set(0.0, -0.16, 0);
    group.add(mag);
    const magStripe = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.03, 0.065), bodyMetal);
    magStripe.position.set(0.0, -0.08, 0);
    group.add(magStripe);
    // 折叠枪托
    const stock2 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.05, 0.06), metal);
    stock2.position.set(-0.27, -0.02, 0);
    group.add(stock2);
  } else if (t === 'lmg') {
    // 重枪管
    barrel.geometry.dispose();
    barrel.geometry = new THREE.CylinderGeometry(0.04, 0.04, 0.7, 10);
    barrel.scale.x = 1.2;
    barrel.position.x = 0.45;
    muzzleRing.geometry.dispose();
    muzzleRing.geometry = new THREE.CylinderGeometry(0.05, 0.05, 0.05, 10);
    muzzleRing.scale.x = 1.2; muzzleRing.position.x = 0.87;
    // 散热片
    for (let i = 0; i < 6; i++) {
      const fn = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.012, 12), dark);
      fn.rotation.z = Math.PI / 2;
      fn.position.set(0.3 + i * 0.06, 0, 0);
      group.add(fn);
    }
    // 圆盘/弹链弹匣
    if (weapon.id === 'dp28' || weapon.id === 'type99mg') {
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.05, 16), metal);
      disc.rotation.x = Math.PI / 2;
      disc.position.set(0.0, -0.15, 0.05);
      group.add(disc);
      const discRing = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.008, 6, 20), brass);
      discRing.position.set(0.0, -0.15, 0.05);
      group.add(discRing);
    } else {
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.2), metal);
      mag.position.set(0.0, -0.1, 0.04);
      group.add(mag);
    }
    // 两脚架
    const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.008,0.008,0.18,4), dark);
    legL.position.set(0.35, -0.12, 0.05); legL.rotation.z = 0.3;
    const legR = legL.clone(); legR.position.z = -0.05; legR.rotation.z = 0.3;
    group.add(legL, legR);
    // 提手
    const carry = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.1, 0.12), bodyMetal);
    carry.position.set(0.05, 0.12, 0);
    group.add(carry);
  } else if (t === 'pistol') {
    // 手枪: 移除长枪管/长机匣/长枪托/长护木等额外部件
    group.remove(stock, butt, sling, barrel, muzzleRing, bodyTop);
    // 短小枪管
    const pBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.18, 8), barrelMat);
    pBarrel.rotation.z = Math.PI / 2; pBarrel.position.x = 0.16;
    group.add(pBarrel);
    const pMuzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.03, 8), brass);
    pMuzzle.rotation.z = Math.PI / 2; pMuzzle.position.x = 0.25;
    group.add(pMuzzle);
    // 滑套(机匣)
    body.geometry.dispose();
    body.geometry = new THREE.BoxGeometry(0.18, 0.08, 0.06);
    body.material = bodyMetal;
    body.position.set(0.05, 0.02, 0);
    const slideTop = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.015, 0.062), dark);
    slideTop.position.set(0.05, 0.07, 0);
    group.add(slideTop);
    // 握把
    grip.geometry.dispose();
    grip.geometry = new THREE.BoxGeometry(0.06, 0.16, 0.07);
    grip.material = wood;
    grip.position.set(-0.02, -0.12, 0);
    grip.rotation.x = 0;
  } else if (t === 'grenade') {
    group.clear();
    const gcol = (weapon.id === 'mk2') ? 0x3a4a2a : (weapon.id === 'm24' ? 0x5a4a2a :
      (weapon.id === 'rgd33' ? 0x4a5a2a : (weapon.id === 'molotov' ? 0x2a4a1a : 0x4a4a2a)));
    const body2 = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), matMetal(gcol));
    group.add(body2);
    const gTopMat = (weapon.id === 'white_phosphorus' || weapon.id === 'molotov')
      ? new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.5, emissive: 0xffaa22, emissiveIntensity: 0.25 })
      : matMetal(0x6a5a2a);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.05, 6), gTopMat);
    top.position.y = 0.075;
    group.add(top);
    // 破片壳条纹(MK2)
    if (weapon.id === 'mk2') {
      for (let i = 0; i < 4; i++) {
        const line = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.005, 0.005), dark);
        line.position.y = -0.03 + i * 0.025;
        line.rotation.y = (i % 2) * Math.PI / 2;
        group.add(line);
      }
    }
  } else if (t === 'rocket') {
    group.clear();
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 12), matMetal(pal.mag));
    tube.rotation.z = Math.PI / 2;
    tube.position.x = 0.3;
    group.add(tube);
    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.06, 0.08, 12), brass);
    muzzle.rotation.z = Math.PI / 2; muzzle.position.x = 0.7;
    group.add(muzzle);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.03), dark);
    sight.position.set(0.1, 0.07, 0);
    group.add(sight);
    const grip2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.07), matPlastic(pal.accent));
    grip2.position.set(0.1, -0.1, 0);
    group.add(grip2);
  }

  group.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return group;
}

// 第三人称手持武器简化模型(给 AI 士兵)
export function createSimpleRifle(color = 0x2a2a2e) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.06), matMetal(color));
  body.position.x = 0.2;
  g.add(body);
  return g;
}
