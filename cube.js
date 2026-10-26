/**
 * -------------------------------------------------------------
 * GAN 356 CUBE 3D — Премиальный движок со стрелочным управлением
 * Желтый цвет СВЕРХУ, Белый цвет СНИЗУ
 * Интерактивные стрелки направления на каждой грани
 * -------------------------------------------------------------
 */

(function () {
  'use strict';

  // --- Sound Synthesizer (GAN Magnetic Snap) ---
  class SoundFX {
    constructor() {
      this.ctx = null;
      this.enabled = true;
    }

    init() {
      if (!this.ctx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
          this.ctx = new AudioContext();
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    }

    playClick() {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      // Snappy magnetic click
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(200, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.04);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.05);
    }

    playVictory() {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;

      const notes = [587.33, 739.99, 880.00, 1174.66]; // D5, F#5, A5, D6
      const start = this.ctx.currentTime;

      notes.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const noteStart = start + idx * 0.11;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, noteStart);

        gain.gain.setValueAtTime(0, noteStart);
        gain.gain.linearRampToValueAtTime(0.28, noteStart + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.32);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(noteStart);
        osc.stop(noteStart + 0.35);
      });
    }
  }

  // --- Official GAN Speedcube Color Palette ---
  // Requested: YELLOW ON TOP (+Y), WHITE ON BOTTOM (-Y)
  const GAN_COLORS = {
    U: 0xffe600, // Top: Vibrant GAN Lemon Yellow
    D: 0xffffff, // Bottom: Pure GAN White
    F: 0x00d053, // Front: GAN Electric Green
    B: 0x0066ff, // Back: GAN Royal Cobalt Blue
    R: 0xff2638, // Right: GAN Flame Red
    L: 0xff7500, // Left: GAN Vivid Orange
    body: 0x111318 // GAN Primary frosted black core
  };

  // --- GAN Center Logo Canvas Texture ---
  function createGanLogoTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Yellow background
    ctx.fillStyle = '#FFE600';
    ctx.fillRect(0, 0, 256, 256);

    // Subtle carbon/matte pattern
    ctx.fillStyle = 'rgba(0, 0, 0, 0.03)';
    for (let i = 0; i < 256; i += 8) {
      ctx.fillRect(i, 0, 4, 256);
    }

    // Stylized GAN emblem
    ctx.fillStyle = '#0f172a';
    ctx.font = '900 68px "Arial Black", -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GAN', 128, 108);

    // Blue accent line & edition text
    ctx.fillStyle = '#0066FF';
    ctx.fillRect(58, 142, 140, 4);

    ctx.font = 'bold 20px -apple-system, sans-serif';
    ctx.fillText('356 M PRO', 128, 168);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    return texture;
  }

  // --- Procedural Glowing Direction Arrow Texture ---
  function createDirectionArrowTexture(symbol, label, color = '#ffe600') {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, 128, 128);

    // Glowing badge circle
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;

    ctx.beginPath();
    ctx.arc(64, 64, 50, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(11, 17, 30, 0.94)';
    ctx.fill();

    ctx.lineWidth = 4;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.restore();

    // Arrow symbol
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 52px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(symbol, 64, 58);

    // Sub-label
    if (label) {
      ctx.fillStyle = color;
      ctx.font = 'bold 15px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(label, 64, 98);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    return texture;
  }

  // --- Beveled Rounded Tile Geometry ---
  function createRoundedTileGeo(size, radius, thickness) {
    const shape = new THREE.Shape();
    const s = size / 2;
    const r = radius;

    shape.moveTo(-s + r, -s);
    shape.lineTo(s - r, -s);
    shape.quadraticCurveTo(s, -s, s, -s + r);
    shape.lineTo(s, s - r);
    shape.quadraticCurveTo(s, s, s - r, s);
    shape.lineTo(-s + r, s);
    shape.quadraticCurveTo(-s, s, -s, s - r);
    shape.lineTo(-s, -s + r);
    shape.quadraticCurveTo(-s, -s, -s + r, -s);

    const extrudeSettings = {
      depth: thickness,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.02,
      bevelThickness: 0.02
    };

    const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geo.center();
    return geo;
  }

  // --- Main Rubik Engine & App State ---
  class RubiksCubeApp {
    constructor() {
      this.sound = new SoundFX();
      this.colors = GAN_COLORS;
      this.ganLogoTex = createGanLogoTexture();

      this.currentSize = 3;
      this.cubies = [];
      this.isAnimating = false;
      this.animationSpeed = 160; // GAN fast snappy turn
      this.moveHistory = [];
      this.isScrambling = false;
      this.isAutoSolving = false;

      // Timer state
      this.timerRunning = false;
      this.timerStartTime = 0;
      this.timerElapsed = 0;
      this.timerInterval = null;
      this.moveCount = 0;

      // Camera tweening
      this.targetCameraPos = null;
      this.isTransitioningCamera = false;

      // Dynamic On-Hover Arrows System
      this.arrowMeshes = [];
      this.activeHoveredArrow = null;
      this.highlightedCubies = [];
      this.currentHoveredFace = null;
      this.currentHoveredGrid = null;

      // Pointer drag tracking for 360 rotation
      this.pointerDownPos = new THREE.Vector2();
      this.isPointerDown = false;
      this.dragThresholdPassed = false;

      this.initThree();
      this.bindUI();
      this.buildPuzzle(this.currentSize);
      this.animate();
    }

    // --- Three.js Scene Setup ---
    initThree() {
      const container = document.getElementById('canvas-container');
      const canvas = document.getElementById('cubeCanvas');

      this.scene = new THREE.Scene();

      this.camera = new THREE.PerspectiveCamera(
        40,
        container.clientWidth / container.clientHeight,
        0.1,
        1000
      );
      this.setDefaultCamera();

      this.renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance'
      });
      this.renderer.setSize(container.clientWidth, container.clientHeight);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.shadowMap.enabled = true;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.05;

      // OrbitControls for unrestricted 360-degree rotation
      this.controls = new THREE.OrbitControls(this.camera, canvas);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.07;
      this.controls.rotateSpeed = 0.9;
      this.controls.enablePan = false;
      this.controls.minDistance = 3.5;
      this.controls.maxDistance = 30;
      this.controls.minPolarAngle = 0.01;
      this.controls.maxPolarAngle = Math.PI - 0.01;

      // Luxury Studio Lighting Setup
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.82);
      this.scene.add(ambientLight);

      // Key light from top right
      const keyLight = new THREE.DirectionalLight(0xffffff, 0.85);
      keyLight.position.set(16, 26, 20);
      this.scene.add(keyLight);

      // Fill light from bottom left
      const fillLight = new THREE.DirectionalLight(0xfff5e6, 0.45);
      fillLight.position.set(-20, -12, -15);
      this.scene.add(fillLight);

      // Rim light for edge gloss
      const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.4);
      rimLight.position.set(0, -20, 20);
      this.scene.add(rimLight);

      // Floor Shadow Plane
      const shadowGeo = new THREE.PlaneGeometry(12, 12);
      const shadowCanvas = document.createElement('canvas');
      shadowCanvas.width = 128;
      shadowCanvas.height = 128;
      const sCtx = shadowCanvas.getContext('2d');
      const grad = sCtx.createRadialGradient(64, 64, 10, 64, 64, 64);
      grad.addColorStop(0, 'rgba(0, 0, 0, 0.45)');
      grad.addColorStop(0.5, 'rgba(0, 0, 0, 0.2)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      sCtx.fillStyle = grad;
      sCtx.fillRect(0, 0, 128, 128);

      const shadowTex = new THREE.CanvasTexture(shadowCanvas);
      const shadowMat = new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        depthWrite: false
      });
      this.floorShadow = new THREE.Mesh(shadowGeo, shadowMat);
      this.floorShadow.rotation.x = -Math.PI / 2;
      this.floorShadow.position.y = -3.2;
      this.scene.add(this.floorShadow);

      // Groups
      this.cubeGroup = new THREE.Group();
      this.scene.add(this.cubeGroup);

      this.pivotGroup = new THREE.Group();
      this.scene.add(this.pivotGroup);

      // Dynamic arrows group
      this.arrowGroup = new THREE.Group();
      this.scene.add(this.arrowGroup);

      this.raycaster = new THREE.Raycaster();
      this.mouse = new THREE.Vector2();

      window.addEventListener('resize', () => this.onWindowResize());
    }

    setDefaultCamera() {
      const dist = this.currentSize === 'pyraminx' ? 9.5 : (this.currentSize * 2.3 + 3.2);
      this.camera.position.set(dist * 0.9, dist * 0.8, dist * 1.2);
      this.camera.lookAt(0, 0, 0);
      if (this.controls) {
        this.controls.target.set(0, 0, 0);
        this.controls.update();
      }
    }

    setCameraView(viewName) {
      const dist = this.currentSize === 'pyraminx' ? 9.5 : (this.currentSize * 2.3 + 3.2);
      let target = new THREE.Vector3();

      switch (viewName) {
        case 'top': target.set(0, dist * 1.4, 0.001); this.selectFace('+y'); break; // Yellow
        case 'bottom': target.set(0, -dist * 1.4, 0.001); this.selectFace('-y'); break; // White
        case 'front': target.set(0, 0, dist * 1.4); this.selectFace('+z'); break; // Green
        case 'back': target.set(0, 0, -dist * 1.4); this.selectFace('-z'); break; // Blue
        case 'right': target.set(dist * 1.4, 0, 0); this.selectFace('+x'); break; // Red
        case 'left': target.set(-dist * 1.4, 0, 0); this.selectFace('-x'); break; // Orange
        case 'iso':
        default:
          target.set(dist * 0.9, dist * 0.8, dist * 1.2);
          this.selectFace('+z');
          break;
      }

      this.targetCameraPos = target;
      this.isTransitioningCamera = true;
    }

    onWindowResize() {
      const container = document.getElementById('canvas-container');
      if (!container) return;
      this.camera.aspect = container.clientWidth / container.clientHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(container.clientWidth, container.clientHeight);
    }

    // --- Build Puzzle Geometry ---
    buildPuzzle(size) {
      this.currentSize = size;
      this.moveHistory = [];
      this.isAutoSolving = false;
      this.isScrambling = false;
      this.updateMoveCounter(0);
      this.hideScrambleDisplay();
      this.clearArrows();

      while (this.cubeGroup.children.length > 0) {
        const obj = this.cubeGroup.children[0];
        this.cubeGroup.remove(obj);
        if (obj.geometry) obj.geometry.dispose();
      }
      this.cubies = [];

      document.getElementById('cubeSizeBadge').innerText =
        size === 'pyraminx' ? 'GAN Pyraminx' : `GAN ${size}x${size}x${size}`;

      if (size === 'pyraminx') {
        this.buildPyraminx();
      } else {
        this.buildNxNCube(parseInt(size, 10));
      }

      // Adjust shadow position for size
      const N = parseInt(size, 10) || 3;
      this.floorShadow.position.y = -(N * 0.6 + 1.2);

      this.setDefaultCamera();
      this.selectFace('+z');
    }

    // --- Build N x N x N Cube (GAN Beveled Tile Edition) ---
    buildNxNCube(N) {
      const cubieSize = 0.96;
      const spacing = 1.0;
      const offset = (N - 1) / 2;

      // GAN frosted black plastic body
      const bodyMat = new THREE.MeshStandardMaterial({
        color: this.colors.body,
        roughness: 0.28,
        metalness: 0.12
      });

      const boxGeo = new THREE.BoxGeometry(cubieSize, cubieSize, cubieSize);
      const tileGeo = createRoundedTileGeo(0.88, 0.08, 0.03);

      for (let ix = 0; ix < N; ix++) {
        for (let iy = 0; iy < N; iy++) {
          for (let iz = 0; iz < N; iz++) {
            const isExterior =
              ix === 0 || ix === N - 1 ||
              iy === 0 || iy === N - 1 ||
              iz === 0 || iz === N - 1;

            if (!isExterior) continue;

            const x = (ix - offset) * spacing;
            const y = (iy - offset) * spacing;
            const z = (iz - offset) * spacing;

            const cubieMesh = new THREE.Mesh(boxGeo, bodyMat.clone());
            cubieMesh.position.set(x, y, z);

            // Add beveled rounded tiles with GAN colors
            this.addTilesToCubie(cubieMesh, ix, iy, iz, N, cubieSize, tileGeo);

            cubieMesh.userData = {
              gridX: ix,
              gridY: iy,
              gridZ: iz,
              initGridX: ix,
              initGridY: iy,
              initGridZ: iz,
              isCubie: true
            };

            this.cubeGroup.add(cubieMesh);
            this.cubies.push(cubieMesh);
          }
        }
      }
    }

    addTilesToCubie(cubie, ix, iy, iz, N, size, tileGeo) {
      const tileOffset = size / 2 + 0.02;

      // YELLOW IS TOP (+Y), WHITE IS BOTTOM (-Y)
      const faces = [
        { dir: '+y', cond: iy === N - 1, color: this.colors.U, isCenter: (ix === 1 && iz === 1 && N === 3), rot: [-Math.PI / 2, 0, 0], pos: [0, tileOffset, 0] },
        { dir: '-y', cond: iy === 0,     color: this.colors.D, isCenter: false, rot: [Math.PI / 2, 0, 0], pos: [0, -tileOffset, 0] },
        { dir: '+z', cond: iz === N - 1, color: this.colors.F, isCenter: false, rot: [0, 0, 0], pos: [0, 0, tileOffset] },
        { dir: '-z', cond: iz === 0,     color: this.colors.B, isCenter: false, rot: [0, Math.PI, 0], pos: [0, 0, -tileOffset] },
        { dir: '+x', cond: ix === N - 1, color: this.colors.R, isCenter: false, rot: [0, Math.PI / 2, 0], pos: [tileOffset, 0, 0] },
        { dir: '-x', cond: ix === 0,     color: this.colors.L, isCenter: false, rot: [0, -Math.PI / 2, 0], pos: [-tileOffset, 0, 0] }
      ];

      faces.forEach((f) => {
        if (f.cond) {
          let mat;
          if (f.isCenter && f.dir === '+y') {
            // Apply GAN logo on top yellow center tile!
            mat = new THREE.MeshStandardMaterial({
              map: this.ganLogoTex,
              roughness: 0.22,
              metalness: 0.08
            });
          } else {
            mat = new THREE.MeshStandardMaterial({
              color: f.color,
              roughness: 0.22,
              metalness: 0.08
            });
          }

          const tile = new THREE.Mesh(tileGeo, mat);
          tile.position.set(...f.pos);
          tile.rotation.set(...f.rot);
          tile.userData = { isSticker: true, faceDir: f.dir, initColor: f.color };
          cubie.add(tile);
        }
      });
    }

    // --- Build Pyraminx ---
    buildPyraminx() {
      const colors = [this.colors.U, this.colors.F, this.colors.R, this.colors.B];
      const scale = 3.2;

      const tetraGeo = new THREE.TetrahedronGeometry(scale, 0);
      const tetraMat = new THREE.MeshStandardMaterial({
        color: this.colors.body,
        roughness: 0.35
      });

      const baseTetra = new THREE.Mesh(tetraGeo, tetraMat);
      baseTetra.position.set(0, 0, 0);

      const positions = tetraGeo.attributes.position.array;
      for (let i = 0; i < 4; i++) {
        const triGeo = new THREE.BufferGeometry();
        const v = [];
        for (let j = 0; j < 3; j++) {
          const idx = (i * 3 + j) * 3;
          v.push(positions[idx] * 1.01, positions[idx + 1] * 1.01, positions[idx + 2] * 1.01);
        }
        triGeo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
        triGeo.computeVertexNormals();

        const triMat = new THREE.MeshStandardMaterial({
          color: colors[i],
          roughness: 0.22,
          metalness: 0.08,
          side: THREE.DoubleSide
        });
        const faceMesh = new THREE.Mesh(triGeo, triMat);
        baseTetra.add(faceMesh);
      }

      baseTetra.userData = { isPyraminx: true };
      this.cubeGroup.add(baseTetra);
      this.cubies.push(baseTetra);
    }

    // --- Persistent Face Selection & Directional Arrows ---
    clearArrows() {
      while (this.arrowGroup.children.length > 0) {
        const a = this.arrowGroup.children[0];
        this.arrowGroup.remove(a);
        if (a.material) a.material.dispose();
        if (a.geometry) a.geometry.dispose();
      }
      this.arrowMeshes = [];
    }

    getFaceName(faceDir) {
      switch (faceDir) {
        case '+y': return 'Желтая (Сверху)';
        case '-y': return 'Белая (Снизу)';
        case '+z': return 'Зеленая (Спереди)';
        case '-z': return 'Синяя (Сзади)';
        case '+x': return 'Красная (Справа)';
        case '-x': return 'Оранжевая (Слева)';
        default: return 'Грань';
      }
    }

    // Selects a face and creates persistent 4 directional arrows pinned to that face
    selectFace(faceDir, gx = null, gy = null, gz = null) {
      const N = parseInt(this.currentSize, 10);
      const mid = Math.floor(N / 2);

      if (gx === null || gy === null || gz === null) {
        // Default to center of that face
        if (faceDir === '+z') { gx = mid; gy = mid; gz = N - 1; }
        else if (faceDir === '-z') { gx = mid; gy = mid; gz = 0; }
        else if (faceDir === '+y') { gx = mid; gy = N - 1; gz = mid; }
        else if (faceDir === '-y') { gx = mid; gy = 0; gz = mid; }
        else if (faceDir === '+x') { gx = N - 1; gy = mid; gz = mid; }
        else if (faceDir === '-x') { gx = 0; gy = mid; gz = mid; }
      }

      const faceName = this.getFaceName(faceDir);
      this.selectedFace = { faceDir, name: faceName, gridX: gx, gridY: gy, gridZ: gz };

      // Update on-screen selection badge
      const badge = document.getElementById('selectionText');
      if (badge) {
        badge.innerHTML = `Выбрана грань: <b>${faceName}</b> • Нажимайте ⬆️ ⬇️ ⬅️ ➡️ на клавиатуре`;
      }

      this.renderSelectedFaceArrows();
    }

    renderSelectedFaceArrows() {
      this.clearArrows();
      if (!this.selectedFace) return;

      const N = parseInt(this.currentSize, 10);
      const offset = (N - 1) / 2;
      const spacing = 1.0;
      const faceDist = offset + 0.62;

      const { faceDir, gridX: gx, gridY: gy, gridZ: gz } = this.selectedFace;

      const cubiePos = {
        x: (gx - offset) * spacing,
        y: (gy - offset) * spacing,
        z: (gz - offset) * spacing
      };

      const arrowConfigs = [];
      const d = 0.54; // distance offset for arrows from selected piece

      if (faceDir === '+z') {
        // FRONT FACE (Green)
        arrowConfigs.push({
          pos: [cubiePos.x, cubiePos.y + d, faceDist],
          rot: [0, 0, 0], symbol: '⬆', label: 'Вверх',
          axis: 'x', layer: gx, dir: -1,
          desc: `Повернуть слой вверх (⬆️)`
        });
        arrowConfigs.push({
          pos: [cubiePos.x, cubiePos.y - d, faceDist],
          rot: [0, 0, 0], symbol: '⬇', label: 'Вниз',
          axis: 'x', layer: gx, dir: 1,
          desc: `Повернуть слой вниз (⬇️)`
        });
        arrowConfigs.push({
          pos: [cubiePos.x - d, cubiePos.y, faceDist],
          rot: [0, 0, 0], symbol: '⬅', label: 'Влево',
          axis: 'y', layer: gy, dir: -1,
          desc: `Повернуть слой влево (⬅️)`
        });
        arrowConfigs.push({
          pos: [cubiePos.x + d, cubiePos.y, faceDist],
          rot: [0, 0, 0], symbol: '➡', label: 'Вправо',
          axis: 'y', layer: gy, dir: 1,
          desc: `Повернуть слой вправо (➡️)`
        });
      } else if (faceDir === '+y') {
        // TOP FACE (Yellow)
        arrowConfigs.push({
          pos: [cubiePos.x, faceDist, cubiePos.z - d],
          rot: [-Math.PI / 2, 0, 0], symbol: '⬆', label: 'Вверх',
          axis: 'x', layer: gx, dir: -1,
          desc: `Повернуть слой вверх (⬆️)`
        });
        arrowConfigs.push({
          pos: [cubiePos.x, faceDist, cubiePos.z + d],
          rot: [-Math.PI / 2, 0, 0], symbol: '⬇', label: 'Вниз',
          axis: 'x', layer: gx, dir: 1,
          desc: `Повернуть слой вниз (⬇️)`
        });
        arrowConfigs.push({
          pos: [cubiePos.x - d, faceDist, cubiePos.z],
          rot: [-Math.PI / 2, 0, 0], symbol: '⬅', label: 'Влево',
          axis: 'z', layer: gz, dir: -1,
          desc: `Повернуть слой влево (⬅️)`
        });
        arrowConfigs.push({
          pos: [cubiePos.x + d, faceDist, cubiePos.z],
          rot: [-Math.PI / 2, 0, 0], symbol: '➡', label: 'Вправо',
          axis: 'z', layer: gz, dir: 1,
          desc: `Повернуть слой вправо (➡️)`
        });
      } else if (faceDir === '-y') {
        // BOTTOM FACE (White)
        arrowConfigs.push({
          pos: [cubiePos.x, -faceDist, cubiePos.z + d],
          rot: [Math.PI / 2, 0, 0], symbol: '⬆', label: 'Вверх',
          axis: 'x', layer: gx, dir: 1,
          desc: `Повернуть слой вверх (⬆️)`
        });
        arrowConfigs.push({
          pos: [cubiePos.x, -faceDist, cubiePos.z - d],
          rot: [Math.PI / 2, 0, 0], symbol: '⬇', label: 'Вниз',
          axis: 'x', layer: gx, dir: -1,
          desc: `Повернуть слой вниз (⬇️)`
        });
        arrowConfigs.push({
          pos: [cubiePos.x - d, -faceDist, cubiePos.z],
          rot: [Math.PI / 2, 0, 0], symbol: '⬅', label: 'Влево',
          axis: 'z', layer: gz, dir: 1,
          desc: `Повернуть слой влево (⬅️)`
        });
        arrowConfigs.push({
          pos: [cubiePos.x + d, -faceDist, cubiePos.z],
          rot: [Math.PI / 2, 0, 0], symbol: '➡', label: 'Вправо',
          axis: 'z', layer: gz, dir: -1,
          desc: `Повернуть слой вправо (➡️)`
        });
      } else if (faceDir === '+x') {
        // RIGHT FACE (Red)
        arrowConfigs.push({
          pos: [faceDist, cubiePos.y + d, cubiePos.z],
          rot: [0, Math.PI / 2, 0], symbol: '⬆', label: 'Вверх',
          axis: 'z', layer: gz, dir: 1,
          desc: `Повернуть слой вверх (⬆️)`
        });
        arrowConfigs.push({
          pos: [faceDist, cubiePos.y - d, cubiePos.z],
          rot: [0, Math.PI / 2, 0], symbol: '⬇', label: 'Вниз',
          axis: 'z', layer: gz, dir: -1,
          desc: `Повернуть слой вниз (⬇️)`
        });
        arrowConfigs.push({
          pos: [faceDist, cubiePos.y, cubiePos.z - d],
          rot: [0, Math.PI / 2, 0], symbol: '⬅', label: 'Влево',
          axis: 'y', layer: gy, dir: 1,
          desc: `Повернуть слой влево (⬅️)`
        });
        arrowConfigs.push({
          pos: [faceDist, cubiePos.y, cubiePos.z + d],
          rot: [0, Math.PI / 2, 0], symbol: '➡', label: 'Вправо',
          axis: 'y', layer: gy, dir: -1,
          desc: `Повернуть слой вправо (➡️)`
        });
      } else if (faceDir === '-x') {
        // LEFT FACE (Orange)
        arrowConfigs.push({
          pos: [-faceDist, cubiePos.y + d, cubiePos.z],
          rot: [0, -Math.PI / 2, 0], symbol: '⬆', label: 'Вверх',
          axis: 'z', layer: gz, dir: -1,
          desc: `Повернуть слой вверх (⬆️)`
        });
        arrowConfigs.push({
          pos: [-faceDist, cubiePos.y - d, cubiePos.z],
          rot: [0, -Math.PI / 2, 0], symbol: '⬇', label: 'Вниз',
          axis: 'z', layer: gz, dir: 1,
          desc: `Повернуть слой вниз (⬇️)`
        });
        arrowConfigs.push({
          pos: [-faceDist, cubiePos.y, cubiePos.z + d],
          rot: [0, -Math.PI / 2, 0], symbol: '⬅', label: 'Влево',
          axis: 'y', layer: gy, dir: -1,
          desc: `Повернуть слой влево (⬅️)`
        });
        arrowConfigs.push({
          pos: [-faceDist, cubiePos.y, cubiePos.z - d],
          rot: [0, -Math.PI / 2, 0], symbol: '➡', label: 'Вправо',
          axis: 'y', layer: gy, dir: 1,
          desc: `Повернуть слой вправо (➡️)`
        });
      } else if (faceDir === '-z') {
        // BACK FACE (Blue)
        arrowConfigs.push({
          pos: [cubiePos.x, cubiePos.y + d, -faceDist],
          rot: [0, Math.PI, 0], symbol: '⬆', label: 'Вверх',
          axis: 'x', layer: gx, dir: 1,
          desc: `Повернуть слой вверх (⬆️)`
        });
        arrowConfigs.push({
          pos: [cubiePos.x, cubiePos.y - d, -faceDist],
          rot: [0, Math.PI, 0], symbol: '⬇', label: 'Вниз',
          axis: 'x', layer: gx, dir: -1,
          desc: `Повернуть слой вниз (⬇️)`
        });
        arrowConfigs.push({
          pos: [cubiePos.x + d, cubiePos.y, -faceDist],
          rot: [0, Math.PI, 0], symbol: '⬅', label: 'Влево',
          axis: 'y', layer: gy, dir: -1,
          desc: `Повернуть слой влево (⬅️)`
        });
        arrowConfigs.push({
          pos: [cubiePos.x - d, cubiePos.y, -faceDist],
          rot: [0, Math.PI, 0], symbol: '➡', label: 'Вправо',
          axis: 'y', layer: gy, dir: 1,
          desc: `Повернуть слой вправо (➡️)`
        });
      }

      // Add Glowing Selection Frame around selected piece
      const frameGeo = new THREE.BufferGeometry();
      const hs = 0.47;
      const v = new Float32Array([
        -hs, -hs, 0,   hs, -hs, 0,
         hs, -hs, 0,   hs,  hs, 0,
         hs,  hs, 0,  -hs,  hs, 0,
        -hs,  hs, 0,  -hs, -hs, 0
      ]);
      frameGeo.setAttribute('position', new THREE.BufferAttribute(v, 3));
      const frameMat = new THREE.LineBasicMaterial({ color: 0xffe600, linewidth: 3 });
      const selFrame = new THREE.LineSegments(frameGeo, frameMat);

      // Position frame on the selected face
      if (faceDir === '+z') { selFrame.position.set(cubiePos.x, cubiePos.y, faceDist); }
      else if (faceDir === '-z') { selFrame.position.set(cubiePos.x, cubiePos.y, -faceDist); selFrame.rotation.y = Math.PI; }
      else if (faceDir === '+y') { selFrame.position.set(cubiePos.x, faceDist, cubiePos.z); selFrame.rotation.x = -Math.PI / 2; }
      else if (faceDir === '-y') { selFrame.position.set(cubiePos.x, -faceDist, cubiePos.z); selFrame.rotation.x = Math.PI / 2; }
      else if (faceDir === '+x') { selFrame.position.set(faceDist, cubiePos.y, cubiePos.z); selFrame.rotation.y = Math.PI / 2; }
      else if (faceDir === '-x') { selFrame.position.set(-faceDist, cubiePos.y, cubiePos.z); selFrame.rotation.y = -Math.PI / 2; }

      this.arrowGroup.add(selFrame);

      const planeGeo = new THREE.PlaneGeometry(0.48, 0.48);

      arrowConfigs.forEach((cfg) => {
        const tex = createDirectionArrowTexture(cfg.symbol, cfg.label, '#ffe600');
        const mat = new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          side: THREE.DoubleSide,
          depthTest: true
        });

        const mesh = new THREE.Mesh(planeGeo, mat);
        mesh.position.set(...cfg.pos);
        mesh.rotation.set(...cfg.rot);

        mesh.userData = {
          isArrow: true,
          symbol: cfg.symbol,
          axis: cfg.axis,
          layer: cfg.layer,
          dir: cfg.dir,
          desc: cfg.desc
        };

        this.arrowGroup.add(mesh);
        this.arrowMeshes.push(mesh);
      });
    }

    // --- Slice Rotations (High Speed GAN Physics) ---
    rotateSlice(axis, layer, direction, customDuration = null, onComplete = null) {
      if (this.currentSize === 'pyraminx') {
        this.rotatePyraminx(direction, onComplete);
        return;
      }

      const N = parseInt(this.currentSize, 10);
      const spacing = 1.0;
      const offset = (N - 1) / 2;

      const movingCubies = this.cubies.filter((c) => {
        if (axis === 'x') return c.userData.gridX === layer;
        if (axis === 'y') return c.userData.gridY === layer;
        if (axis === 'z') return c.userData.gridZ === layer;
        return false;
      });

      if (movingCubies.length === 0) {
        if (onComplete) onComplete();
        return;
      }

      this.isAnimating = true;

      this.pivotGroup.position.set(0, 0, 0);
      this.pivotGroup.rotation.set(0, 0, 0);
      this.pivotGroup.updateMatrixWorld();

      movingCubies.forEach((c) => {
        this.pivotGroup.attach(c);
      });

      const duration = customDuration !== null ? customDuration : this.animationSpeed;
      const targetAngle = direction * (Math.PI / 2);

      if (duration === 0) {
        this.pivotGroup.rotation[axis] = targetAngle;
        this.finishRotation(movingCubies, axis, layer, direction, N, spacing, offset, onComplete);
      } else {
        const startTime = performance.now();
        const startAngle = 0;

        const step = (time) => {
          const elapsed = time - startTime;
          const progress = Math.min(elapsed / duration, 1.0);
          // Crisp GAN snappy easing
          const ease = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;

          this.pivotGroup.rotation[axis] = startAngle + targetAngle * ease;

          if (progress < 1.0) {
            requestAnimationFrame(step);
          } else {
            this.pivotGroup.rotation[axis] = targetAngle;
            this.finishRotation(movingCubies, axis, layer, direction, N, spacing, offset, onComplete);
          }
        };

        requestAnimationFrame(step);
      }
    }

    finishRotation(movingCubies, axis, layer, direction, N, spacing, offset, onComplete) {
      this.pivotGroup.updateMatrixWorld();

      movingCubies.forEach((c) => {
        this.cubeGroup.attach(c);

        const gx = c.userData.gridX - offset;
        const gy = c.userData.gridY - offset;
        const gz = c.userData.gridZ - offset;

        let nGx = gx;
        let nGy = gy;
        let nGz = gz;

        if (axis === 'x') {
          if (direction > 0) { nGy = -gz; nGz = gy; }
          else { nGy = gz; nGz = -gy; }
        } else if (axis === 'y') {
          if (direction > 0) { nGx = gz; nGz = -gx; }
          else { nGx = -gz; nGz = gx; }
        } else if (axis === 'z') {
          if (direction > 0) { nGx = -gy; nGy = gx; }
          else { nGx = gy; nGy = -gx; }
        }

        c.userData.gridX = Math.round(nGx + offset);
        c.userData.gridY = Math.round(nGy + offset);
        c.userData.gridZ = Math.round(nGz + offset);

        c.position.set(
          (c.userData.gridX - offset) * spacing,
          (c.userData.gridY - offset) * spacing,
          (c.userData.gridZ - offset) * spacing
        );
      });

      this.pivotGroup.rotation.set(0, 0, 0);
      this.isAnimating = false;

      this.sound.playClick();

      if (!this.isScrambling && !this.isAutoSolving) {
        this.renderSelectedFaceArrows();
        this.checkSolved();
      }

      if (onComplete) onComplete();
    }

    rotatePyraminx(direction, onComplete) {
      this.isAnimating = true;
      const duration = this.animationSpeed || 160;
      const targetAngle = direction * (Math.PI * 2 / 3);

      const startTime = performance.now();
      const tetra = this.cubies[0];
      const startRotY = tetra.rotation.y;

      const step = (time) => {
        const elapsed = time - startTime;
        const progress = Math.min(elapsed / duration, 1.0);
        const ease = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;

        tetra.rotation.y = startRotY + targetAngle * ease;

        if (progress < 1.0) {
          requestAnimationFrame(step);
        } else {
          tetra.rotation.y = startRotY + targetAngle;
          this.isAnimating = false;
          this.sound.playClick();
          if (onComplete) onComplete();
        }
      };

      requestAnimationFrame(step);
    }

    // --- Standard WCA Move Executor ---
    executeNotationMove(moveStr, recordToHistory = true, customDuration = null, onComplete = null) {
      if (this.currentSize === 'pyraminx') {
        const dir = moveStr.includes("'") ? -1 : 1;
        this.rotateSlice('y', 0, dir, customDuration, onComplete);
        return;
      }

      const N = parseInt(this.currentSize, 10);
      const isPrime = moveStr.includes("'");
      const isDouble = moveStr.includes("2");
      const base = moveStr.replace(/['2]/g, '');

      let axis = 'y';
      let layer = 0;
      let dir = 1;

      // Note: Yellow on Top (+Y), White on Bottom (-Y)
      switch (base) {
        case 'U': axis = 'y'; layer = N - 1; dir = -1; break; // Yellow
        case 'D': axis = 'y'; layer = 0;     dir = 1;  break; // White
        case 'R': axis = 'x'; layer = N - 1; dir = -1; break; // Red
        case 'L': axis = 'x'; layer = 0;     dir = 1;  break; // Orange
        case 'F': axis = 'z'; layer = N - 1; dir = -1; break; // Green
        case 'B': axis = 'z'; layer = 0;     dir = 1;  break; // Blue
        default: return;
      }

      if (isPrime) dir = -dir;

      if (recordToHistory) {
        this.moveHistory.push({ axis, layer, dir, moveStr });
        this.updateMoveCounter(this.moveHistory.length);
        if (!this.timerRunning && this.moveHistory.length === 1) {
          this.startTimer();
        }
      }

      const execSingle = (cb) => {
        this.rotateSlice(axis, layer, dir, customDuration, cb);
      };

      if (isDouble) {
        execSingle(() => {
          execSingle(onComplete);
        });
      } else {
        execSingle(onComplete);
      }
    }

    // --- Scramble ---
    scramble() {
      if (this.isAnimating || this.isScrambling || this.isAutoSolving) return;

      this.isScrambling = true;
      this.clearArrows();
      this.resetTimer();

      const N = parseInt(this.currentSize, 10);
      const moveCount = this.currentSize === 'pyraminx' ? 12 : (N === 2 ? 14 : (N === 3 ? 22 : (N === 4 ? 32 : 40)));
      const baseMoves = ['U', 'D', 'L', 'R', 'F', 'B'];
      const modifiers = ['', "'", '2'];

      const sequence = [];
      let lastBase = '';

      for (let i = 0; i < moveCount; i++) {
        let base = baseMoves[Math.floor(Math.random() * baseMoves.length)];
        while (base === lastBase) {
          base = baseMoves[Math.floor(Math.random() * baseMoves.length)];
        }
        lastBase = base;
        const mod = modifiers[Math.floor(Math.random() * modifiers.length)];
        sequence.push(base + mod);
      }

      this.showScrambleDisplay(sequence.join(' '));
      this.showToast('GAN перемешивание...');

      const scrambleSpeed = Math.min(this.animationSpeed, 75);
      let idx = 0;

      const runNextMove = () => {
        if (idx >= sequence.length) {
          this.isScrambling = false;
          this.showToast('Кубик разобран! Наведи на грань для стрелок.');
          return;
        }
        const move = sequence[idx++];
        this.executeNotationMove(move, true, scrambleSpeed, runNextMove);
      };

      runNextMove();
    }

    // --- Auto-Solve ---
    autoSolve() {
      if (this.isAnimating || this.isScrambling || this.isAutoSolving) return;
      if (this.moveHistory.length === 0) {
        this.showToast('Кубик уже собран!');
        return;
      }

      this.isAutoSolving = true;
      this.clearArrows();
      this.stopTimer();

      const totalMoves = this.moveHistory.length;
      this.showToast(`Авто-сборка GAN: 0 из ${totalMoves}`);

      const solveSpeed = Math.min(this.animationSpeed, 110);

      const runSolveStep = () => {
        if (this.moveHistory.length === 0) {
          this.isAutoSolving = false;
          this.showToast('GAN CUBE собран! 🏆');
          this.celebrateVictory();
          return;
        }

        const lastMove = this.moveHistory.pop();
        this.updateMoveCounter(this.moveHistory.length);

        const currentStep = totalMoves - this.moveHistory.length;
        this.showToast(`Сборка: ход ${currentStep} из ${totalMoves}`);

        this.rotateSlice(lastMove.axis, lastMove.layer, -lastMove.dir, solveSpeed, runSolveStep);
      };

      runSolveStep();
    }

    // --- Reset ---
    resetPuzzle() {
      this.buildPuzzle(this.currentSize);
      this.resetTimer();
      this.showToast('Кубик сброшен в исходное состояние');
    }

    // --- Undo Move ---
    undoLastMove() {
      if (this.isAnimating || this.isScrambling || this.isAutoSolving) return;
      if (this.moveHistory.length === 0) return;

      const lastMove = this.moveHistory.pop();
      this.updateMoveCounter(this.moveHistory.length);
      this.rotateSlice(lastMove.axis, lastMove.layer, -lastMove.dir, this.animationSpeed);
    }

    // --- Check Solved ---
    checkSolved() {
      if (this.currentSize === 'pyraminx') return;
      if (this.cubies.length === 0) return;

      let isSolved = true;

      for (let cubie of this.cubies) {
        for (let child of cubie.children) {
          if (child.userData && child.userData.isSticker) {
            const worldDir = new THREE.Vector3();
            child.getWorldDirection(worldDir);

            const expectedDir = child.userData.faceDir;
            let currentDir = '';

            if (Math.abs(worldDir.x) > 0.8) currentDir = worldDir.x > 0 ? '+x' : '-x';
            else if (Math.abs(worldDir.y) > 0.8) currentDir = worldDir.y > 0 ? '+y' : '-y';
            else if (Math.abs(worldDir.z) > 0.8) currentDir = worldDir.z > 0 ? '+z' : '-z';

            if (currentDir !== expectedDir) {
              isSolved = false;
              break;
            }
          }
        }
        if (!isSolved) break;
      }

      if (isSolved && this.moveCount > 0) {
        this.stopTimer();
        this.celebrateVictory();
      }
    }

    // --- Victory ---
    celebrateVictory() {
      this.sound.playVictory();

      if (window.confetti) {
        window.confetti({ particleCount: 140, spread: 90, origin: { y: 0.6 } });
        setTimeout(() => {
          window.confetti({ particleCount: 90, angle: 60, spread: 60, origin: { x: 0 } });
          window.confetti({ particleCount: 90, angle: 120, spread: 60, origin: { x: 1 } });
        }, 250);
      }

      const modal = document.getElementById('victoryModal');
      document.getElementById('modalTime').innerText = document.getElementById('timerDigits').innerText;
      document.getElementById('modalMoves').innerText = this.moveCount;
      modal.style.display = 'flex';
    }

    // --- Timer ---
    startTimer() {
      if (this.timerRunning) return;
      this.timerRunning = true;
      this.timerStartTime = performance.now() - this.timerElapsed;
      const digits = document.getElementById('timerDigits');
      digits.classList.remove('ready');
      digits.classList.add('running');

      this.timerInterval = setInterval(() => {
        this.timerElapsed = performance.now() - this.timerStartTime;
        digits.innerText = this.formatTime(this.timerElapsed);
      }, 30);
    }

    stopTimer() {
      if (!this.timerRunning) return;
      this.timerRunning = false;
      clearInterval(this.timerInterval);
      const digits = document.getElementById('timerDigits');
      digits.classList.remove('running');

      const best = localStorage.getItem('gan_best_time');
      if (!best || this.timerElapsed < parseFloat(best)) {
        localStorage.setItem('gan_best_time', this.timerElapsed);
        document.getElementById('bestTime').innerText = this.formatTime(this.timerElapsed);
      }
    }

    resetTimer() {
      this.stopTimer();
      this.timerElapsed = 0;
      document.getElementById('timerDigits').innerText = '00:00.00';
      this.updateMoveCounter(0);
    }

    formatTime(ms) {
      const totalSec = Math.floor(ms / 1000);
      const minutes = Math.floor(totalSec / 60);
      const seconds = totalSec % 60;
      const hundredths = Math.floor((ms % 1000) / 10);
      return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
    }

    updateMoveCounter(count) {
      this.moveCount = count;
      document.getElementById('moveCount').innerText = count;
    }

    // --- UI Toasts ---
    showToast(message) {
      const toast = document.getElementById('statusToast');
      toast.innerText = message;
      toast.classList.add('show');
      clearTimeout(this.toastTimeout);
      this.toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
      }, 2500);
    }

    showScrambleDisplay(formula) {
      const box = document.getElementById('scrambleDisplay');
      document.getElementById('scrambleFormula').innerText = formula;
      box.style.display = 'flex';
    }

    hideScrambleDisplay() {
      const box = document.getElementById('scrambleDisplay');
      box.style.display = 'none';
    }

    // --- Slice Highlight on Arrow Hover ---
    highlightSlice(axis, layer) {
      this.clearHighlightSlice();
      this.cubies.forEach((c) => {
        let match = false;
        if (axis === 'x' && c.userData.gridX === layer) match = true;
        if (axis === 'y' && c.userData.gridY === layer) match = true;
        if (axis === 'z' && c.userData.gridZ === layer) match = true;

        if (match) {
          c.children.forEach((child) => {
            if (child.material && child.material.emissive) {
              child.material.emissive.setHex(0xffe600);
              child.material.emissiveIntensity = 0.38;
            }
          });
          this.highlightedCubies.push(c);
        }
      });
    }

    clearHighlightSlice() {
      this.highlightedCubies.forEach((c) => {
        c.children.forEach((child) => {
          if (child.material && child.material.emissive) {
            child.material.emissive.setHex(0x000000);
            child.material.emissiveIntensity = 0;
          }
        });
      });
      this.highlightedCubies = [];
    }

    // --- Interactive Mouse Raycasting & Dynamic Arrow Display ---
    setupInteraction() {
      const canvas = document.getElementById('cubeCanvas');
      const tooltip = document.getElementById('arrowTooltip');
      const tooltipText = document.getElementById('arrowTooltipText');

      canvas.addEventListener('pointerdown', (e) => {
        this.isPointerDown = true;
        this.dragThresholdPassed = false;
        this.pointerDownPos.set(e.clientX, e.clientY);
      });

      canvas.addEventListener('pointermove', (e) => {
        const rect = canvas.getBoundingClientRect();
        this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        if (this.isPointerDown) {
          const dist = Math.hypot(e.clientX - this.pointerDownPos.x, e.clientY - this.pointerDownPos.y);
          if (dist > 6) {
            this.dragThresholdPassed = true;
            tooltip.style.display = 'none';
            this.clearHighlightSlice();
            return;
          }
        }

        if (this.isAnimating) return;

        // 1. Raycast against existing 3D arrows
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const arrowHits = this.raycaster.intersectObjects(this.arrowMeshes);

        if (arrowHits.length > 0) {
          const hitArrow = arrowHits[0].object;
          canvas.style.cursor = 'pointer';

          if (this.activeHoveredArrow !== hitArrow) {
            if (this.activeHoveredArrow) {
              this.activeHoveredArrow.scale.set(1, 1, 1);
            }
            this.activeHoveredArrow = hitArrow;
            hitArrow.scale.set(1.25, 1.25, 1.25);
            this.highlightSlice(hitArrow.userData.axis, hitArrow.userData.layer);
          }

          tooltipText.innerText = hitArrow.userData.desc;
          tooltip.style.left = `${e.clientX}px`;
          tooltip.style.top = `${e.clientY}px`;
          tooltip.style.display = 'block';
          return;
        }

        // Reset arrow scale if not hovering an arrow
        if (this.activeHoveredArrow) {
          this.activeHoveredArrow.scale.set(1, 1, 1);
          this.activeHoveredArrow = null;
          this.clearHighlightSlice();
          tooltip.style.display = 'none';
        }

        // Raycast against the cube face to update hover cursor
        const cubeHits = this.raycaster.intersectObjects(this.cubeGroup.children, true);
        if (cubeHits.length > 0) {
          canvas.style.cursor = 'pointer';
        } else {
          canvas.style.cursor = 'grab';
          tooltip.style.display = 'none';
        }
      });

      canvas.addEventListener('pointerup', () => {
        this.isPointerDown = false;

        if (!this.dragThresholdPassed) {
          this.raycaster.setFromCamera(this.mouse, this.camera);

          // 1. Check if user clicked directly on one of the arrows:
          const arrowHits = this.raycaster.intersectObjects(this.arrowMeshes);
          if (arrowHits.length > 0) {
            const hitArrow = arrowHits[0].object;
            const data = hitArrow.userData;
            this.executeArrowMove(data);
            return;
          }

          // 2. Check if user clicked on a cubie: SELECT THAT FACE!
          const cubeHits = this.raycaster.intersectObjects(this.cubeGroup.children, true);
          if (cubeHits.length > 0) {
            const hit = cubeHits[0];
            let cubie = hit.object;
            while (cubie && !cubie.userData.isCubie && cubie.parent) {
              cubie = cubie.parent;
            }

            if (cubie && cubie.userData.isCubie && hit.face) {
              const worldNorm = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
              let faceDir = '+z';
              if (Math.abs(worldNorm.x) > 0.8) faceDir = worldNorm.x > 0 ? '+x' : '-x';
              else if (Math.abs(worldNorm.y) > 0.8) faceDir = worldNorm.y > 0 ? '+y' : '-y';
              else if (Math.abs(worldNorm.z) > 0.8) faceDir = worldNorm.z > 0 ? '+z' : '-z';

              this.selectFace(faceDir, cubie.userData.gridX, cubie.userData.gridY, cubie.userData.gridZ);
              this.sound.playClick();
              this.showToast(`Выбрана: ${this.selectedFace.name}`);
            }
          }
        }
      });
    }

    executeArrowMove(data) {
      this.moveHistory.push({
        axis: data.axis,
        layer: data.layer,
        dir: data.dir,
        moveStr: data.symbol || 'ARROW'
      });
      this.updateMoveCounter(this.moveHistory.length);

      if (!this.timerRunning && this.moveHistory.length === 1) {
        this.startTimer();
      }

      this.rotateSlice(data.axis, data.layer, data.dir, this.animationSpeed);
      const tooltip = document.getElementById('arrowTooltip');
      if (tooltip) tooltip.style.display = 'none';
    }

    // --- Keyboard Arrow Keys Handler: Rotates Selected Face in Key Direction! ---
    handleArrowKeyPress(key) {
      if (this.isAnimating) return;

      // Make sure a face is selected
      if (!this.selectedFace) {
        this.selectFace('+z');
      }

      let targetSymbol = '';
      if (key === 'ArrowUp') targetSymbol = '⬆';
      else if (key === 'ArrowDown') targetSymbol = '⬇';
      else if (key === 'ArrowLeft') targetSymbol = '⬅';
      else if (key === 'ArrowRight') targetSymbol = '➡';

      // Always execute for the SELECTED face's arrow!
      const match = this.arrowMeshes.find((a) => a.userData.symbol === targetSymbol);
      if (match) {
        // Visual pulse effect on the arrow
        match.scale.set(1.45, 1.45, 1.45);
        setTimeout(() => {
          if (match) match.scale.set(1, 1, 1);
        }, 180);

        const data = match.userData;
        this.executeArrowMove(data);
        this.showToast(`${targetSymbol} ${data.desc}`);
      }
    }

    // --- UI Bindings ---
    bindUI() {
      this.setupInteraction();

      // Puzzle type buttons
      document.querySelectorAll('.type-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.type-btn').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          const type = btn.getAttribute('data-type');
          this.buildPuzzle(type);
        });
      });

      // 360 Viewpoint buttons
      document.querySelectorAll('.cam-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.cam-btn').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          const view = btn.getAttribute('data-cam');
          this.setCameraView(view);
        });
      });

      // Primary buttons
      document.getElementById('scrambleBtn').addEventListener('click', () => this.scramble());
      document.getElementById('solveBtn').addEventListener('click', () => this.autoSolve());
      document.getElementById('resetBtn').addEventListener('click', () => this.resetPuzzle());

      // Virtual Notation buttons
      document.querySelectorAll('.turn-btn[data-move]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const move = btn.getAttribute('data-move');
          this.executeNotationMove(move, true);
        });
      });

      // Undo button
      document.getElementById('undoMoveBtn').addEventListener('click', () => this.undoLastMove());

      // Speed selector
      const speedSelect = document.getElementById('speedSelect');
      speedSelect.addEventListener('change', (e) => {
        this.animationSpeed = parseInt(e.target.value, 10);
      });

      // Sound toggle
      const soundBtn = document.getElementById('soundToggleBtn');
      soundBtn.addEventListener('click', () => {
        this.sound.enabled = !this.sound.enabled;
        soundBtn.innerText = this.sound.enabled ? '🔊' : '🔇';
        this.showToast(this.sound.enabled ? 'Звук GAN включен' : 'Звук выключен');
      });

      // Reset camera
      document.getElementById('resetCameraBtn').addEventListener('click', () => {
        this.setDefaultCamera();
      });

      // Toggle notation controls
      const toggleControlsBtn = document.getElementById('toggleControlsBtn');
      toggleControlsBtn.addEventListener('click', () => {
        const vControls = document.getElementById('virtualControls');
        vControls.classList.toggle('collapsed');
      });

      // Timer Controls
      document.getElementById('timerToggleBtn').addEventListener('click', () => {
        if (this.timerRunning) this.stopTimer();
        else this.startTimer();
      });
      document.getElementById('timerResetBtn').addEventListener('click', () => this.resetTimer());

      // Help Modal
      const helpModal = document.getElementById('helpModal');
      document.getElementById('helpBtn').addEventListener('click', () => {
        helpModal.style.display = 'flex';
      });
      document.getElementById('helpCloseBtn').addEventListener('click', () => {
        helpModal.style.display = 'none';
      });
      document.getElementById('helpOkBtn').addEventListener('click', () => {
        helpModal.style.display = 'none';
      });

      // Victory Modal
      const victoryModal = document.getElementById('victoryModal');
      document.getElementById('modalCloseBtn').addEventListener('click', () => {
        victoryModal.style.display = 'none';
      });
      document.getElementById('modalScrambleBtn').addEventListener('click', () => {
        victoryModal.style.display = 'none';
        this.scramble();
      });

      // Load saved best time
      const savedBest = localStorage.getItem('gan_best_time');
      if (savedBest) {
        document.getElementById('bestTime').innerText = this.formatTime(parseFloat(savedBest));
      }

      // Keyboard Controls
      window.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

        // Keyboard Arrow Keys (⬆️ ⬇️ ⬅️ ➡️)
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
          e.preventDefault();
          this.handleArrowKeyPress(e.key);
          return;
        }

        if (e.code === 'Space') {
          e.preventDefault();
          if (this.timerRunning) this.stopTimer();
          else this.startTimer();
          return;
        }

        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
          e.preventDefault();
          this.undoLastMove();
          return;
        }

        const key = e.key.toUpperCase();
        if (['U', 'D', 'L', 'R', 'F', 'B'].includes(key)) {
          const move = e.shiftKey ? `${key}'` : key;
          this.executeNotationMove(move, true);
        }
      });
    }

    // --- Main Render Loop ---
    animate() {
      requestAnimationFrame(() => this.animate());

      if (this.isTransitioningCamera && this.targetCameraPos) {
        this.camera.position.lerp(this.targetCameraPos, 0.12);
        this.controls.target.set(0, 0, 0);
        if (this.camera.position.distanceTo(this.targetCameraPos) < 0.05) {
          this.camera.position.copy(this.targetCameraPos);
          this.isTransitioningCamera = false;
        }
      }

      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    window.app = new RubiksCubeApp();
  });
})();
