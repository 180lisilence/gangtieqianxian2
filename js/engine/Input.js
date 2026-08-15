// js/engine/Input.js
// 输入管理器：键盘 / 鼠标 / 指针锁定
// 提供帧查询接口：isDown(key), justPressed(key), mouseDelta, 等

export class Input {
  constructor(domElement) {
    this.dom = domElement;
    this.keys = new Set();          // 当前按下的键
    this.keysPressed = new Set();   // 本帧刚按下(下一帧清空)
    this.keysReleased = new Set();  // 本帧刚释放
    this.mouseButtons = [false, false, false];
    this.mousePressed = [false, false, false];
    this.mouseDelta = { x: 0, y: 0 };
    this.wheelDelta = 0;
    this.pointerLocked = false;
    this.mouseX = 0; this.mouseY = 0;

    this._bind();
  }

  _bind() {
    window.addEventListener('keydown', e => {
      // 防止某些键的默认行为
      if (['Tab','Space','ControlLeft','ShiftLeft','AltLeft'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.keysPressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', e => {
      this.keys.delete(e.code);
      this.keysReleased.add(e.code);
    });

    this.dom.addEventListener('mousedown', e => {
      if (e.button < 3) {
        if (!this.mouseButtons[e.button]) this.mousePressed[e.button] = true;
        this.mouseButtons[e.button] = true;
      }
    });
    window.addEventListener('mouseup', e => {
      if (e.button < 3) this.mouseButtons[e.button] = false;
    });
    window.addEventListener('mousemove', e => {
      this.mouseX = e.clientX; this.mouseY = e.clientY;
      if (this.pointerLocked) {
        this.mouseDelta.x += e.movementX || 0;
        this.mouseDelta.y += e.movementY || 0;
      }
    });
    window.addEventListener('wheel', e => {
      this.wheelDelta += Math.sign(e.deltaY);
    }, { passive: true });

    // 指针锁定
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = (document.pointerLockElement === this.dom);
    });
    document.addEventListener('pointerlockerror', () => { this.pointerLocked = false; });
  }

  requestPointerLock() {
    if (!this.pointerLocked) this.dom.requestPointerLock();
  }
  exitPointerLock() {
    if (this.pointerLocked) document.exitPointerLock();
  }

  isDown(code) { return this.keys.has(code); }
  justPressed(code) { return this.keysPressed.has(code); }
  justReleased(code) { return this.keysReleased.has(code); }

  // 数字键 1-9
  numberPressed() {
    for (let i = 1; i <= 9; i++) {
      if (this.justPressed('Digit' + i)) return i;
    }
    return 0;
  }

  // 每帧结束调用，清空一次性状态
  endFrame() {
    this.keysPressed.clear();
    this.keysReleased.clear();
    this.mousePressed = [false, false, false];
    this.mouseDelta.x = 0; this.mouseDelta.y = 0;
    this.wheelDelta = 0;
  }
}
