/**
 * -------------------------------------------------------------
 * КУБИК РУБИКА 3D — Полный движок и интерфейс
 * Поддержка 2x2, 3x3, 4x4, 5x5 и Пирамидки
 * -------------------------------------------------------------
 */

(function () {
  'use strict';

  // --- Sound Synthesizer (Web Audio API) ---
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
      // Mechanical snap: short burst of filtered noise + low pop
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.05);

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

      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
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

  // --- Theme definitions ---
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
      this.moveHistory = []; // Stack of moves performed
      this.moveQueue = []; // Queued animations
      this.isScrambling = false;
      this.isAutoSolving = false;
      this.scrambleSequence = [];

      // Timer state
      this.timerRunning = false;
      this.timerStartTime = 0;
      this.timerElapsed = 0;
      this.timerInterval = null;
      this.moveCount = 0;

      // Face drag interaction
      this.isDraggingFace = false;
      this.pointerDownPos = new THREE.Vector2();
      this.selectedCubie = null;
      this.selectedFaceNormal = null;

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

      // OrbitControls for camera
      this.controls = new THREE.OrbitControls(this.camera, canvas);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.08;
      this.controls.rotateSpeed = 0.8;
      this.controls.enablePan = false;
      this.controls.minDistance = 4;
      this.controls.maxDistance = 25;

      // Lights
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.72);
      this.scene.add(ambientLight);

      const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.65);
      dirLight1.position.set(12, 20, 15);
      this.scene.add(dirLight1);

      const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.45);
      dirLight2.position.set(-15, -12, -10);
      this.scene.add(dirLight2);

      // Cube parent group & pivot group for animated rotations
      this.cubeGroup = new THREE.Group();
      this.scene.add(this.cubeGroup);

      this.pivotGroup = new THREE.Group();
      this.scene.add(this.pivotGroup);

      this.raycaster = new THREE.Raycaster();
      this.mouse = new THREE.Vector2();

      // Window resize handler
      window.addEventListener('resize', () => this.onWindowResize());
    }

    setDefaultCamera() {
      const dist = this.currentSize === 'pyraminx' ? 9 : (this.currentSize * 2.2 + 3);
      this.camera.position.set(dist * 0.9, dist * 0.8, dist * 1.2);
      this.camera.lookAt(0, 0, 0);
      if (this.controls) {
        this.controls.target.set(0, 0, 0);
        this.controls.update();
      }
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
      this.moveQueue = [];
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

      this.setDefaultCamera();
    }

    // --- Build N x N x N Cube ---
    buildNxNCube(N) {
      const cubieSize = 0.96;
      const spacing = 1.0;
      const offset = (N - 1) / 2;

      // Base black plastic material for cubie body
      const bodyMat = new THREE.MeshStandardMaterial({
        color: this.theme.body,
        roughness: 0.35,
        metalness: 0.1
      });

      const boxGeo = new THREE.BoxGeometry(cubieSize, cubieSize, cubieSize);

      for (let ix = 0; ix < N; ix++) {
        for (let iy = 0; iy < N; iy++) {
          for (let iz = 0; iz < N; iz++) {
            // Skip inner cubies for N > 2 to optimize rendering
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

            // Add colored stickers for exterior faces
            this.addStickersToCubie(cubieMesh, ix, iy, iz, N, cubieSize);

            // Store logical grid coordinate indices and initial positions
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

    // --- Build Pyraminx (Tetrahedron Puzzle) ---
    buildPyraminx() {
      // 4 Faces of Pyraminx: Front (Green), Right (Red), Left (Blue), Bottom (Yellow)
      const colors = [this.theme.F, this.theme.R, this.theme.B, this.theme.D];
      const scale = 3.2;

      const tetraGeo = new THREE.TetrahedronGeometry(scale, 0);
      const tetraMat = new THREE.MeshStandardMaterial({
        color: this.theme.body,
        roughness: 0.35
      });

      const baseTetra = new THREE.Mesh(tetraGeo, tetraMat);
      baseTetra.position.set(0, 0, 0);

      // Apply 4 distinct face colors using vertex groups or sub-meshes
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

    // --- Face and Slice Rotations ---
    // axis: 'x', 'y', 'z'
    // layer: index from 0 to N-1
    // direction: +1 (clockwise around axis) or -1 (counter-clockwise)
    rotateSlice(axis, layer, direction, customDuration = null, onComplete = null) {
      if (this.currentSize === 'pyraminx') {
        this.rotatePyraminx(direction, onComplete);
        return;
      }

      const N = parseInt(this.currentSize, 10);
      const spacing = 1.0;
      const offset = (N - 1) / 2;

      // Find all cubies in this layer
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
        // Instant turn
        this.pivotGroup.rotation[axis] = targetAngle;
        this.finishRotation(movingCubies, axis, layer, direction, N, spacing, offset, onComplete);
      } else {
        const startTime = performance.now();
        const startAngle = 0;

        const step = (time) => {
          const elapsed = time - startTime;
          const progress = Math.min(elapsed / duration, 1.0);
          // Quadratic ease-in-out
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

        // Update logical grid coordinates based on rotation
        const gx = c.userData.gridX - offset;
        const gy = c.userData.gridY - offset;
        const gz = c.userData.gridZ - offset;

        let nGx = gx;
        let nGy = gy;
        let nGz = gz;

        // Mathematical rotation formulas for 90 deg around axis
        if (axis === 'x') {
          // Clockwise: y' = -z * dir, z' = y * dir
          if (direction > 0) {
            nGy = -gz;
            nGz = gy;
          } else {
            nGy = gz;
            nGz = -gy;
          }
        } else if (axis === 'y') {
          if (direction > 0) {
            nGx = gz;
            nGz = -gx;
          } else {
            nGx = -gz;
            nGz = gx;
          }
        } else if (axis === 'z') {
          if (direction > 0) {
            nGx = -gy;
            nGy = gx;
          } else {
            nGx = gy;
            nGy = -gx;
          }
        }

        c.userData.gridX = Math.round(nGx + offset);
        c.userData.gridY = Math.round(nGy + offset);
        c.userData.gridZ = Math.round(nGz + offset);

        // Snap exact position to avoid floating point drift
        c.position.set(
          (c.userData.gridX - offset) * spacing,
          (c.userData.gridY - offset) * spacing,
          (c.userData.gridZ - offset) * spacing
        );
      });

      this.pivotGroup.rotation.set(0, 0, 0);
      this.isAnimating = false;

      this.sound.playClick();

      // Check if solved if user is playing
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

      this.scrambleSequence = sequence;
      this.showScrambleDisplay(sequence.join(' '));
      this.showToast('Перемешивание кубика...');

      // Animate scramble moves quickly
      const scrambleSpeed = Math.min(this.animationSpeed, 90);
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

        // Inverse the move direction: -dir
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

      const N = parseInt(this.currentSize, 10);
      const offset = (N - 1) / 2;

      // Verify each face sticker matches its original orientation
      let isSolved = true;

      for (let cubie of this.cubies) {
        for (let child of cubie.children) {
          if (child.userData && child.userData.isSticker) {
            const worldDir = new THREE.Vector3();
            child.getWorldDirection(worldDir);

            // Sticker must align with cardinal axes
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

      // Launch Confetti
      if (window.confetti) {
        window.confetti({
          particleCount: 120,
          spread: 80,
          origin: { y: 0.6 }
        });
        setTimeout(() => {
          window.confetti({
            particleCount: 80,
            angle: 60,
            spread: 55,
            origin: { x: 0 }
          });
          window.confetti({
            particleCount: 80,
            angle: 120,
            spread: 55,
            origin: { x: 1 }
          });
        }, 250);
      }

      // Show Victory Modal
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

      // Update best time in localStorage
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

    // --- Interactive Mouse / Touch Raycasting Face Swiping ---
    setupInteraction() {
      const canvas = document.getElementById('cubeCanvas');

      canvas.addEventListener('pointerdown', (e) => {
        if (this.isAnimating) return;

        const rect = canvas.getBoundingClientRect();
        this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.cubeGroup.children, true);

        if (intersects.length > 0) {
          let hit = intersects[0];
          // Find cubie parent
          let cubie = hit.object;
          while (cubie && !cubie.userData.isCubie && cubie.parent) {
            cubie = cubie.parent;
          }

          if (cubie && cubie.userData.isCubie) {
            this.isDraggingFace = true;
            this.selectedCubie = cubie;
            this.selectedFaceNormal = hit.face.normal.clone();
            // Transform normal to world space
            this.selectedFaceNormal.transformDirection(hit.object.matrixWorld);
            this.pointerDownPos.set(e.clientX, e.clientY);
            this.controls.enabled = false; // Disable camera rotate while turning face
          }
        }
      });

      window.addEventListener('pointermove', (e) => {
        if (!this.isDraggingFace || !this.selectedCubie) return;

        const deltaX = e.clientX - this.pointerDownPos.x;
        const deltaY = e.clientY - this.pointerDownPos.y;
        const dist = Math.hypot(deltaX, deltaY);

        if (dist > 25) {
          this.handleFaceSwipe(deltaX, deltaY);
          this.isDraggingFace = false;
          this.selectedCubie = null;
          this.controls.enabled = true;
        }
      });

      window.addEventListener('pointerup', () => {
        this.isDraggingFace = false;
        this.selectedCubie = null;
        this.controls.enabled = true;
      });
    }

    handleFaceSwipe(dx, dy) {
      if (!this.selectedCubie || !this.selectedFaceNormal) return;

      const norm = this.selectedFaceNormal;
      const c = this.selectedCubie.userData;

      // Project swipe to cardinal plane
      const isHorizontal = Math.abs(dx) > Math.abs(dy);

      let axis = 'y';
      let layer = c.gridY;
      let dir = dx > 0 ? -1 : 1;

      // Determine rotation axis and layer based on the face touched
      if (Math.abs(norm.y) > 0.7) {
        // Top or Bottom face
        if (isHorizontal) {
          axis = 'z';
          layer = c.gridZ;
          dir = norm.y > 0 ? (dx > 0 ? 1 : -1) : (dx > 0 ? -1 : 1);
        } else {
          axis = 'x';
          layer = c.gridX;
          dir = norm.y > 0 ? (dy > 0 ? -1 : 1) : (dy > 0 ? 1 : -1);
        }
      } else if (Math.abs(norm.x) > 0.7) {
        // Left or Right face
        if (isHorizontal) {
          axis = 'y';
          layer = c.gridY;
          dir = norm.x > 0 ? (dx > 0 ? -1 : 1) : (dx > 0 ? 1 : -1);
        } else {
          axis = 'z';
          layer = c.gridZ;
          dir = norm.x > 0 ? (dy > 0 ? 1 : -1) : (dy > 0 ? -1 : 1);
        }
      } else {
        // Front or Back face
        if (isHorizontal) {
          axis = 'y';
          layer = c.gridY;
          dir = norm.z > 0 ? (dx > 0 ? -1 : 1) : (dx > 0 ? 1 : -1);
        } else {
          axis = 'x';
          layer = c.gridX;
          dir = norm.z > 0 ? (dy > 0 ? 1 : -1) : (dy > 0 ? -1 : 1);
        }
      }

      this.moveHistory.push({ axis, layer, dir });
      this.updateMoveCounter(this.moveHistory.length);
      if (!this.timerRunning && this.moveHistory.length === 1) {
        this.startTimer();
      }
      this.rotateSlice(axis, layer, dir, this.animationSpeed);
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

      // Reset camera button
      document.getElementById('resetCameraBtn').addEventListener('click', () => {
        this.setDefaultCamera();
      });

      // Toggle virtual controls
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

        // Spacebar to toggle timer
        if (e.code === 'Space') {
          e.preventDefault();
          if (this.timerRunning) this.stopTimer();
          else this.startTimer();
          return;
        }

        // Ctrl + Z to undo
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
          e.preventDefault();
          this.undoLastMove();
          return;
        }

        // Standard WCA Face Keys: U, D, L, R, F, B
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
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    }
  }

  // Initialize application on DOM ready
  window.addEventListener('DOMContentLoaded', () => {
    window.app = new RubiksCubeApp();
  });
})();
