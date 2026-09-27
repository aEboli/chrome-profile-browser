"use strict";

const INTERFACE_ZOOM_MIN = 50;
const INTERFACE_ZOOM_MAX = 200;
const INTERFACE_ZOOM_STEP = 10;
const INTERFACE_ZOOM_TOAST_MS = 2500;

function nextInterfaceZoomPercentage(current, direction) {
  const step = Math.sign(Number(direction)) * INTERFACE_ZOOM_STEP;
  return Math.max(INTERFACE_ZOOM_MIN, Math.min(INTERFACE_ZOOM_MAX, Number(current) + step));
}

function createInterfaceZoom({ targetWindow = window, indicator, applyZoom }) {
  let percentage = 100;
  let leftControlDown = false;
  let hideTimer = 0;

  function update(nextPercentage) {
    percentage = Math.max(INTERFACE_ZOOM_MIN, Math.min(INTERFACE_ZOOM_MAX, nextPercentage));
    if (typeof applyZoom === "function") void Promise.resolve(applyZoom(percentage / 100)).catch(() => {});
    if (indicator) {
      indicator.textContent = `${percentage}%`;
      indicator.hidden = false;
      targetWindow.clearTimeout(hideTimer);
      hideTimer = targetWindow.setTimeout(() => { indicator.hidden = true; }, INTERFACE_ZOOM_TOAST_MS);
    }
  }

  function step(direction) {
    update(nextInterfaceZoomPercentage(percentage, direction));
  }

  function reset() {
    update(100);
  }

  function onKeyDown(event) {
    if (event.code === "ControlLeft") {
      leftControlDown = true;
      return;
    }
    if (!event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) return;
    if (event.code !== "Digit0" && event.code !== "Numpad0") return;
    event.preventDefault();
    if (leftControlDown) reset();
  }

  function onKeyUp(event) {
    if (event.code === "ControlLeft") leftControlDown = false;
  }

  function onWheel(event) {
    if (!event.ctrlKey || event.deltaY === 0) return;
    event.preventDefault();
    if (!leftControlDown || event.shiftKey || event.altKey || event.metaKey) return;
    step(event.deltaY < 0 ? 1 : -1);
  }

  targetWindow.addEventListener("keydown", onKeyDown, true);
  targetWindow.addEventListener("keyup", onKeyUp, true);
  targetWindow.addEventListener("wheel", onWheel, { capture: true, passive: false });
  targetWindow.addEventListener("blur", () => { leftControlDown = false; });

  return {
    reset,
    step,
    getPercentage: () => percentage,
    setLeftControlDown: (down) => { leftControlDown = Boolean(down); },
  };
}

const interfaceZoomApi = { createInterfaceZoom, nextInterfaceZoomPercentage };
if (typeof module !== "undefined" && module.exports) module.exports = interfaceZoomApi;
if (typeof window !== "undefined") window.interfaceZoom = interfaceZoomApi;
