function initTestimonials() {
  const carousel = document.getElementById('testimonials-carousel');
  if (!carousel || carousel.dataset.initialized) return;
  carousel.dataset.initialized = 'true';
  const region = carousel.parentElement!;
  const slides = [...carousel.querySelectorAll<HTMLElement>('.testimonial-slide')];
  const dots = [...region.querySelectorAll<HTMLButtonElement>('.testimonial-dot')];
  if (slides.length < 2) return;
  let current = 0;
  const select = (index: number, focus = false) => {
    current = (index + slides.length) % slides.length;
    slides.forEach((slide, i) => {
      const active = i === current;
      slide.classList.toggle('opacity-0', !active);
      slide.classList.toggle('absolute', !active);
      slide.classList.toggle('opacity-100', active);
      slide.inert = !active;
      slide.setAttribute('aria-hidden', String(!active));
    });
    dots.forEach((dot, i) => {
      dot.setAttribute('aria-selected', String(i === current));
      dot.tabIndex = i === current ? 0 : -1;
    });
    if (focus) dots[current]?.focus();
  };
  dots.forEach((dot, index) => {
    dot.addEventListener('click', () => select(index));
    dot.addEventListener('keydown', event => {
      const target = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: dots.length - 1 }[event.key];
      if (target === undefined) return;
      event.preventDefault();
      select(target, true);
    });
  });
  region.querySelector('#testimonials-next')?.addEventListener('click', () => select(current + 1));
}

document.addEventListener('astro:page-load', initTestimonials);
initTestimonials();
