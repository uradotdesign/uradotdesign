import { prefersReducedMotion, watchReducedMotion } from './reduced-motion.js';

const videos = () => [...document.querySelectorAll<HTMLVideoElement>('.hero-video[data-is-video="true"]')];
const button = () => document.getElementById('video-control');

function draw() {
  const control = button();
  const playing = control?.dataset.state === 'playing';
  const pause = document.getElementById('pause-icon');
  const play = document.getElementById('play-icon');
  if (pause) pause.style.display = playing ? 'block' : 'none';
  if (play) play.style.display = playing ? 'none' : 'block';
  control?.setAttribute('aria-pressed', String(!playing));
  document.dispatchEvent(new CustomEvent(playing ? 'hero-video-playing' : 'hero-video-paused'));
}

function update() {
  const control = button();
  if (!control) return;
  control.dataset.state ||= prefersReducedMotion() ? 'paused' : 'playing';
  const dark = document.documentElement.classList.contains('dark');
  const activeId = dark ? 'hero-media-dark' : 'hero-media-light';
  const active = document.getElementById(activeId);
  control.style.display = active instanceof HTMLVideoElement ? 'flex' : 'none';
  for (const video of videos()) {
    if (video.id !== activeId || control.dataset.state !== 'playing' || document.hidden) {
      video.pause();
      continue;
    }
    video.muted = true;
    void video.play().then(() => {
      // A play promise may settle after navigation, a theme switch or Pause.
      if (!video.isConnected || button() !== control || control.dataset.state !== 'playing' || document.hidden ||
          document.documentElement.classList.contains('dark') !== dark) video.pause();
    }).catch(() => {
      if (video.isConnected && button() === control) {
        control.dataset.state = 'paused';
        draw();
      }
    });
  }
  draw();
}

document.addEventListener('click', event => {
  if (!(event.target as Element).closest('#video-control')) return;
  const control = button();
  if (!control) return;
  control.dataset.state = control.dataset.state === 'paused' ? 'playing' : 'paused';
  update();
});
watchReducedMotion((reduce: boolean) => {
  if (reduce && button()) button()!.dataset.state = 'paused';
  update();
});
document.addEventListener('astro:before-swap', () => videos().forEach(video => video.pause()));
document.addEventListener('astro:page-load', update);
document.addEventListener('theme-changed', update);
document.addEventListener('visibilitychange', update);
update();
