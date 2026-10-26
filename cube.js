/**
 * -------------------------------------------------------------
 * КУБИК РУБИКА 3D — Полный обзор 360° и интерактивные стрелки
 * Поддержка 2x2, 3x3, 4x4, 5x5 и Пирамидки
 * -------------------------------------------------------------
 */

(function () {
  'use strict';

  // --- Web Audio API Sound Synthesizer ---
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
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(35, now + 0.05);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.06);
    }

    playVictory() {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;

      const notes = [523.25, 659.25, 783.99, 1046.5];
      const start = this.ctx.currentTime;

      notes.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const noteStart = start + idx * 0.12;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, noteStart);

        gain.gain.setValueAtTime(0, noteStart);
        gain.gain.linearRampToValueAtTime(0.25, noteStart + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.35);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(noteStart);
        osc.stop(noteStart + 0.36);
      });
    }
  }

  // --- Themes ---
  const THEMES = {
    classic: {
      U: 0xffffff, // White
      D: 0xffd500, // Yellow
      L: 0xff5800, // Orange
      R: 0xb71234, // Red
      F: 0x009b48, // Green
      B: 0x0046ad, // Blue
      body: 0x111116,
      bg: 0x0a0e17
    },
    neon: {
      U: 0xffffff,
      D: 0xfef08a,
      L: 0xff007f,
      R: 0x00f0ff,
      F: 0x00ff66,
      B: 0x7928ca,
      body: 0x050510,
      bg: 0x05050f
    },
    pastel: {
      U: 0xf8fafc,
      D: 0xfde047,
      L: 0xfba94c,
      R: 0xf87171,
      F: 0x86efac,
      B: 0x93c5fd,
      body: 0x1f1d2e,
      bg: 0x1e1b2e
    }
  };

  // --- Procedural 3D Arrow Texture Generator ---
  function createArrowTexture(symbol, label, color = '#38bdf8', bg = 'rgba(15, 23, 42, 0.92)') {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    // Glowing circle badge
    ctx.clearRect(0, 0, 128, 128);

    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;

    ctx.beginPath();
    ctx.arc(64, 64, 52, 0, Math.PI * 2);
    ctx.fillStyle = bg;
    ctx.fill();

    ctx.lineWidth = 4;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.restore();

    // Draw Symbol
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 50px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(symbol, 64, 58);

    // Draw Sub-label
    if (label) {
      ctx.fillStyle = color;
      ctx.font = 'bold 16px monospace';
      ctx.fillText(label, 64, 96);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    return texture;
  }

  // --- Main Rubik Engine & App State ---
  class RubiksCubeApp {
    constructor() {
      this.sound = new SoundFX();
      this.currentThemeName = 'classic';
      this.theme = THEMES[this.currentThemeName];

      this.currentSize = 3; // 2, 3, 4, 5, or 'pyraminx'
      this.cubies = [];
      this.isAnimating = false;
      this.animationSpeed = 200; // ms per turn
      this.moveHistory = [];
      this.isScrambling = false;
      this.isAutoSolving = false;
      this.showArrowsAlways = true;

      // Timer state
      this.timerRunning = false;
      this.timerStartTime = 0;
      this.timerElapsed = 0;
      this.timerInterval = null;
      this.moveCount = 0;

      // Camera tweening
      this.targetCameraPos = null;
      this.isTransitioningCamera = false;

      // Arrow meshes
      this.arrowMeshes = [];
      this.activeHoveredArrow = null;
      this.highlightedCubies = [];

      // Pointer tracking to differentiate click vs 360 drag
      this.pointerDownPos = new THREE.Vector2();
      this.isPointerDown = false;
      this.dragThresholdPassed = false;

      this.initThree();
      this.bindUI();
      this.buildPuzzle(this.currentSize);
      this.animate();
    }

    // --- Three.js Initialization ---
    initThree() {
      const container = document.getElementById('canvas-container');
      const canvas = document.getElementById('cubeCanvas');

      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(this.theme.bg);

      this.camera = new THREE.PerspectiveCamera(
        42,
        container.clientWidth / container.clientHeight,
        0.1,
        1000
      );
      this.setDefaultCamera();

      this.renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: true,
        powerPreference: 'high-performance'
      });
      this.renderer.setSize(container.clientWidth, container.clientHeight);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.shadowMap.enabled = true;

      // OrbitControls configured for UNRESTRICTED 360-degree rotation!
      this.controls = new THREE.OrbitControls(this.camera, canvas);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.06;
      this.controls.rotateSpeed = 0.9;
      this.controls.enablePan = false;
      this.controls.minDistance = 3.5;
      this.controls.maxDistance = 30;
      // Allow full vertical 360 orbit without clamp
      this.controls.minPolarAngle = 0.01;
      this.controls.maxPolarAngle = Math.PI - 0.01;

      // Lights
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.78);
      this.scene.add(ambientLight);

      const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.65);
      dirLight1.position.set(15, 25, 20);
      this.scene.add(dirLight1);

      const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.5);
      dirLight2.position.set(-18, -15, -15);
      this.scene.add(dirLight2);

      const dirLight3 = new THREE.DirectionalLight(0xffffff, 0.3);
      dirLight3.position.set(0, -25, 0);
      this.scene.add(dirLight3);

      // Cube parent group & pivot group for animated rotations
      this.cubeGroup = new THREE.Group();
      this.scene.add(this.cubeGroup);

      this.pivotGroup = new THREE.Group();
      this.scene.add(this.pivotGroup);

      // Separate group for 3D interactive arrows
      this.arrowGroup = new THREE.Group();
      this.scene.add(this.arrowGroup);

      this.raycaster = new THREE.Raycaster();
      this.mouse = new THREE.Vector2();

      // Window resize handler
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

    // Smoothly animate camera to a specific 360 view angle
    setCameraView(viewName) {
      const dist = this.currentSize === 'pyraminx' ? 9.5 : (this.currentSize * 2.3 + 3.2);
      let target = new THREE.Vector3();

      switch (viewName) {
        case 'front': target.set(0, 0, dist * 1.4); break;
        case 'back': target.set(0, 0, -dist * 1.4); break;
        case 'top': target.set(0, dist * 1.4, 0.001); break;
        case 'bottom': target.set(0, -dist * 1.4, 0.001); break;
        case 'left': target.set(-dist * 1.4, 0, 0); break;
        case 'right': target.set(dist * 1.4, 0, 0); break;
        case 'iso':
        default:
          target.set(dist * 0.9, dist * 0.8, dist * 1.2);
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

      // Clear existing puzzle meshes
      while (this.cubeGroup.children.length > 0) {
        const obj = this.cubeGroup.children[0];
        this.cubeGroup.remove(obj);
        if (obj.geometry) obj.geometry.dispose();
      }
      this.cubies = [];

      document.getElementById('cubeSizeBadge').innerText =
        size === 'pyraminx' ? 'Пирамидка' : `${size}x${size}x${size}`;

      if (size === 'pyraminx') {
        this.buildPyraminx();
      } else {
        this.buildNxNCube(parseInt(size, 10));
      }

      this.createEdgeArrows();
      this.setDefaultCamera();
    }

    // --- Build N x N x N Cube ---
    buildNxNCube(N) {
      const cubieSize = 0.96;
      const spacing = 1.0;
      const offset = (N - 1) / 2;

      const bodyMat = new THREE.MeshStandardMaterial({
        color: this.theme.body,
        roughness: 0.35,
        metalness: 0.1
      });

      const boxGeo = new THREE.BoxGeometry(cubieSize, cubieSize, cubieSize);

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

            this.addStickersToCubie(cubieMesh, ix, iy, iz, N, cubieSize);

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

    addStickersToCubie(cubie, ix, iy, iz, N, size) {
      const stickerThickness = 0.02;
      const stickerScale = 0.88;
      const stickerOffset = size / 2 + stickerThickness / 2;

      const faces = [
        { dir: '+x', cond: ix === N - 1, color: this.theme.R, rot: [0, Math.PI / 2, 0], pos: [stickerOffset, 0, 0] },
        { dir: '-x', cond: ix === 0,     color: this.theme.L, rot: [0, -Math.PI / 2, 0], pos: [-stickerOffset, 0, 0] },
        { dir: '+y', cond: iy === N - 1, color: this.theme.U, rot: [-Math.PI / 2, 0, 0], pos: [0, stickerOffset, 0] },
        { dir: '-y', cond: iy === 0,     color: this.theme.D, rot: [Math.PI / 2, 0, 0], pos: [0, -stickerOffset, 0] },
        { dir: '+z', cond: iz === N - 1, color: this.theme.F, rot: [0, 0, 0], pos: [0, 0, stickerOffset] },
        { dir: '-z', cond: iz === 0,     color: this.theme.B, rot: [0, Math.PI, 0], pos: [0, 0, -stickerOffset] }
      ];

      const stickerGeo = new THREE.PlaneGeometry(size * stickerScale, size * stickerScale);

      faces.forEach((f) => {
        if (f.cond) {
          const mat = new THREE.MeshStandardMaterial({
            color: f.color,
            roughness: 0.25,
            metalness: 0.05,
            side: THREE.DoubleSide
          });
          const sticker = new THREE.Mesh(stickerGeo, mat);
          sticker.position.set(...f.pos);
          sticker.rotation.set(...f.rot);
          sticker.userData = { isSticker: true, faceDir: f.dir, initColor: f.color };
          cubie.add(sticker);
        }
      });
    }

    // --- Build Pyraminx ---
    buildPyraminx() {
      const colors = [this.theme.F, this.theme.R, this.theme.B, this.theme.D];
      const scale = 3.2;

      const tetraGeo = new THREE.TetrahedronGeometry(scale, 0);
      const tetraMat = new THREE.MeshStandardMaterial({
        color: this.theme.body,
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
          roughness: 0.25,
          side: THREE.DoubleSide
        });
        const faceMesh = new THREE.Mesh(triGeo, triMat);
        baseTetra.add(faceMesh);
      }

      baseTetra.userData = { isPyraminx: true };
      this.cubeGroup.add(baseTetra);
      this.cubies.push(baseTetra);
    }

    // --- Interactive 3D Rotation Arrows on Edges and Faces ---
    createEdgeArrows() {
      // Clear old arrows
      while (this.arrowGroup.children.length > 0) {
        const a = this.arrowGroup.children[0];
        this.arrowGroup.remove(a);
        if (a.material) a.material.dispose();
        if (a.geometry) a.geometry.dispose();
      }
      this.arrowMeshes = [];

      if (this.currentSize === 'pyraminx') {
        this.createPyraminxArrows();
        return;
      }

      const N = parseInt(this.currentSize, 10);
      const spacing = 1.0;
      const offset = (N - 1) / 2;
      const faceDist = offset + 0.58; // slightly hovering outside the cube face
      const edgeDist = offset + 0.65;
      const arrowSize = 0.58;
      const arrowPlaneGeo = new THREE.PlaneGeometry(arrowSize, arrowSize);

      // Definition of arrows for each of the 6 outer faces
      // Each arrow has: position, normal rotation, axis, layer, direction, label, symbol, description
      const facesConfig = [
        // Front Face (+Z)
        {
          name: 'Front (F)',
          center: [0, 0, faceDist],
          rot: [0, 0, 0],
          cw: { axis: 'z', layer: N - 1, dir: -1, move: 'F', desc: 'Грань F по часовой ↻' },
          ccw: { axis: 'z', layer: N - 1, dir: 1, move: "F'", desc: 'Грань F против часовой ↺' },
          edges: [
            { pos: [edgeDist, 0, faceDist], symbol: '⬇', axis: 'x', layer: N - 1, dir: 1, move: "R'", desc: 'Правый слой R вниз' },
            { pos: [edgeDist, 0, faceDist - 0.5], symbol: '⬆', axis: 'x', layer: N - 1, dir: -1, move: 'R', desc: 'Правый слой R вверх' },
            { pos: [-edgeDist, 0, faceDist], symbol: '⬆', axis: 'x', layer: 0, dir: 1, move: 'L', desc: 'Левый слой L вверх' },
            { pos: [0, edgeDist, faceDist], symbol: '⬅', axis: 'y', layer: N - 1, dir: -1, move: 'U', desc: 'Верхний слой U влево' },
            { pos: [0, -edgeDist, faceDist], symbol: '➡', axis: 'y', layer: 0, dir: 1, move: 'D', desc: 'Нижний слой D вправо' }
          ]
        },
        // Right Face (+X)
        {
          name: 'Right (R)',
          center: [faceDist, 0, 0],
          rot: [0, Math.PI / 2, 0],
          cw: { axis: 'x', layer: N - 1, dir: -1, move: 'R', desc: 'Грань R по часовой ↻' },
          ccw: { axis: 'x', layer: N - 1, dir: 1, move: "R'", desc: 'Грань R против часовой ↺' },
          edges: [
            { pos: [faceDist, edgeDist, 0], symbol: '⬅', axis: 'y', layer: N - 1, dir: -1, move: 'U', desc: 'Верхний слой U' },
            { pos: [faceDist, -edgeDist, 0], symbol: '➡', axis: 'y', layer: 0, dir: 1, move: 'D', desc: 'Нижний слой D' },
            { pos: [faceDist, 0, edgeDist], symbol: '⬇', axis: 'z', layer: N - 1, dir: -1, move: 'F', desc: 'Передний слой F' },
            { pos: [faceDist, 0, -edgeDist], symbol: '⬆', axis: 'z', layer: 0, dir: 1, move: 'B', desc: 'Задний слой B' }
          ]
        },
        // Up Face (+Y)
        {
          name: 'Up (U)',
          center: [0, faceDist, 0],
          rot: [-Math.PI / 2, 0, 0],
          cw: { axis: 'y', layer: N - 1, dir: -1, move: 'U', desc: 'Грань U по часовой ↻' },
          ccw: { axis: 'y', layer: N - 1, dir: 1, move: "U'", desc: 'Грань U против часовой ↺' },
          edges: [
            { pos: [edgeDist, faceDist, 0], symbol: '⬇', axis: 'x', layer: N - 1, dir: 1, move: "R'", desc: 'Слой R назад' },
            { pos: [-edgeDist, faceDist, 0], symbol: '⬆', axis: 'x', layer: 0, dir: 1, move: 'L', desc: 'Слой L вперед' },
            { pos: [0, faceDist, edgeDist], symbol: '➡', axis: 'z', layer: N - 1, dir: -1, move: 'F', desc: 'Слой F' },
            { pos: [0, faceDist, -edgeDist], symbol: '⬅', axis: 'z', layer: 0, dir: 1, move: 'B', desc: 'Слой B' }
          ]
        },
        // Down Face (-Y)
        {
          name: 'Down (D)',
          center: [0, -faceDist, 0],
          rot: [Math.PI / 2, 0, 0],
          cw: { axis: 'y', layer: 0, dir: 1, move: 'D', desc: 'Грань D по часовой ↻' },
          ccw: { axis: 'y', layer: 0, dir: -1, move: "D'", desc: 'Грань D против часовой ↺' },
          edges: [
            { pos: [edgeDist, -faceDist, 0], symbol: '➡', axis: 'x', layer: N - 1, dir: -1, move: 'R', desc: 'Слой R' },
            { pos: [-edgeDist, -faceDist, 0], symbol: '⬅', axis: 'x', layer: 0, dir: -1, move: "L'", desc: 'Слой L' }
          ]
        },
        // Left Face (-X)
        {
          name: 'Left (L)',
          center: [-faceDist, 0, 0],
          rot: [0, -Math.PI / 2, 0],
          cw: { axis: 'x', layer: 0, dir: 1, move: 'L', desc: 'Грань L по часовой ↻' },
          ccw: { axis: 'x', layer: 0, dir: -1, move: "L'", desc: 'Грань L против часовой ↺' },
          edges: [
            { pos: [-faceDist, edgeDist, 0], symbol: '⬅', axis: 'y', layer: N - 1, dir: -1, move: 'U', desc: 'Верхний слой U' },
            { pos: [-faceDist, -edgeDist, 0], symbol: '➡', axis: 'y', layer: 0, dir: 1, move: 'D', desc: 'Нижний слой D' }
          ]
        },
        // Back Face (-Z)
        {
          name: 'Back (B)',
          center: [0, 0, -faceDist],
          rot: [0, Math.PI, 0],
          cw: { axis: 'z', layer: 0, dir: 1, move: 'B', desc: 'Грань B по часовой ↻' },
          ccw: { axis: 'z', layer: 0, dir: -1, move: "B'", desc: 'Грань B против часовой ↺' },
          edges: [
            { pos: [edgeDist, 0, -faceDist], symbol: '⬆', axis: 'x', layer: N - 1, dir: -1, move: 'R', desc: 'Слой R вверх' },
            { pos: [-edgeDist, 0, -faceDist], symbol: '⬇', axis: 'x', layer: 0, dir: -1, move: "L'", desc: 'Слой L вниз' }
          ]
        }
      ];

      facesConfig.forEach((fc) => {
        // 1. Clockwise Curved Arrow (↻)
        const cwOffset = 0.55;
        const cwPos = [
          fc.center[0] + (fc.rot[1] === 0 ? cwOffset : 0),
          fc.center[1] + (fc.rot[0] === 0 ? cwOffset : 0),
          fc.center[2]
        ];
        this.addArrowSprite(
          fc.cw.move,
          '↻',
          fc.cw,
          fc.center,
          fc.rot,
          [-0.45, 0.45, 0.05],
          '#10b981'
        );

        // 2. Counter-Clockwise Curved Arrow (↺)
        this.addArrowSprite(
          fc.ccw.move,
          '↺',
          fc.ccw,
          fc.center,
          fc.rot,
          [0.45, 0.45, 0.05],
          '#f59e0b'
        );

        // 3. Directional edge arrows
        if (fc.edges) {
          fc.edges.forEach((ed) => {
            this.addArrowSprite(
              ed.move,
              ed.symbol,
              ed,
              ed.pos,
              fc.rot,
              [0, 0, 0.02],
              '#38bdf8'
            );
          });
        }
      });
    }

    addArrowSprite(move, symbol, config, basePos, rot, localOffset = [0, 0, 0], color = '#38bdf8') {
      const tex = createArrowTexture(symbol, move, color);
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        side: THREE.DoubleSide,
        depthTest: true
      });
      const geo = new THREE.PlaneGeometry(0.52, 0.52);
      const mesh = new THREE.Mesh(geo, mat);

      mesh.position.set(...basePos);
      mesh.rotation.set(...rot);
      mesh.translateX(localOffset[0]);
      mesh.translateY(localOffset[1]);
      mesh.translateZ(localOffset[2]);

      mesh.userData = {
        isArrow: true,
        move: move,
        symbol: symbol,
        axis: config.axis,
        layer: config.layer,
        dir: config.dir,
        desc: config.desc || `${move} (${symbol})`,
        origScale: 1.0,
        color: color
      };

      this.arrowGroup.add(mesh);
      this.arrowMeshes.push(mesh);
    }

    createPyraminxArrows() {
      const matCW = new THREE.MeshBasicMaterial({
        map: createArrowTexture('↻', 'R', '#10b981'),
        transparent: true
      });
      const matCCW = new THREE.MeshBasicMaterial({
        map: createArrowTexture('↺', "R'", '#f59e0b'),
        transparent: true
      });
      const geo = new THREE.PlaneGeometry(0.8, 0.8);

      const m1 = new THREE.Mesh(geo, matCW);
      m1.position.set(1.5, 0, 2);
      m1.userData = { isArrow: true, axis: 'y', layer: 0, dir: 1, desc: 'Пирамидка по часовой ↻' };

      const m2 = new THREE.Mesh(geo, matCCW);
      m2.position.set(-1.5, 0, 2);
      m2.userData = { isArrow: true, axis: 'y', layer: 0, dir: -1, desc: 'Пирамидка против часовой ↺' };

      this.arrowGroup.add(m1, m2);
      this.arrowMeshes.push(m1, m2);
    }

    // --- Face and Slice Rotations ---
    rotateSlice(axis, layer, direction, customDuration = null, onComplete = null) {
      if (this.currentSize === 'pyraminx') {
        this.rotatePyraminx(direction, onComplete);
        return;
      }

      const N = parseInt(this.currentSize, 10);
      const spacing = 1.0;
      const offset = (N - 1) / 2;

      // Find all cubies in this slice layer
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

      // Attach moving cubies to pivotGroup
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
        this.checkSolved();
      }

      if (onComplete) onComplete();
    }

    rotatePyraminx(direction, onComplete) {
      this.isAnimating = true;
      const duration = this.animationSpeed || 200;
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

      switch (base) {
        case 'U': axis = 'y'; layer = N - 1; dir = -1; break;
        case 'D': axis = 'y'; layer = 0;     dir = 1;  break;
        case 'R': axis = 'x'; layer = N - 1; dir = -1; break;
        case 'L': axis = 'x'; layer = 0;     dir = 1;  break;
        case 'F': axis = 'z'; layer = N - 1; dir = -1; break;
        case 'B': axis = 'z'; layer = 0;     dir = 1;  break;
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

    // --- Scramble Functionality ---
    scramble() {
      if (this.isAnimating || this.isScrambling || this.isAutoSolving) return;

      this.isScrambling = true;
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
      this.showToast('Перемешивание кубика...');

      const scrambleSpeed = Math.min(this.animationSpeed, 80);
      let idx = 0;

      const runNextMove = () => {
        if (idx >= sequence.length) {
          this.isScrambling = false;
          this.showToast('Кубик разобран! Попробуй собрать.');
          return;
        }
        const move = sequence[idx++];
        this.executeNotationMove(move, true, scrambleSpeed, runNextMove);
      };

      runNextMove();
    }

    // --- Auto-Solve Functionality ---
    autoSolve() {
      if (this.isAnimating || this.isScrambling || this.isAutoSolving) return;
      if (this.moveHistory.length === 0) {
        this.showToast('Кубик уже собран!');
        return;
      }

      this.isAutoSolving = true;
      this.stopTimer();

      const totalMoves = this.moveHistory.length;
      this.showToast(`Авто-сборка: 0 из ${totalMoves}`);

      const solveSpeed = Math.min(this.animationSpeed, 120);

      const runSolveStep = () => {
        if (this.moveHistory.length === 0) {
          this.isAutoSolving = false;
          this.showToast('Кубик успешно собран! 🎉');
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

    // --- Reset Puzzle Instantly ---
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

    // --- Check if Solved ---
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

    // --- Victory Celebration ---
    celebrateVictory() {
      this.sound.playVictory();

      if (window.confetti) {
        window.confetti({ particleCount: 130, spread: 85, origin: { y: 0.6 } });
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

    // --- Speedcubing Timer ---
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

      const best = localStorage.getItem('rubiks_best_time');
      if (!best || this.timerElapsed < parseFloat(best)) {
        localStorage.setItem('rubiks_best_time', this.timerElapsed);
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

    // --- UI Notifications & Overlays ---
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

    // --- Highlight Slice on Arrow Hover ---
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
              child.material.emissive.setHex(0x22d3ee);
              child.material.emissiveIntensity = 0.35;
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

    // --- Pointer & Arrow Raycasting Interaction ---
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
            // Dragging anywhere spins the 3D cube view!
            tooltip.style.display = 'none';
            this.clearHighlightSlice();
            return;
          }
        }

        // Raycast against 3D arrows first
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
            hitArrow.scale.set(1.22, 1.22, 1.22);

            this.highlightSlice(hitArrow.userData.axis, hitArrow.userData.layer);
          }

          // Show Tooltip
          tooltipText.innerText = hitArrow.userData.desc;
          tooltip.style.left = `${e.clientX}px`;
          tooltip.style.top = `${e.clientY}px`;
          tooltip.style.display = 'block';
        } else {
          canvas.style.cursor = 'grab';
          if (this.activeHoveredArrow) {
            this.activeHoveredArrow.scale.set(1, 1, 1);
            this.activeHoveredArrow = null;
            this.clearHighlightSlice();
            tooltip.style.display = 'none';
          }
        }
      });

      canvas.addEventListener('pointerup', (e) => {
        this.isPointerDown = false;

        // If it was a click (not a camera drag) and clicked on an arrow:
        if (!this.dragThresholdPassed) {
          this.raycaster.setFromCamera(this.mouse, this.camera);
          const arrowHits = this.raycaster.intersectObjects(this.arrowMeshes);

          if (arrowHits.length > 0) {
            const hitArrow = arrowHits[0].object;
            const data = hitArrow.userData;

            this.moveHistory.push({
              axis: data.axis,
              layer: data.layer,
              dir: data.dir,
              moveStr: data.move
            });
            this.updateMoveCounter(this.moveHistory.length);

            if (!this.timerRunning && this.moveHistory.length === 1) {
              this.startTimer();
            }

            this.rotateSlice(data.axis, data.layer, data.dir, this.animationSpeed);
            tooltip.style.display = 'none';
          }
        }
      });
    }

    // --- UI Bindings ---
    bindUI() {
      this.setupInteraction();

      // Puzzle type buttons (2x2, 3x3, 4x4, 5x5, Pyraminx)
      document.querySelectorAll('.type-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.type-btn').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          const type = btn.getAttribute('data-type');
          this.buildPuzzle(type);
        });
      });

      // 360 Viewpoint Switcher buttons
      document.querySelectorAll('.cam-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.cam-btn').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          const view = btn.getAttribute('data-cam');
          this.setCameraView(view);
        });
      });

      // Primary Action Buttons
      document.getElementById('scrambleBtn').addEventListener('click', () => this.scramble());
      document.getElementById('solveBtn').addEventListener('click', () => this.autoSolve());
      document.getElementById('resetBtn').addEventListener('click', () => this.resetPuzzle());

      // Virtual Notation Turn Buttons
      document.querySelectorAll('.turn-btn[data-move]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const move = btn.getAttribute('data-move');
          this.executeNotationMove(move, true);
        });
      });

      // Undo button
      document.getElementById('undoMoveBtn').addEventListener('click', () => this.undoLastMove());

      // Toggle Arrows visibility button
      const toggleArrowsBtn = document.getElementById('toggleArrowsBtn');
      toggleArrowsBtn.addEventListener('click', () => {
        this.arrowGroup.visible = !this.arrowGroup.visible;
        toggleArrowsBtn.classList.toggle('active', this.arrowGroup.visible);
        toggleArrowsBtn.innerText = this.arrowGroup.visible ? '🎯 Стрелки: Вкл' : '🎯 Стрелки: Скрыты';
      });

      // Animation speed select
      const speedSelect = document.getElementById('speedSelect');
      speedSelect.addEventListener('change', (e) => {
        this.animationSpeed = parseInt(e.target.value, 10);
      });

      // Sound toggle
      const soundBtn = document.getElementById('soundToggleBtn');
      soundBtn.addEventListener('click', () => {
        this.sound.enabled = !this.sound.enabled;
        soundBtn.innerText = this.sound.enabled ? '🔊' : '🔇';
        this.showToast(this.sound.enabled ? 'Звук включен' : 'Звук выключен');
      });

      // Theme toggle
      const themeBtn = document.getElementById('themeToggleBtn');
      const themeNames = ['classic', 'neon', 'pastel'];
      themeBtn.addEventListener('click', () => {
        let nextIdx = (themeNames.indexOf(this.currentThemeName) + 1) % themeNames.length;
        this.currentThemeName = themeNames[nextIdx];
        this.theme = THEMES[this.currentThemeName];
        document.body.className = `theme-${this.currentThemeName}`;
        this.scene.background = new THREE.Color(this.theme.bg);
        this.buildPuzzle(this.currentSize);
        this.showToast(`Тема: ${this.currentThemeName.toUpperCase()}`);
      });

      // Toggle virtual notation controls
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
      const savedBest = localStorage.getItem('rubiks_best_time');
      if (savedBest) {
        document.getElementById('bestTime').innerText = this.formatTime(parseFloat(savedBest));
      }

      // Keyboard Controls
      window.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

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

    // --- Animation Loop ---
    animate() {
      requestAnimationFrame(() => this.animate());

      // Smooth camera transition when preset is clicked
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

  // Initialize application on DOM ready
  window.addEventListener('DOMContentLoaded', () => {
    window.app = new RubiksCubeApp();
  });
})();
