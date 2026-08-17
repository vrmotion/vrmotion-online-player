import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const params = new URLSearchParams(window.location.search);

const state = {
  hls: null,
  isPlaying: false,
  hasStarted: false,
  videoUrl: params.get("v") || "",
  posterUrl: params.get("poster") || "./assets/girls_background.png",
  title: params.get("title") || "VRMotion Online Player",
  description: params.get("desc") || "Простой online VR/360 player. Для адаптивного качества передай HLS master playlist .m3u8.",
  mode: normalizeMode(params.get("type") || "vr180"),
  stereoView: false,
  touchZoomDistance: 0,
  uiVisible: true,
  uiHideTimer: 0,
};

function normalizeMode(value) {
  const clean = String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (["vr180", "180", "180sbs", "vr180sbs", "sbs180"].includes(clean)) return "180SBS";
  if (["360", "vr360"].includes(clean)) return "360";
  return "180SBS";
}

const landingScreen = document.getElementById("landingScreen");
const playerScreen = document.getElementById("playerScreen");
const viewer = document.getElementById("viewer");
const startPlaybackButton = document.getElementById("startPlayback");
const bigPlayButton = document.getElementById("bigPlayButton");
const playPauseButton = document.getElementById("playPauseButton");
const prevButton = document.getElementById("prevButton");
const nextButton = document.getElementById("nextButton");
const volumeButton = document.getElementById("volumeButton");
const fullscreenButton = document.getElementById("fullscreenButton");
const backButton = document.getElementById("backButton");
const vrButton = document.getElementById("vrButton");
const playerCenterOverlay = document.getElementById("playerCenterOverlay");
const playerHint = document.getElementById("playerHint");
const playerSubhint = document.getElementById("playerSubhint");
const playerTitle = document.getElementById("videoTitle");
const playerDescription = document.getElementById("videoDescription");
const modeBadge = document.getElementById("modeBadge");
const qualityBadge = document.getElementById("qualityBadge");
const qualitySelect = document.getElementById("qualitySelect");
const video = document.getElementById("video");
const seekBar = document.getElementById("seekBar");
const volumeBar = document.getElementById("volumeBar");
const currentTimeLabel = document.getElementById("currentTimeLabel");
const durationLabel = document.getElementById("durationLabel");

const playIconMarkup = `
  <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <circle cx="32" cy="32" r="30" fill="rgba(255,63,180,0.14)"></circle>
    <path d="M25 18 L47 32 L25 46 Z" fill="#ff4db8"></path>
  </svg>
`;

const pauseIconMarkup = `
  <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <circle cx="32" cy="32" r="30" fill="rgba(42,183,255,0.24)"></circle>
    <rect x="21" y="17" width="9" height="30" rx="3" fill="#ffffff"></rect>
    <rect x="34" y="17" width="9" height="30" rx="3" fill="#ffffff"></rect>
  </svg>
`;

function setButtonIcon(button, isPause) {
  button.innerHTML = isPause ? pauseIconMarkup : playIconMarkup;
}

if (playerTitle) {
  playerTitle.textContent = state.title;
}
if (playerDescription) {
  playerDescription.textContent = state.description;
}
if (modeBadge) {
  modeBadge.textContent = state.mode === "180SBS" ? "VR180" : state.mode;
}
video.poster = state.posterUrl;
video.volume = 1;
video.muted = false;
video.crossOrigin = "anonymous";

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(Math.max(1, viewer.clientWidth), Math.max(1, viewer.clientHeight));
viewer.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, Math.max(1, viewer.clientWidth) / Math.max(1, viewer.clientHeight), 0.1, 200);
camera.position.set(0, 0, 0.01);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enabled = true;
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.enableZoom = false;
controls.rotateSpeed = -0.25;
controls.target.set(0, 0, 0);
controls.update();

const videoTexture = new THREE.VideoTexture(video);
videoTexture.colorSpace = THREE.SRGBColorSpace;
videoTexture.minFilter = THREE.LinearFilter;
videoTexture.magFilter = THREE.LinearFilter;

const sharedUniforms = {
  map: { value: videoTexture },
  stereoLayout: { value: 0 },
  sourceRotation: { value: 0 },
  duplicate180: { value: 0 },
};

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform sampler2D map;
  uniform float stereoLayout;
  uniform float sourceRotation;
  uniform float duplicate180;
  varying vec2 vUv;

  vec2 rotateSourceUv(vec2 uv) {
    if (sourceRotation < 0.5) return uv;
    if (sourceRotation < 1.5) return vec2(1.0 - uv.y, uv.x);
    return vec2(uv.y, 1.0 - uv.x);
  }

  vec2 stereoUv(vec2 uv) {
    if (stereoLayout < 0.5) {
      return uv;
    }

    if (stereoLayout < 1.5) {
      return vec2(uv.x * 0.5, uv.y);
    }

    return uv;
  }

  void main() {
    vec2 sourceUv = rotateSourceUv(vUv);
    if (duplicate180 > 0.5) {
      sourceUv.x = fract(sourceUv.x * 2.0);
    }
    gl_FragColor = texture2D(map, stereoUv(sourceUv));
  }
`;

function makeMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    transparent: false,
    uniforms: {
      map: sharedUniforms.map,
      stereoLayout: sharedUniforms.stereoLayout,
      sourceRotation: sharedUniforms.sourceRotation,
      duplicate180: sharedUniforms.duplicate180,
    },
    vertexShader,
    fragmentShader,
  });
}

const full360 = new THREE.SphereGeometry(100, 96, 64);
full360.scale(-1, 1, 1);

const half180 = new THREE.SphereGeometry(100, 128, 64, -Math.PI, Math.PI, 0, Math.PI);
half180.scale(-1, 1, 1);

const monoMesh = new THREE.Mesh(half180, makeMaterial());
scene.add(monoMesh);

function isVr180Mode() {
  return state.mode === "180SBS";
}

function is360Mode() {
  return state.mode === "360";
}

function formatTime(value) {
  if (!Number.isFinite(value)) {
    return "00:00";
  }
  const totalSeconds = Math.max(0, Math.floor(value));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function updateTimeUi() {
  currentTimeLabel.textContent = formatTime(video.currentTime);
  durationLabel.textContent = formatTime(video.duration);
  if (Number.isFinite(video.duration) && video.duration > 0) {
    seekBar.value = String((video.currentTime / video.duration) * 100);
  } else {
    seekBar.value = "0";
  }
}

function setOverlayMessage(title, subtitle) {
  if (playerHint) {
    playerHint.textContent = title;
  }
  if (playerSubhint) {
    playerSubhint.textContent = subtitle;
  }
}

function openPlayer() {
  landingScreen.classList.add("is-hidden");
  playerScreen.classList.remove("is-hidden");
  resizeViewer();
}

async function returnToLanding() {
  video.pause();
  state.isPlaying = false;
  state.hasStarted = false;
  clearUiHideTimer();
  setUiVisible(true);
  updatePlayButtons();
  if (document.fullscreenElement) {
    try {
      await document.exitFullscreen();
    } catch {}
  }
  playerScreen.classList.add("is-hidden");
  landingScreen.classList.remove("is-hidden");
}

function clearUiHideTimer() {
  if (state.uiHideTimer) {
    window.clearTimeout(state.uiHideTimer);
    state.uiHideTimer = 0;
  }
}

function setUiVisible(visible) {
  state.uiVisible = visible;
  playerScreen.classList.toggle("ui-hidden", !visible && state.isPlaying);
}

function scheduleUiHide() {
  clearUiHideTimer();
  if (!state.isPlaying) {
    setUiVisible(true);
    return;
  }
  state.uiHideTimer = window.setTimeout(() => {
    setUiVisible(false);
  }, 2000);
}

function revealUi() {
  setUiVisible(true);
  scheduleUiHide();
}

function updatePlayButtons() {
  const label = state.isPlaying ? "Пауза" : "Воспроизведение";
  playPauseButton.setAttribute("aria-label", label);
  bigPlayButton.setAttribute("aria-label", label);
  setButtonIcon(playPauseButton, state.isPlaying);
  setButtonIcon(bigPlayButton, state.isPlaying);
  playPauseButton.classList.toggle("is-playing", state.isPlaying);
  bigPlayButton.classList.toggle("is-playing", state.isPlaying);
  playerCenterOverlay.style.display = state.isPlaying ? "none" : "grid";
  playerScreen.classList.toggle("is-playing", state.isPlaying);
}

function updateVrButtonState() {
  if (!vrButton) {
    return;
  }
  const active = Boolean(state.stereoView && isVr180Mode());
  vrButton.classList.toggle("is-active", active);
  vrButton.setAttribute("aria-label", active ? "Выключить VR режим" : "Включить VR режим");
  vrButton.title = active ? "Выключить VR режим" : "Включить VR режим";
}

function updateVolumeUi() {
  volumeBar.value = String(Math.round(video.volume * 100));
}

function updateAdaptiveBadge() {
  if (!state.hls) {
    qualityBadge.textContent = video.currentSrc?.includes(".m3u8") ? "NATIVE HLS" : "MP4";
    return;
  }

  if (state.hls.autoLevelEnabled || state.hls.currentLevel < 0) {
    qualityBadge.textContent = "AUTO";
    return;
  }

  const currentLevel = state.hls.levels[state.hls.currentLevel];
  qualityBadge.textContent = currentLevel?.height ? `${currentLevel.height}P` : "MANUAL";
}

function fillQualityOptions(levels) {
  qualitySelect.innerHTML = "";

  const uniqueLevels = [...levels]
    .filter((level) => level.height)
    .sort((a, b) => a.height - b.height)
    .filter((level, index, array) => array.findIndex((item) => item.height === level.height) === index);

  for (const level of uniqueLevels) {
    const option = document.createElement("option");
    option.value = String(level.height);
    option.textContent = `${level.height}P`;
    qualitySelect.append(option);
  }
}

function applyProjectionMode() {
  if (isVr180Mode()) {
    monoMesh.geometry = full360;
    sharedUniforms.stereoLayout.value = state.stereoView ? 0 : 1;
    sharedUniforms.duplicate180.value = 1;
    camera.fov = 70;
    if (!state.stereoView) {
      if (modeBadge) modeBadge.textContent = "VR180";
      setOverlayMessage("VR180 просмотр", "Можно крутить вокруг и проверять развёртку SBS как в VRMotion player.");
    } else {
      if (modeBadge) modeBadge.textContent = "VR";
      setOverlayMessage("Stereo исходник", "Сейчас включен сырой просмотр исходного SBS-кадра.");
    }
  } else if (is360Mode()) {
    monoMesh.geometry = full360;
    sharedUniforms.stereoLayout.value = 0;
    sharedUniforms.duplicate180.value = 0;
    camera.fov = 75;
    if (modeBadge) modeBadge.textContent = "360";
    setOverlayMessage("360 просмотр", "Тяни мышью или пальцем, чтобы вращать обзор.");
  } else {
    monoMesh.geometry = half180;
    sharedUniforms.stereoLayout.value = 1;
    sharedUniforms.duplicate180.value = 0;
    if (modeBadge) modeBadge.textContent = state.mode;
  }

  controls.enabled = true;
  camera.position.set(0, 0, 0.01);
  controls.target.set(0, 0, 0);
  controls.update();
  camera.updateProjectionMatrix();
  updateVrButtonState();
}

function requestFullscreenOn(targetElement) {
  if (document.fullscreenElement) {
    return;
  }
  targetElement.requestFullscreen?.().catch(() => {});
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await playerScreen.requestFullscreen?.();
    }
  } catch {}
}

function attachHls(url) {
  if (window.Hls && window.Hls.isSupported()) {
    const hls = new window.Hls({
      enableWorker: true,
      capLevelToPlayerSize: true,
      startLevel: -1,
      backBufferLength: 90,
    });

    state.hls = hls;
    hls.loadSource(url);
    hls.attachMedia(video);

    hls.on(window.Hls.Events.MANIFEST_PARSED, (_, data) => {
      fillQualityOptions(data.levels || []);
      state.hls.currentLevel = -1;
      qualitySelect.selectedIndex = -1;
      updateAdaptiveBadge();
      applyProjectionMode();
      setOverlayMessage("Плеер готов", "Можешь вручную переключать качества и проверять каждый HLS-кусок локально.");
    });

    hls.on(window.Hls.Events.LEVEL_SWITCHED, (_, data) => {
      const level = hls.levels[data.level];
      qualityBadge.textContent = level?.height ? `${level.height}P` : "—";
      if (level?.height) {
        qualitySelect.value = String(level.height);
      }
    });

    hls.on(window.Hls.Events.ERROR, (_, data) => {
      if (data?.fatal) {
        setOverlayMessage("Ошибка HLS", "Проверь ссылку на master.m3u8 или настройки CDN/CORS.");
      }
    });
    return;
  }

  video.src = url;
  updateAdaptiveBadge();
  applyProjectionMode();
}

function loadVideoSource() {
  if (!state.videoUrl) {
    setOverlayMessage("Добавь ссылку на видео", "Пример: index.html?v=https://media.example.com/video/master.m3u8&type=VR180");
    qualitySelect.disabled = true;
    qualityBadge.textContent = "NO SOURCE";
    return;
  }

  if (state.videoUrl.includes(".m3u8")) {
    attachHls(state.videoUrl);
    return;
  }

  video.src = state.videoUrl;
  qualitySelect.disabled = true;
  qualityBadge.textContent = "MP4";
  applyProjectionMode();
}

async function togglePlayback() {
  if (!state.hasStarted) {
    state.hasStarted = true;
  }

  if (!video.src && !video.currentSrc) {
    return;
  }

  if (video.paused) {
    try {
      await video.play();
      state.isPlaying = true;
      updatePlayButtons();
      scheduleUiHide();
    } catch {
      setOverlayMessage("Не удалось начать", "На телефоне воспроизведение может требовать явного нажатия пользователя.");
    }
    return;
  }

  video.pause();
  state.isPlaying = false;
  updatePlayButtons();
  clearUiHideTimer();
  setUiVisible(true);
}

function nudgeTime(seconds) {
  if (!Number.isFinite(video.duration)) {
    return;
  }
  video.currentTime = Math.min(video.duration, Math.max(0, video.currentTime + seconds));
}

function resizeViewer() {
  const width = Math.max(1, viewer.clientWidth);
  const height = Math.max(1, viewer.clientHeight);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

function handleViewerWheel(event) {
  event.preventDefault();
  camera.fov = THREE.MathUtils.clamp(camera.fov + event.deltaY * 0.035, 35, 118);
  camera.updateProjectionMatrix();
}

function getTouchDistance(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

function handleTouchStart(event) {
  if (event.touches.length === 2) {
    state.touchZoomDistance = getTouchDistance(event.touches);
  }
}

function handleTouchMove(event) {
  if (event.touches.length !== 2) {
    return;
  }
  event.preventDefault();
  const nextDistance = getTouchDistance(event.touches);
  if (!state.touchZoomDistance) {
    state.touchZoomDistance = nextDistance;
    return;
  }
  const delta = state.touchZoomDistance - nextDistance;
  camera.fov = THREE.MathUtils.clamp(camera.fov + delta * 0.08, 35, 118);
  camera.updateProjectionMatrix();
  state.touchZoomDistance = nextDistance;
}

function handleTouchEnd() {
  state.touchZoomDistance = 0;
}

function updateVolumeButtonState() {
  const muted = video.muted || video.volume <= 0.001;
  volumeButton.classList.toggle("is-active", !muted);
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    videoTexture.needsUpdate = true;
  }
  renderer.render(scene, camera);
}

startPlaybackButton.addEventListener("click", () => {
  openPlayer();
  togglePlayback();
});

bigPlayButton.addEventListener("click", togglePlayback);
playPauseButton.addEventListener("click", togglePlayback);
prevButton.addEventListener("click", () => nudgeTime(-10));
nextButton.addEventListener("click", () => nudgeTime(10));

volumeBar.addEventListener("input", (event) => {
  const value = Number(event.target.value);
  video.volume = THREE.MathUtils.clamp(value / 100, 0, 1);
  video.muted = video.volume === 0;
  updateVolumeButtonState();
  revealUi();
});

volumeButton.addEventListener("click", () => {
  if (video.muted || video.volume === 0) {
    video.muted = false;
    if (video.volume === 0) {
      video.volume = 1;
    }
  } else {
    video.muted = true;
  }
  updateVolumeUi();
  updateVolumeButtonState();
  revealUi();
});

fullscreenButton.addEventListener("click", toggleFullscreen);
backButton.addEventListener("click", returnToLanding);

if (vrButton) {
  vrButton.addEventListener("click", () => {
    if (isVr180Mode()) {
      state.stereoView = !state.stereoView;
      applyProjectionMode();
    }
    controls.enabled = true;
    controls.update();
    revealUi();
  });
}

viewer.addEventListener("wheel", handleViewerWheel, { passive: false });
viewer.addEventListener("touchstart", handleTouchStart, { passive: true });
viewer.addEventListener("touchmove", handleTouchMove, { passive: false });
viewer.addEventListener("touchend", handleTouchEnd, { passive: true });
viewer.addEventListener("touchcancel", handleTouchEnd, { passive: true });
viewer.addEventListener("pointermove", () => {
  if (state.isPlaying) {
    revealUi();
  }
}, { passive: true });
viewer.addEventListener("click", (event) => {
  if (event.target.closest("button, input, select, option, label")) {
    return;
  }
  if (!state.isPlaying) {
    return;
  }
  if (state.uiVisible) {
    clearUiHideTimer();
    setUiVisible(false);
  } else {
    revealUi();
  }
});

qualitySelect.addEventListener("change", (event) => {
  const { value } = event.target;
  if (!state.hls) {
    return;
  }
  const targetHeight = Number(value);
  const levelIndex = state.hls.levels.findIndex((level) => level.height === targetHeight);
  if (levelIndex >= 0) {
    state.hls.currentLevel = levelIndex;
    updateAdaptiveBadge();
    revealUi();
  }
});

video.addEventListener("play", () => {
  state.isPlaying = true;
  updatePlayButtons();
  scheduleUiHide();
});

video.addEventListener("pause", () => {
  state.isPlaying = false;
  updatePlayButtons();
  clearUiHideTimer();
  setUiVisible(true);
});

video.addEventListener("loadedmetadata", () => {
  updateTimeUi();
  applyProjectionMode();
});
video.addEventListener("timeupdate", updateTimeUi);
video.addEventListener("ended", () => {
  state.isPlaying = false;
  updatePlayButtons();
  clearUiHideTimer();
  setUiVisible(true);
  playerCenterOverlay.style.display = "grid";
  setOverlayMessage("Просмотр завершен", "Можно запустить ролик снова.");
});

seekBar.addEventListener("input", (event) => {
  if (!Number.isFinite(video.duration) || video.duration <= 0) {
    return;
  }
  const value = Number(event.target.value);
  video.currentTime = (value / 100) * video.duration;
  revealUi();
});

window.addEventListener("resize", resizeViewer);

document.addEventListener("keydown", (event) => {
  if (event.code === "Space") {
    event.preventDefault();
    togglePlayback();
  }
  if (state.isPlaying) {
    revealUi();
  }
});

loadVideoSource();
updatePlayButtons();
updateTimeUi();
updateVolumeUi();
applyProjectionMode();
resizeViewer();
animate();
