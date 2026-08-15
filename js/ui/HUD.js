// js/ui/HUD.js
// HUD 控制器: 血量/护甲/弹药/准星/命中标记/小地图/击杀提示/占点/死亡/暂停/帧率

import { FACTIONS } from '../data/factions.js';

export class HUD {
  constructor() {
    this.el = {
      hud: document.getElementById('gameHUD'),
      crosshair: document.getElementById('crosshair'),
      hitMarker: document.getElementById('hitMarker'),
      healthFill: document.getElementById('healthFill'),
      armorFill: document.getElementById('armorFill'),
      healthText: document.getElementById('healthText'),
      armorText: document.getElementById('armorText'),
      weaponName: document.getElementById('weaponName'),
      ammoMag: document.getElementById('ammoMag'),
      ammoReserve: document.getElementById('ammoReserve'),
      fireMode: document.getElementById('fireMode'),
      minimap: document.getElementById('minimap'),
      objectiveName: document.getElementById('objectiveName'),
      capFill: document.getElementById('capFill'),
      capStatus: document.getElementById('capStatus'),
      killFeed: document.getElementById('killFeed'),
      squadOrder: document.getElementById('squadOrder'),
      centerToast: document.getElementById('centerToast'),
      deathScreen: document.getElementById('deathScreen'),
      killedBy: document.getElementById('killedBy'),
      respawnBtn: document.getElementById('respawnBtn'),
      pauseMenu: document.getElementById('pauseMenu'),
      resumeBtn: document.getElementById('resumeBtn'),
      quitBtn: document.getElementById('quitBtn'),
      fps: document.getElementById('fpsCounter'),
    };
    this.minimapCtx = this.el.minimap.getContext('2d');
    this._toastTimer = 0;
    this._hitMarkerTimer = 0;
  }

  show() { this.el.hud.classList.remove('hidden'); }
  hide() { this.el.hud.classList.add('hidden'); }

  // 准星动态扩散
  updateCrosshair(spread) {
    const expand = Math.min(spread * 2000, 18);
    const lines = this.el.crosshair.children;
    // top/bottom/left/right
    lines[0].style.top = (2 + expand) + 'px';
    lines[1].style.bottom = (2 + expand) + 'px';
    lines[2].style.left = (2 + expand) + 'px';
    lines[3].style.right = (2 + expand) + 'px';
  }

  showHitMarker(headshot) {
    this.el.hitMarker.classList.remove('hidden');
    this.el.hitMarker.style.transform = 'translate(-50%, -50%) rotate(45deg) scale(' + (headshot ? 1.4 : 1) + ')';
    this.el.hitMarker.style.setProperty('--c', headshot ? '#ff3030' : '#ff4040');
    this._hitMarkerTimer = 0.12;
  }

  updateVitals(hp, armor) {
    this.el.healthFill.style.width = hp + '%';
    this.el.armorFill.style.width = armor + '%';
    this.el.healthText.textContent = Math.ceil(hp);
    this.el.armorText.textContent = Math.ceil(armor);
    // 低血红色脉动
    if (hp < 30) {
      this.el.healthFill.style.background = 'linear-gradient(90deg, #8a1f1f, #ff3030)';
    } else {
      this.el.healthFill.style.background = 'linear-gradient(90deg, #8a1f1f, #d83030)';
    }
  }

  updateWeapon(weapon, ammo) {
    this.el.weaponName.textContent = weapon.name;
    this.el.ammoMag.textContent = ammo.mag;
    this.el.ammoReserve.textContent = ammo.reserve;
    this.el.fireMode.textContent = weapon.auto ? 'AUTO' : (weapon.type === 'rifle' || weapon.type === 'sniper' ? 'BOLT' : 'SEMI');
  }

  updateAmmo(ammo) {
    this.el.ammoMag.textContent = ammo.mag;
    this.el.ammoReserve.textContent = ammo.reserve;
  }

  showReload(show) {
    if (show) this.showToast('换弹中...', 0);
    else this.hideToast();
  }

  updateObjective(obj, attackerTeam) {
    this.el.objectiveName.textContent = obj.name;
    // capProgress: -100(防守满) ~ 100(攻击满)
    const pct = (obj.capProgress + 100) / 2; // 0~100
    this.el.capFill.style.width = pct + '%';
    if (obj.holder === attackerTeam) {
      this.el.capStatus.textContent = '已占领';
      this.el.capFill.style.background = '#c0392b';
    } else if (obj.holder) {
      this.el.capStatus.textContent = '敌方占领';
      this.el.capFill.style.background = '#3074d8';
    } else if (obj.capDir > 0) {
      this.el.capStatus.textContent = '正在占领...';
      this.el.capFill.style.background = 'linear-gradient(90deg, #3074d8, #c0392b)';
    } else if (obj.capDir < 0) {
      this.el.capStatus.textContent = '敌方反扑!';
      this.el.capFill.style.background = 'linear-gradient(90deg, #3074d8, #c0392b)';
    } else {
      this.el.capStatus.textContent = '争夺中';
      this.el.capFill.style.background = '#888';
    }
  }

  addKill(killer, victim, weapon) {
    const div = document.createElement('div');
    div.className = 'kill-msg';
    const kName = killer?.isPlayer ? '你' : (FACTIONS[killer?.team]?.name || killer?.faction?.name || '士兵');
    const vName = victim?.isPlayer ? '你' : (FACTIONS[victim?.team]?.name || victim?.faction?.name || '士兵');
    div.innerHTML = `<span class="killer">${kName}</span> [${weapon?.name || '击杀'}] <span class="victim">${vName}</span>`;
    this.el.killFeed.appendChild(div);
    setTimeout(() => div.remove(), 5000);
    // 限制条数
    while (this.el.killFeed.children.length > 5) this.el.killFeed.firstChild.remove();
  }

  showToast(text, duration = 2) {
    this.el.centerToast.textContent = text;
    this.el.centerToast.classList.remove('hidden');
    this._toastTimer = duration;
  }
  hideToast() { this.el.centerToast.classList.add('hidden'); }

  showSquadOrder(text) {
    this.el.squadOrder.textContent = text;
    this.el.squadOrder.classList.remove('hidden');
    clearTimeout(this._squadTimer);
    this._squadTimer = setTimeout(() => this.el.squadOrder.classList.add('hidden'), 2500);
  }

  showDeath(killer) {
    this.el.deathScreen.classList.remove('hidden');
    this.el.killedBy.textContent = killer ? `被 ${FACTIONS[killer.team]?.name || '敌人'} 击杀` : '阵亡';
  }
  hideDeath() { this.el.deathScreen.classList.add('hidden'); }

  showPause() { this.el.pauseMenu.classList.remove('hidden'); }
  hidePause() { this.el.pauseMenu.classList.add('hidden'); }

  setFPS(fps) { this.el.fps.textContent = Math.round(fps) + ' FPS'; }

  update(dt) {
    if (this._hitMarkerTimer > 0) {
      this._hitMarkerTimer -= dt;
      if (this._hitMarkerTimer <= 0) this.el.hitMarker.classList.add('hidden');
    }
    if (this._toastTimer > 0) {
      this._toastTimer -= dt;
      if (this._toastTimer <= 0) this.hideToast();
    }
  }

  // 小地图绘制
  drawMinimap(player, soldiers, objectives, world) {
    const ctx = this.minimapCtx;
    const W = 200, H = 200;
    ctx.clearRect(0, 0, W, H);
    // 背景
    ctx.fillStyle = 'rgba(20,25,20,0.6)';
    ctx.fillRect(0, 0, W, H);
    // 地图范围 -90..90 -> 0..200
    const scale = 200 / 180;
    const toMap = (x, z) => [ (x + 90) * scale, (z + 90) * scale ];

    // 据点
    for (const obj of objectives) {
      const [mx, my] = toMap(obj.position[0], obj.position[2]);
      ctx.beginPath(); ctx.arc(mx, my, 5, 0, Math.PI*2);
      ctx.fillStyle = obj.holder === player.team ? '#c0392b' : (obj.holder ? '#3074d8' : '#c9a96a');
      ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
    }
    // 士兵
    for (const s of soldiers) {
      if (!s.alive) continue;
      const [mx, my] = toMap(s.position.x, s.position.z);
      ctx.beginPath(); ctx.arc(mx, my, 3, 0, Math.PI*2);
      ctx.fillStyle = s.team === player.team ? '#6bff6b' : '#ff5050';
      ctx.fill();
    }
    // 玩家(中心箭头)
    const [px, py] = toMap(player.position.x, player.position.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-player.yaw);
    ctx.beginPath();
    ctx.moveTo(0, -6); ctx.lineTo(4, 5); ctx.lineTo(0, 2); ctx.lineTo(-4, 5); ctx.closePath();
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
    // 视野扇形
    ctx.save();
    ctx.translate(px, py); ctx.rotate(-player.yaw);
    ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0, 0, 30, -Math.PI/2 - 0.6, -Math.PI/2 + 0.6); ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill();
    ctx.restore();

    // 边框
    ctx.strokeStyle = 'rgba(201,169,106,0.5)'; ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, 198, 198);
  }
}
