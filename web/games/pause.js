// Calls `pause` when the page loses focus, e.g. the user clicks back into the Claude
// session beside the browser pane, or switches tab. Games resume explicitly.
export const pauseOnBlur = (pause) => {
  window.addEventListener('blur', pause);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
  });
};
