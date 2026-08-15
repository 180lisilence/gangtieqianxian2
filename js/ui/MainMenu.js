// js/ui/MainMenu.js
// 主菜单控制器: 数据驱动渲染战役/阵营/武器选项, 收集玩家选择

import { CAMPAIGN_LIST, CAMPAIGNS } from '../data/campaigns.js';
import { FACTION_LIST, FACTIONS } from '../data/factions.js';
import { WEAPONS } from '../data/weapons.js';

export class MainMenu {
  constructor() {
    this.el = {
      menu: document.getElementById('mainMenu'),
      campaignList: document.getElementById('campaignList'),
      factionList: document.getElementById('factionList'),
      primaryList: document.getElementById('primaryWeaponList'),
      secondaryList: document.getElementById('secondaryWeaponList'),
      grenadeList: document.getElementById('grenadeList'),
      quality: document.getElementById('qualitySelect'),
      motionBlur: document.getElementById('motionBlur'),
      bloom: document.getElementById('bloom'),
      shadows: document.getElementById('shadows'),
      startBtn: document.getElementById('startBtn'),
    };
    this.selection = {
      campaign: 'normandy',
      faction: 'us',
      primary: 'm1garand',
      secondary: 'm1911',
      grenade: 'mk2',
      quality: 'medium',
      bloom: true, shadows: true, motionBlur: false,
    };
    this._renderCampaigns();
    this._renderFactions();
    this._renderWeapons();
    this._bindSettings();
  }

  show() { this.el.menu.classList.remove('hidden'); }
  hide() { this.el.menu.classList.add('hidden'); }

  _renderCampaigns() {
    this.el.campaignList.innerHTML = '';
    CAMPAIGN_LIST.forEach(c => {
      const div = document.createElement('div');
      div.className = 'list-item' + (c.id === this.selection.campaign ? ' selected' : '');
      div.innerHTML = `<div class="item-name">${c.name}</div><div class="item-desc">${c.nameEn} · ${c.attacker.toUpperCase()} vs ${c.defender.toUpperCase()}</div>`;
      div.onclick = () => {
        this.selection.campaign = c.id;
        this._renderCampaigns();
        // 自动切到攻击方阵营
        this.selection.faction = c.attacker;
        this._renderFactions();
        this._renderWeapons();
      };
      this.el.campaignList.appendChild(div);
    });
  }

  _renderFactions() {
    this.el.factionList.innerHTML = '';
    const c = CAMPAIGNS[this.selection.campaign];
    // 可选: 攻击方或防守方
    [c.attacker, c.defender].forEach(fid => {
      const f = FACTIONS[fid];
      const div = document.createElement('div');
      div.className = 'list-item' + (fid === this.selection.faction ? ' selected' : '');
      div.innerHTML = `<div class="item-name">${f.name}</div><div class="item-desc">${f.nameEn} · ${f.description.slice(0,16)}...</div>`;
      div.onclick = () => { this.selection.faction = fid; this._renderFactions(); this._renderWeapons(); };
      this.el.factionList.appendChild(div);
    });
  }

  _renderWeapons() {
    const f = FACTIONS[this.selection.faction];
    // 主武器
    this.el.primaryList.innerHTML = '';
    f.weapons.primary.forEach(wid => {
      const w = WEAPONS[wid]; if (!w) return;
      const div = document.createElement('div');
      div.className = 'list-item' + (wid === this.selection.primary ? ' selected' : '');
      div.innerHTML = `<div class="item-name">${w.name}</div><div class="item-desc">${w.type.toUpperCase()} · DMG ${w.damage}</div>`;
      div.onclick = () => { this.selection.primary = wid; this._renderWeapons(); };
      this.el.primaryList.appendChild(div);
    });
    // 副武器
    this.el.secondaryList.innerHTML = '';
    f.weapons.secondary.forEach(wid => {
      const w = WEAPONS[wid]; if (!w) return;
      const div = document.createElement('div');
      div.className = 'list-item' + (wid === this.selection.secondary ? ' selected' : '');
      div.innerHTML = `<div class="item-name">${w.name}</div><div class="item-desc">${w.type.toUpperCase()} · DMG ${w.damage}</div>`;
      div.onclick = () => { this.selection.secondary = wid; this._renderWeapons(); };
      this.el.secondaryList.appendChild(div);
    });
    // 投掷物
    this.el.grenadeList.innerHTML = '';
    f.weapons.grenade.forEach(wid => {
      const w = WEAPONS[wid]; if (!w) return;
      const div = document.createElement('div');
      div.className = 'list-item' + (wid === this.selection.grenade ? ' selected' : '');
      div.innerHTML = `<div class="item-name">${w.name}</div><div class="item-desc">爆炸半径 ${w.radius}m</div>`;
      div.onclick = () => { this.selection.grenade = wid; this._renderWeapons(); };
      this.el.grenadeList.appendChild(div);
    });
    // 默认选第一个
    if (!f.weapons.primary.includes(this.selection.primary)) this.selection.primary = f.weapons.primary[0];
    if (!f.weapons.secondary.includes(this.selection.secondary)) this.selection.secondary = f.weapons.secondary[0];
    if (!f.weapons.grenade.includes(this.selection.grenade)) this.selection.grenade = f.weapons.grenade[0];
  }

  _bindSettings() {
    this.el.quality.onchange = () => { this.selection.quality = this.el.quality.value; };
    this.el.bloom.onchange = () => { this.selection.bloom = this.el.bloom.checked; };
    this.el.shadows.onchange = () => { this.selection.shadows = this.el.shadows.checked; };
    this.el.motionBlur.onchange = () => { this.selection.motionBlur = this.el.motionBlur.checked; };
  }

  getSelection() {
    this.selection.quality = this.el.quality.value;
    this.selection.bloom = this.el.bloom.checked;
    this.selection.shadows = this.el.shadows.checked;
    this.selection.motionBlur = this.el.motionBlur.checked;
    return { ...this.selection };
  }

  onStart(cb) { this.el.startBtn.onclick = cb; }
}
