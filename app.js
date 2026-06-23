// ===== HELLO KITTY ADHD TIMER - App Logic =====

// --- State ---
const state = {
    totalSeconds: 0,
    remainingSeconds: 0,
    isRunning: false,
    isPaused: false,
    intervalId: null,
    currentTheme: null,
    stagesRevealed: 0,
    alertsPlayed: { stage: false, twoMin: false, done: false },
    wakeLock: null
};

// --- DOM Elements ---
const progressCircle = document.getElementById('progressCircle');
const timeDisplay = document.getElementById('timeDisplay');
const character = document.getElementById('character');
const sceneElements = document.getElementById('sceneElements');
const particles = document.getElementById('particles');
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resetBtn = document.getElementById('resetBtn');
const statusEl = document.getElementById('status');
const customInputContainer = document.getElementById('customInput');
const customMinutesInput = document.getElementById('customMinutes');
const customSetBtn = document.getElementById('customSetBtn');
const presetBtns = document.querySelectorAll('.preset-btn');
const presetsSection = document.getElementById('presetsSection');
const app = document.querySelector('.app');

function hidePresets() {
    presetsSection.classList.add('hidden');
}

function showPresets() {
    presetsSection.classList.remove('hidden');
}

// --- Constants ---
const RING_CIRCUMFERENCE = 2 * Math.PI * 120; // ~753.98

// --- Audio Context (Web Audio API) ---
let audioCtx = null;

function getAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
}

// --- Wake Lock (prevent screen/PC from sleeping) ---
async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            state.wakeLock = await navigator.wakeLock.request('screen');
            state.wakeLock.addEventListener('release', () => {
                state.wakeLock = null;
            });
        }
    } catch (err) {
        // Wake Lock failed (e.g., low battery, tab not visible)
        console.log('Wake Lock failed:', err.message);
    }
}

async function releaseWakeLock() {
    if (state.wakeLock) {
        await state.wakeLock.release();
        state.wakeLock = null;
    }
}

// Re-acquire wake lock when tab becomes visible again
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.isRunning) {
        requestWakeLock();
    }
});

// --- Sound Functions ---
function playTone(frequency, duration, volume = 0.3, type = 'sine') {
    const ctx = getAudioContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);

    gainNode.gain.setValueAtTime(volume, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration);
}

function playSingleDing() {
    // Soft high-pitched bell sound
    playTone(880, 0.4, 0.25);
    playTone(1320, 0.3, 0.15);
}

function playDoubleDing() {
    // Two gentle chimes
    playTone(880, 0.3, 0.3);
    setTimeout(() => playTone(1100, 0.3, 0.3), 200);
}

function playCompletionChime() {
    // Ascending 3-note melody (music box style)
    const ctx = getAudioContext();
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
    notes.forEach((freq, i) => {
        setTimeout(() => playTone(freq, 0.5, 0.3), i * 250);
    });
    // Final sparkle
    setTimeout(() => playTone(1046.5, 0.8, 0.2), 800); // C6
}

// --- Character Images Per Theme ---
// Drop these PNGs into the folder to replace placeholders:
//   hello-kitty-baking.png
//   hello-kitty-painting.png
//   hello-kitty-gardening.png
//   hello-kitty-reading.png
//   hello-kitty.png (default/custom)
const characterConfigs = {
    baking:    { image: 'hello-kitty-baking.png',    icon: '🍪', text: 'Baking!' },
    painting:  { image: 'hello-kitty-painting.png',  icon: '🎨', text: 'Painting!' },
    gardening: { image: 'hello-kitty-gardening.png', icon: '🌸', text: 'Gardening!' },
    reading:   { image: 'hello-kitty-reading.png',   icon: '📖', text: 'Reading!' },
    custom:    { image: 'hello-kitty.png',           icon: '⏱️', text: 'Focus!' }
};

const characterImg = document.getElementById('characterImg');
const characterPlaceholder = document.getElementById('characterPlaceholder');
const placeholderIcon = document.getElementById('placeholderIcon');
const placeholderText = document.getElementById('placeholderText');

function setCharacterImage(theme) {
    const config = characterConfigs[theme] || characterConfigs.custom;

    // Try to load the image
    characterImg.src = config.image;
    characterImg.style.display = '';
    characterPlaceholder.style.display = 'none';

    // Update placeholder fallback (shown if image fails to load)
    placeholderIcon.textContent = config.icon;
    placeholderText.textContent = config.text;
}

// --- Scene Builders ---
const sceneConfigs = {
    baking: {
        elements: ['🍪', '🧁', '🍪', '🍩', '🥐'],
        className: 'scene-cookie'
    },
    painting: {
        elements: [null, null, null, null, null],
        className: 'scene-paint'
    },
    gardening: {
        elements: ['🌷', '🌻', '🌹', '🌺', '🌼'],
        className: 'scene-flower'
    },
    reading: {
        elements: ['📕', '📗', '📘', '📙', '📓'],
        className: 'scene-book'
    }
};

function buildScene(theme) {
    sceneElements.innerHTML = '';

    if (!theme || theme === 'custom') return;

    const config = sceneConfigs[theme];
    if (!config) return;

    for (let i = 0; i < 5; i++) {
        const el = document.createElement('div');
        el.className = config.className;

        if (theme === 'painting') {
            // Paint blobs are just colored divs (styled in CSS)
        } else {
            el.textContent = config.elements[i];
        }

        sceneElements.appendChild(el);
    }
}

function revealSceneStage(stage) {
    // Reveal elements one by one as stages progress (0-4)
    const elements = sceneElements.children;
    if (stage < elements.length) {
        elements[stage].classList.add('visible');
    }
}

// --- Progress Ring ---
function setProgress(fraction) {
    // fraction: 0 (full) to 1 (empty)
    const offset = RING_CIRCUMFERENCE * fraction;
    progressCircle.style.strokeDashoffset = offset;
}

function setRingStage(stageNum) {
    app.classList.remove('ring-stage-1', 'ring-stage-2', 'ring-stage-3', 'ring-stage-4');
    if (stageNum >= 1 && stageNum <= 4) {
        app.classList.add(`ring-stage-${stageNum}`);
    }
}

// --- Time Formatting ---
function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// --- Character State ---
function setCharacterState(stateName) {
    character.className = 'character-container';
    if (stateName) {
        character.classList.add(`character-${stateName}`);
    }
}

// --- Particles ---
function spawnParticles() {
    const emojis = ['💖', '✨', '🎀', '💕', '⭐', '🌟', '♡', '💗'];
    for (let i = 0; i < 15; i++) {
        setTimeout(() => {
            const particle = document.createElement('div');
            particle.className = 'particle';
            particle.textContent = emojis[Math.floor(Math.random() * emojis.length)];
            particle.style.left = Math.random() * 100 + 'vw';
            particle.style.top = '-20px';
            particle.style.animationDuration = (1.5 + Math.random() * 1.5) + 's';
            particles.appendChild(particle);

            setTimeout(() => particle.remove(), 3000);
        }, i * 100);
    }
}

// --- Pulse Ring ---
function pulseRing() {
    app.classList.add('ring-pulse');
    setTimeout(() => app.classList.remove('ring-pulse'), 1600);
}

// --- Timer Logic ---
function tick() {
    if (state.remainingSeconds <= 0) {
        completeTimer();
        return;
    }

    state.remainingSeconds--;
    updateDisplay();
    checkAlerts();
    updateStages();
}

function updateDisplay() {
    const fraction = 1 - (state.remainingSeconds / state.totalSeconds);
    setProgress(fraction);
    timeDisplay.textContent = formatTime(state.remainingSeconds);
}

// Stage thresholds - first element appears early for quick feedback
const STAGE_THRESHOLDS = [0.05, 0.25, 0.50, 0.75, 0.95];

function updateStages() {
    const elapsed = state.totalSeconds - state.remainingSeconds;
    const fraction = elapsed / state.totalSeconds;

    // Reveal scene elements at threshold points
    if (state.currentTheme !== 'custom') {
        for (let i = 0; i < STAGE_THRESHOLDS.length; i++) {
            if (fraction >= STAGE_THRESHOLDS[i] && i >= state.stagesRevealed) {
                state.stagesRevealed = i + 1;
                revealSceneStage(i);
            }
        }
    }

    // Update ring color (4 stages)
    const ringStage = Math.min(4, Math.floor(fraction * 4) + 1);
    setRingStage(ringStage);
}

function checkAlerts() {
    const remaining = state.remainingSeconds;
    const total = state.totalSeconds;

    // Stage alert: at 60% elapsed
    if (!state.alertsPlayed.stage && remaining <= total * 0.4) {
        state.alertsPlayed.stage = true;
        playSingleDing();
        pulseRing();
        setCharacterState('alert');
        setStatus('Keep going, you\'re doing great! 🌟');
        setTimeout(() => {
            if (state.isRunning) setCharacterState('running');
        }, 1000);
    }

    // 2 min warning
    if (!state.alertsPlayed.twoMin && remaining <= 120 && total > 180) {
        state.alertsPlayed.twoMin = true;
        playDoubleDing();
        pulseRing();
        setCharacterState('alert');
        setStatus('Almost done! 2 minutes left! 💪');
        setTimeout(() => {
            if (state.isRunning) setCharacterState('running');
        }, 1000);
    }

    // 30 second warning for short timers
    if (!state.alertsPlayed.twoMin && remaining <= 30 && total <= 180) {
        state.alertsPlayed.twoMin = true;
        playDoubleDing();
        pulseRing();
        setCharacterState('alert');
        setStatus('30 seconds left! Almost there! ✨');
        setTimeout(() => {
            if (state.isRunning) setCharacterState('running');
        }, 1000);
    }
}

function completeTimer() {
    clearInterval(state.intervalId);
    state.isRunning = false;
    state.isPaused = false;
    releaseWakeLock();

    // Final scene stage
    if (state.currentTheme !== 'custom') {
        revealSceneStage(4);
    }

    setProgress(1);
    timeDisplay.textContent = '00:00';
    setCharacterState('done');
    playCompletionChime();
    spawnParticles();
    setStatus('Amazing job! You did it! 🎉💖');

    startBtn.disabled = true;
    pauseBtn.disabled = true;
    resetBtn.disabled = false;
    pauseBtn.textContent = 'Pause';
}

// --- Controls ---
function startTimer() {
    if (state.totalSeconds === 0) {
        setStatus('Pick a timer first! ♡');
        return;
    }

    if (state.isPaused) {
        // Resume
        state.isPaused = false;
        state.isRunning = true;
        state.intervalId = setInterval(tick, 1000);
        setCharacterState('running');
        startBtn.disabled = true;
        pauseBtn.disabled = false;
        requestWakeLock();
        hidePresets();
        setStatus('Let\'s keep going! 💕');
        return;
    }

    // Fresh start
    state.remainingSeconds = state.totalSeconds;
    state.isRunning = true;
    state.isPaused = false;
    state.stagesRevealed = 0;
    state.alertsPlayed = { stage: false, twoMin: false, done: false };

    // Prevent screen from locking
    requestWakeLock();

    // Hide presets while timer is running
    hidePresets();

    updateDisplay();
    setCharacterState('running');
    buildScene(state.currentTheme);
    pulseRing(); // Immediate visual feedback that timer started

    state.intervalId = setInterval(tick, 1000);

    startBtn.disabled = true;
    pauseBtn.disabled = false;
    resetBtn.disabled = false;

    const themeNames = {
        baking: 'Baking time! 🍪',
        painting: 'Let\'s paint! 🎨',
        gardening: 'Growing something beautiful! 🌸',
        reading: 'Reading adventure! 📖',
        custom: 'Focus time! ⏱️'
    };
    setStatus(themeNames[state.currentTheme] || 'Here we go! ♡');
}

function pauseTimer() {
    if (!state.isRunning) return;

    clearInterval(state.intervalId);
    state.isRunning = false;
    state.isPaused = true;
    releaseWakeLock();
    showPresets();

    setCharacterState('idle');
    startBtn.disabled = false;
    startBtn.textContent = 'Resume';
    pauseBtn.disabled = true;
    setStatus('Paused — take your time ♡');
}

function resetTimer() {
    clearInterval(state.intervalId);
    state.isRunning = false;
    state.isPaused = false;
    state.remainingSeconds = 0;
    state.totalSeconds = 0;
    state.stagesRevealed = 0;
    state.currentTheme = null;
    state.alertsPlayed = { stage: false, twoMin: false, done: false };
    releaseWakeLock();
    showPresets();

    setProgress(0);
    timeDisplay.textContent = '00:00';
    setCharacterState('idle');
    sceneElements.innerHTML = '';

    // Reset character to default
    characterImg.src = '';
    characterImg.style.display = 'none';
    characterPlaceholder.style.display = 'flex';
    placeholderIcon.textContent = '🎀';
    placeholderText.textContent = 'Pick a timer!';

    // Remove theme classes
    app.className = 'app';

    startBtn.disabled = false;
    startBtn.textContent = 'Start';
    pauseBtn.disabled = true;
    resetBtn.disabled = true;
    pauseBtn.textContent = 'Pause';

    // Clear active preset
    presetBtns.forEach(btn => btn.classList.remove('active'));
    customInputContainer.style.display = 'none';

    setStatus('Pick a timer to start! ♡');
}

// --- Preset Selection ---
function selectPreset(btn) {
    const minutes = parseInt(btn.dataset.minutes);
    const theme = btn.dataset.theme;

    // Reset if currently running
    if (state.isRunning || state.isPaused) {
        clearInterval(state.intervalId);
        state.isRunning = false;
        state.isPaused = false;
    }

    // Update active state
    presetBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // Remove old theme
    app.className = 'app';

    if (theme === 'custom') {
        customInputContainer.style.display = 'flex';
        state.totalSeconds = 0;
        state.currentTheme = 'custom';
        setCharacterImage('custom');
        setStatus('Enter your minutes! ♡');
        startBtn.disabled = true;
    } else {
        customInputContainer.style.display = 'none';
        state.totalSeconds = minutes * 60;
        state.remainingSeconds = state.totalSeconds;
        state.currentTheme = theme;

        // Apply theme & swap character image
        app.classList.add(`theme-${theme}`);
        setCharacterImage(theme);

        timeDisplay.textContent = formatTime(state.totalSeconds);
        setProgress(0);
        setCharacterState('idle');
        startBtn.disabled = false;
        startBtn.textContent = 'Start';
        resetBtn.disabled = false;

        setStatus(`${minutes} minutes — ready when you are! ♡`);
    }
}

function setCustomDuration() {
    const minutes = parseInt(customMinutesInput.value);
    if (!minutes || minutes < 1 || minutes > 120) {
        setStatus('Enter 1–120 minutes! ♡');
        return;
    }

    state.totalSeconds = minutes * 60;
    state.remainingSeconds = state.totalSeconds;
    state.currentTheme = 'custom';

    timeDisplay.textContent = formatTime(state.totalSeconds);
    setProgress(0);
    setCharacterState('idle');
    startBtn.disabled = false;
    startBtn.textContent = 'Start';
    resetBtn.disabled = false;

    setStatus(`${minutes} minutes — let's do this! ⏱️`);
}

// --- Status ---
function setStatus(text) {
    statusEl.textContent = text;
}

// --- Event Listeners ---
startBtn.addEventListener('click', startTimer);
pauseBtn.addEventListener('click', pauseTimer);
resetBtn.addEventListener('click', resetTimer);
customSetBtn.addEventListener('click', setCustomDuration);

customMinutesInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') setCustomDuration();
});

presetBtns.forEach(btn => {
    btn.addEventListener('click', () => selectPreset(btn));
});

// --- Initialize ---
setProgress(0);
setCharacterState('idle');
progressCircle.style.strokeDasharray = RING_CIRCUMFERENCE;
