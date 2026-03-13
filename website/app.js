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
