const sceneData = {
  live: {
    state: "Live",
    score: "4 - 1",
    meta: "Abyss • Maps 0-0 • BO3"
  },
  widget: {
    state: "Live",
    score: "4 - 1",
    meta: "Abyss • Maps 0-0 • BO3"
  },
  privacy: {
    state: "Privacy posture",
    score: "App settings",
    meta: "Tracked teams, preferences, and delivery tokens"
  }
};

const sceneButtons = document.querySelectorAll("[data-scene-target]");
const sceneState = document.getElementById("scene-state");
const sceneScore = document.getElementById("scene-score");
const sceneMeta = document.getElementById("scene-meta");
const lockTime = document.getElementById("lock-time");

const formatLockTime = (date) =>
  date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });

const syncLockTime = () => {
  if (!lockTime) {
    return;
  }

  lockTime.textContent = formatLockTime(new Date());
};

const scheduleLockTimeSync = () => {
  syncLockTime();

  const now = new Date();
  const delayUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();

  window.setTimeout(() => {
    syncLockTime();
    window.setInterval(syncLockTime, 60_000);
  }, delayUntilNextMinute);
};

scheduleLockTimeSync();

for (const button of sceneButtons) {
  button.addEventListener("click", () => {
    const scene = button.dataset.sceneTarget;
    const payload = sceneData[scene];
    if (!payload) {
      return;
    }

    document.body.dataset.scene = scene;
    sceneButtons.forEach((candidate) => {
      candidate.classList.toggle("is-active", candidate === button);
    });

    sceneState.textContent = payload.state;
    sceneScore.textContent = payload.score;
    sceneMeta.textContent = payload.meta;
  });
}
